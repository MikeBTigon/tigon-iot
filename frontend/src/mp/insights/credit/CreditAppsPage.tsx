// Insights — /mp/credit-app[/:leadId][?app=ID]: credit applications. List, open one as a printable summary,
// download the PDF, "Send to lender" (emails the PDF), fill one in with a customer, text the link.
// Admins keep the lender list (mp_settings/credit {lenders: [{name, email}]}).
import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Add, Close, ContentCopy, Delete, Description, Download, Print, Send, Sms, Timeline } from '@mui/icons-material';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useAuth } from '../../../context/AuthContext';
import MpShell from '../../components/MpShell';
import { useMp } from '../../MpDataContext';
import { notify } from '../../../ui/notify';
import { storeName } from '../../sales/closing/closingUtils';
import { SALES_PUBLIC_ORIGIN } from '../../sales/salesData';
import { displayPhone, customerPath } from '../phone';
import { useLive } from '../useLive';
import { sendCreditToLender, sendTextSmart } from '../insightsApi';
import CreditForm, { type CreditFormValues } from './CreditForm';
import {
  CREDIT_APPS, CREDIT_SETTINGS_DOC, CREDIT_STATUS_COLOR, CREDIT_STATUS_LABEL, creditSections, type CreditApp, type CreditStatus, type Lender,
} from './creditShared';
import { creditPdfBase64, downloadCreditPdf } from './creditPdf';

const applyUrl = (store?: string, lead?: string) => {
  const q = [store ? `store=${encodeURIComponent(store)}` : '', lead ? `lead=${encodeURIComponent(lead)}` : ''].filter(Boolean).join('&');
  return `${SALES_PUBLIC_ORIGIN}/apply${q ? `?${q}` : ''}`;
};
const money = (n?: number) => (n ? `$${Math.round(n).toLocaleString('en-US')}` : '');
const STATUSES: CreditStatus[] = ['new', 'sent', 'needs_info', 'approved', 'declined'];

function useLenders(): Lender[] {
  const [lenders, setLenders] = useState<Lender[]>([]);
  useEffect(() => onSnapshot(doc(db, 'mp_settings', CREDIT_SETTINGS_DOC), (s) => {
    const list = s.exists() && Array.isArray(s.data().lenders) ? (s.data().lenders as Lender[]) : [];
    setLenders(list.filter((l) => l && typeof l.email === 'string'));
  }, () => setLenders([])), []);
  return lenders;
}

const LendersEditor: React.FC<{ lenders: Lender[] }> = ({ lenders }) => {
  const [rows, setRows] = useState<Lender[] | null>(null);
  const list = rows ?? lenders;
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const clean = list.map((l) => ({ name: l.name.trim(), email: l.email.trim().toLowerCase() })).filter((l) => l.email);
    if (clean.some((l) => !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(l.email))) { notify('Check the email addresses.', 'error'); return; }
    setBusy(true);
    try {
      await setDoc(doc(db, 'mp_settings', CREDIT_SETTINGS_DOC), { lenders: clean, updatedAt: Date.now() }, { merge: true });
      setRows(null);
      notify('Lenders saved', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const edit = (i: number, k: keyof Lender, v: string) => setRows(list.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Typography sx={{ fontWeight: 700 }}>Lenders (admins)</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>"Send to lender" emails the application PDF to one of these addresses.</Typography>
        <Stack spacing={1}>
          {list.map((l, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1 }}>
              <TextField size="small" label="Lender name" value={l.name} onChange={(e) => edit(i, 'name', e.target.value)} sx={{ flex: 1 }} />
              <TextField size="small" label="Email" value={l.email} onChange={(e) => edit(i, 'email', e.target.value)} sx={{ flex: 1.4 }} />
              <IconButton aria-label="Remove lender" onClick={() => setRows(list.filter((_, j) => j !== i))}><Delete /></IconButton>
            </Box>
          ))}
        </Stack>
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <Button size="small" startIcon={<Add />} onClick={() => setRows([...list, { name: '', email: '' }])}>Add lender</Button>
          <Button size="small" variant="contained" disabled={!rows || busy} onClick={save}>Save</Button>
        </Box>
      </CardContent>
    </Card>
  );
};

const AppDialog: React.FC<{ app: CreditApp; lenders: Lender[]; onClose: () => void }> = ({ app, lenders, onClose }) => {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const { userName } = useMp();
  const [lender, setLender] = useState(lenders[0]?.email || '');
  const [busy, setBusy] = useState<'' | 'pdf' | 'send' | 'status'>('');
  const chosen = lender || lenders[0]?.email || '';

  const setStatus = async (status: CreditStatus) => {
    setBusy('status');
    try {
      await updateDoc(doc(db, CREDIT_APPS, app.id), { status, updatedAt: Date.now() });
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy('');
    }
  };
  const pdf = async () => {
    setBusy('pdf');
    try {
      await downloadCreditPdf(app);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy('');
    }
  };
  const send = async () => {
    const l = lenders.find((x) => x.email === chosen);
    if (!l) return;
    if (!window.confirm(`Email this application to ${l.name || l.email}?`)) return;
    setBusy('send');
    try {
      await sendCreditToLender(app.id, l.email, await creditPdfBase64(app));
      notify(`Sent to ${l.name || l.email}`, 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <Dialog open onClose={onClose} fullScreen={phone} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>{app.firstName} {app.lastName}</Box>
        <Chip color={CREDIT_STATUS_COLOR[app.status] || 'default'} label={CREDIT_STATUS_LABEL[app.status] || app.status} />
        <IconButton aria-label="Close" onClick={onClose}><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box id="credit-print" sx={{ '@media print': { color: '#000' } }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Received {new Date(app.createdAt).toLocaleString()}{app.storeId ? ` · ${storeName(app.storeId)}` : ''}
            {app.ownerUid ? ` · ${userName(app.ownerUid)}` : ''}{app.source === 'staff' && app.createdBy ? ` · entered by ${userName(app.createdBy)}` : ''}
          </Typography>
          {app.sentAt && (
            <Alert severity="info" sx={{ mb: 1 }}>
              Sent to {app.sentTo?.name || app.sentTo?.email} on {new Date(app.sentAt).toLocaleString()}{app.sentByName ? ` by ${app.sentByName}` : ''}.
            </Alert>
          )}
          {creditSections(app).map((s) => (
            <Box key={s.title} sx={{ mb: 1.5 }}>
              <Typography sx={{ fontWeight: 700, borderBottom: 1, borderColor: 'divider', mb: 0.5 }}>{s.title}</Typography>
              {s.rows.map(([k, v]) => (
                <Box key={k} sx={{ display: 'flex', gap: 1, py: 0.25 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ width: 140, flexShrink: 0 }}>{k}</Typography>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{v}</Typography>
                </Box>
              ))}
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary">Customer agreed: "{app.consentText}"</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField select size="small" label="Status" value={app.status} onChange={(e) => setStatus(e.target.value as CreditStatus)} disabled={busy === 'status'} sx={{ minWidth: 170 }}>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{CREDIT_STATUS_LABEL[s]}</MenuItem>)}
          </TextField>
          {lenders.length > 0 ? (
            <>
              <TextField select size="small" label="Lender" value={chosen} onChange={(e) => setLender(e.target.value)} sx={{ minWidth: 200 }}>
                {lenders.map((l) => <MenuItem key={l.email} value={l.email}>{l.name || l.email}</MenuItem>)}
              </TextField>
              <Button variant="contained" startIcon={busy === 'send' ? <CircularProgress size={16} color="inherit" /> : <Send />} disabled={!!busy || !chosen} onClick={send}>
                Send to lender
              </Button>
            </>
          ) : <Typography variant="body2" color="text.secondary">No lenders yet — an admin adds them on this page.</Typography>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button startIcon={<Timeline />} component={RouterLink} to={customerPath(app.phone)}>Customer history</Button>
        <Button startIcon={<Print />} onClick={() => window.print()}>Print</Button>
        <Button startIcon={busy === 'pdf' ? <CircularProgress size={16} /> : <Download />} onClick={pdf} disabled={!!busy}>PDF</Button>
      </DialogActions>
    </Dialog>
  );
};

const CreditAppsPage: React.FC = () => {
  const { leadId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { currentUser } = useAuth();
  const { profile, isAdmin, userName } = useMp();
  const lenders = useLenders();
  const [scope, setScope] = useState<'store' | 'all'>('all');
  const [status, setStatus] = useState<CreditStatus | 'any'>('any');
  const [filling, setFilling] = useState(false);
  const [lead, setLead] = useState<{ id: string; name: string; phone: string; email: string; locationId: string; cartTitle: string } | null>(null);
  const col = collection(db, CREDIT_APPS);
  const apps = useLive<CreditApp>(`apps_${leadId}`, profile ? (leadId ? query(col, where('leadId', '==', leadId)) : query(col, orderBy('createdAt', 'desc'), limit(300))) : null);

  useEffect(() => {
    if (!leadId) return;
    let live = true;
    getDoc(doc(db, 'mp_leads', leadId)).then((s) => {
      if (!live || !s.exists()) return;
      const d = s.data();
      setLead({ id: s.id, name: String(d.name || ''), phone: String(d.phone || ''), email: String(d.email || ''), locationId: String(d.locationId || ''), cartTitle: String(d.cartTitle || '') });
    }).catch(() => undefined);
    return () => { live = false; };
  }, [leadId]);

  const rows = useMemo(() => [...apps.rows].sort((a, b) => b.createdAt - a.createdAt)
    .filter((a) => scope === 'all' || !profile?.location || a.storeId === profile.location || a.ownerUid === profile.uid)
    .filter((a) => status === 'any' || a.status === status), [apps.rows, scope, status, profile]);
  const openId = params.get('app') || '';
  const open = apps.rows.find((a) => a.id === openId);
  const setOpen = (id: string) => setParams((p) => { if (id) p.set('app', id); else p.delete('app'); return p; });

  const store = lead?.locationId || profile?.location || '';
  const link = applyUrl(store, leadId || undefined);
  const prefill: Partial<CreditFormValues> | undefined = lead ? {
    firstName: lead.name.split(/\s+/)[0] || '', lastName: lead.name.split(/\s+/).slice(1).join(' '), phone: lead.phone, email: lead.email, cartWanted: lead.cartTitle,
  } : undefined;

  const textLink = async () => {
    if (!lead?.phone || !currentUser) return;
    try {
      await sendTextSmart({
        to: lead.phone, leadId: lead.id, storeId: store, createdBy: currentUser.uid,
        body: `Hi ${lead.name.split(/\s+/)[0] || 'there'}, here's our secure financing application — it takes about 5 minutes: ${link}`,
      });
      notify('Link texted', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Description color="primary" />
        <Typography variant="h5" color="primary" sx={{ fontWeight: 700, flexGrow: 1 }}>
          Credit applications{lead ? ` — ${lead.name}` : ''}
        </Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setFilling(true)}>Fill in with customer</Button>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 1.5 }}>
        Customers apply at <b>{link.replace('https://', '')}</b>. We never collect Social Security numbers or dates of birth — the lender asks for those.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Button size="small" startIcon={<ContentCopy />} onClick={() => navigator.clipboard?.writeText(link).then(() => notify('Link copied', 'success'))}>Copy link</Button>
        {lead?.phone && <Button size="small" startIcon={<Sms />} onClick={textLink}>Text the link to {lead.name.split(/\s+/)[0] || 'customer'}</Button>}
        {leadId && <Button size="small" component={RouterLink} to="/mp/credit-app">See all applications</Button>}
      </Box>
      {isAdmin && <LendersEditor lenders={lenders} />}
      {!leadId && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          {profile?.location && (
            <ToggleButtonGroup size="small" exclusive value={scope} onChange={(_e, v) => v && setScope(v)}>
              <ToggleButton value="store">My store</ToggleButton>
              <ToggleButton value="all">All stores</ToggleButton>
            </ToggleButtonGroup>
          )}
          {(['any', ...STATUSES] as const).map((s) => (
            <Chip key={s} label={s === 'any' ? 'All' : CREDIT_STATUS_LABEL[s]} color={status === s ? 'primary' : 'default'} variant={status === s ? 'filled' : 'outlined'} onClick={() => setStatus(s)} />
          ))}
        </Box>
      )}
      {apps.error && <Alert severity="error" sx={{ mb: 2 }}>{apps.error}</Alert>}
      {!apps.loaded && <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box>}
      {apps.loaded && !rows.length && <Alert severity="info">No applications yet.</Alert>}
      <Stack spacing={1}>
        {rows.map((a) => (
          <Card key={a.id} variant="outlined">
            <CardActionArea onClick={() => setOpen(a.id)}>
              <CardContent sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', '&:last-child': { pb: 2 } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }}>{a.firstName} {a.lastName}</Typography>
                  <Typography variant="body2">{displayPhone(a.phone)} · income {money(a.monthlyIncome)}/mo{a.downPayment ? ` · ${money(a.downPayment)} down` : ''}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(a.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {a.storeId ? ` · ${storeName(a.storeId)}` : ''}{a.ownerUid ? ` · ${userName(a.ownerUid)}` : ''}{a.cartWanted ? ` · ${a.cartWanted}` : ''}
                    {a.sentAt ? ` · sent to ${a.sentTo?.name || a.sentTo?.email}` : ''}
                  </Typography>
                </Box>
                <Chip size="small" color={CREDIT_STATUS_COLOR[a.status] || 'default'} label={CREDIT_STATUS_LABEL[a.status] || a.status} />
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
      {open && <AppDialog key={open.id} app={open} lenders={lenders} onClose={() => setOpen('')} />}
      {filling && (
        <Dialog open onClose={() => setFilling(false)} fullScreen maxWidth="md">
          <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
            <Box sx={{ flex: 1 }}>Credit application</Box>
            <IconButton aria-label="Close" onClick={() => setFilling(false)}><Close /></IconButton>
          </DialogTitle>
          <DialogContent>
            <Box sx={{ maxWidth: 820, mx: 'auto', pt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Fill this in with the customer, then let them read and tick the box themselves.</Typography>
              <CreditForm
                store={store} lead={leadId} prefill={prefill}
                getToken={() => currentUser ? currentUser.getIdToken() : Promise.resolve('')}
                onDone={(r) => { setFilling(false); notify('Application saved', 'success'); setOpen(r.id); }}
              />
            </Box>
          </DialogContent>
        </Dialog>
      )}
    </MpShell>
  );
};

export default CreditAppsPage;
