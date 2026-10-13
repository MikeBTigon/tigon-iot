// Insights — /mp/inbox: two-way texting inbox. Conversations by customer phone from mp_sms (our texts) and
// mp_sms_inbound (their replies). Salespeople see their own leads' conversations; managers see everyone's (30 days).
// Read markers: mp_inbox_reads/{uid}_{digits} {uid, phone, readAt}.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert, Badge, Box, Button, Chip, CircularProgress, IconButton, List, ListItemButton, ListItemText, Paper, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { ArrowBack, AutoAwesome, Forum, Phone, Send, Timeline } from '@mui/icons-material';
import { collection, doc, getDoc, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { isManager, useLeads } from '../crm/crmData';
import { SALES_COLLECTIONS } from '../sales/salesTypes';
import { notify } from '../../ui/notify';
import { storeName } from '../sales/closing/closingUtils';
import { groupConversations, readDocId, type Conversation, type InText, type LeadLite, type OutText } from './inboxLogic';
import { displayPhone, toE164 } from './phone';
import { useLive } from './useLive';
import { aiReply, sendTextSmart, useAiEnabled } from './insightsApi';

export const INBOX_READS = 'mp_inbox_reads';
const DAY = 86_400_000;

const timeShort = (ts: number) => {
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const STATUS: Record<string, string> = { queued: 'Waiting to send', sending: 'Sending…', failed: 'Not delivered', skipped: 'Not sent (opted out)' };

/** Conversations this person may see, live. */
function useConversations() {
  const { currentUser } = useAuth();
  const { profile } = useMp();
  const uid = currentUser?.uid || '';
  const manager = isManager(profile);
  // Day-granular cutoff keeps the query key stable for the whole day.
  const cutoff = Math.floor((Date.now() - 30 * DAY) / DAY) * DAY;
  const sms = collection(db, SALES_COLLECTIONS.sms);
  const outAll = useLive<OutText & { id: string }>(`out_all_${cutoff}`, uid && manager ? query(sms, where('createdAt', '>=', cutoff)) : null);
  const outOwn = useLive<OutText & { id: string }>(`out_own_${uid}`, uid && !manager ? query(sms, where('ownerUid', '==', uid)) : null);
  const outMine = useLive<OutText & { id: string }>(`out_mine_${uid}`, uid && !manager ? query(sms, where('createdBy', '==', uid)) : null);
  const ins = useLive<InText & { id: string }>(`in_${cutoff}`, uid ? query(collection(db, SALES_COLLECTIONS.smsInbound), where('receivedAt', '>=', cutoff)) : null);
  const reads = useLive<{ id: string; phone: string; readAt: number }>(`reads_${uid}`, uid ? query(collection(db, INBOX_READS), where('uid', '==', uid)) : null);
  const { leads } = useLeads(profile);

  const { convs, byId } = useMemo(() => {
    const byPhone: Record<string, LeadLite> = {};
    const byId: Record<string, LeadLite> = {};
    for (const l of [...leads].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))) {
      const e = toE164(l.phone);
      const lite: LeadLite = { id: l.id, name: l.name, ownerUid: l.ownerUid, locationId: (l as { locationId?: string }).locationId, cartId: l.cartId, cartTitle: l.cartTitle, status: l.status };
      if (e) byPhone[e] = lite;
      byId[l.id] = lite;
    }
    const seen = new Map<string, OutText>();
    for (const o of [...outAll.rows, ...outOwn.rows, ...outMine.rows]) if (Number(o.createdAt) >= cutoff) seen.set(o.id, o);
    const outs = [...seen.values()];
    const myPhones = new Set(outs.map((o) => toE164(o.to)));
    // Salespeople: replies on their leads (by lead id or by the number of a lead they own / a text they sent).
    const inbound = manager ? ins.rows : ins.rows.filter((i) => {
      const e = toE164(i.from);
      return (i.leadId && byId[i.leadId]) || myPhones.has(e) || byPhone[e];
    });
    const readAt: Record<string, number> = {};
    for (const r of reads.rows) readAt[toE164(r.phone)] = Number(r.readAt) || 0;
    // Reply's lead id → its lead (when the phone is stored differently).
    for (const i of inbound) {
      const e = toE164(i.from);
      if (e && !byPhone[e] && i.leadId && byId[i.leadId]) byPhone[e] = byId[i.leadId];
    }
    return { convs: groupConversations(outs, inbound, readAt, byPhone), byId };
  }, [outAll.rows, outOwn.rows, outMine.rows, ins.rows, reads.rows, leads, manager, cutoff]);

  const loaded = outAll.loaded && outOwn.loaded && outMine.loaded && ins.loaded;
  const error = outAll.error || outOwn.error || outMine.error || ins.error;
  return { convs, leadsById: byId, loaded, error, uid, manager };
}

const ChatView: React.FC<{ conv: Conversation; lead?: LeadLite; uid: string; onBack?: () => void }> = ({ conv, lead, uid, onBack }) => {
  const { profile, userName, carts } = useMp();
  const ai = useAiEnabled();
  const [draft, setDraft] = useState<{ phone: string; text: string }>({ phone: conv.phone, text: '' });
  const [busy, setBusy] = useState<'' | 'send' | 'ai'>('');
  const [optedOut, setOptedOut] = useState<{ phone: string; out: boolean } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const text = draft.phone === conv.phone ? draft.text : '';
  const setText = (t: string) => setDraft({ phone: conv.phone, text: t });

  useEffect(() => {
    let live = true;
    getDoc(doc(db, SALES_COLLECTIONS.smsOptOut, conv.phone)).then((s) => { if (live) setOptedOut({ phone: conv.phone, out: s.exists() }); })
      .catch(() => { if (live) setOptedOut({ phone: conv.phone, out: false }); });
    return () => { live = false; };
  }, [conv.phone]);

  // Mark as read when opened (and when new replies arrive while it is open).
  useEffect(() => {
    if (!uid || !conv.unread) return;
    setDoc(doc(db, INBOX_READS, readDocId(uid, conv.phone)), { uid, phone: conv.phone, readAt: Date.now() }).catch(() => undefined);
  }, [uid, conv.phone, conv.unread, conv.lastAt]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [conv.phone, conv.messages.length]);

  const isOut = optedOut?.phone === conv.phone && optedOut.out;
  const send = async () => {
    if (!text.trim()) return;
    setBusy('send');
    try {
      await sendTextSmart({ to: conv.phone, body: text.trim(), leadId: conv.leadId, storeId: profile?.location || '', createdBy: uid });
      setText('');
      notify('Text queued — it goes out within a minute.', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy('');
    }
  };
  const draftAi = async () => {
    setBusy('ai');
    try {
      const cart = lead?.cartId ? carts.find((c) => c.docId === lead.cartId || c.id === lead.cartId) : undefined;
      const reply = await aiReply({
        messages: conv.messages.slice(-20).map((m) => ({ dir: m.dir, body: m.body, at: m.at })),
        lead: { name: conv.name || lead?.name || '', status: lead?.status || '', cartTitle: lead?.cartTitle || '', store: storeName(lead?.locationId || profile?.location) },
        cart: cart ? { title: [cart.year, cart.make, cart.model, cart.color].filter(Boolean).join(' '), price: cart.price || null } : undefined,
        salesperson: profile?.name || '',
      });
      if (reply) setText(reply);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderBottom: 1, borderColor: 'divider' }}>
        {onBack && <IconButton onClick={onBack} aria-label="Back to conversations"><ArrowBack /></IconButton>}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }} noWrap>{conv.name || displayPhone(conv.phone)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {conv.name ? displayPhone(conv.phone) : ''}{conv.ownerUid ? `${conv.name ? ' · ' : ''}${userName(conv.ownerUid)}` : ''}
          </Typography>
        </Box>
        <IconButton href={`tel:${conv.phone}`} aria-label="Call"><Phone /></IconButton>
        <Button size="small" startIcon={<Timeline />} component={RouterLink} to={`/mp/customer/${encodeURIComponent(conv.phone)}`}>History</Button>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, bgcolor: 'action.hover', minHeight: 200 }}>
        {conv.messages.map((m) => (
          <Box key={m.id} sx={{ display: 'flex', justifyContent: m.dir === 'out' ? 'flex-end' : 'flex-start', mb: 1 }}>
            <Box sx={{
              maxWidth: '80%', px: 1.5, py: 1, borderRadius: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              bgcolor: m.dir === 'out' ? 'primary.main' : 'background.paper', color: m.dir === 'out' ? 'primary.contrastText' : 'text.primary',
              boxShadow: 1,
            }}
            >
              <Typography variant="body2">{m.body}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.75, display: 'block', textAlign: 'right' }}>
                {timeShort(m.at)}{m.dir === 'out' && m.status && STATUS[m.status] ? ` · ${STATUS[m.status]}` : ''}
              </Typography>
            </Box>
          </Box>
        ))}
        <div ref={endRef} />
      </Box>
      <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
        {isOut && <Alert severity="warning" sx={{ mb: 1 }}>This customer replied STOP. Texts to them are not sent — call instead.</Alert>}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
          <TextField
            fullWidth multiline maxRows={5} size="small" placeholder="Type a reply…" value={text} disabled={isOut}
            onChange={(e) => setText(e.target.value)} slotProps={{ htmlInput: { maxLength: 1200 } }}
          />
          <Button variant="contained" onClick={send} disabled={!text.trim() || !!busy || isOut} startIcon={busy === 'send' ? <CircularProgress size={16} /> : <Send />}>
            Send
          </Button>
        </Stack>
        {ai && (
          <Button size="small" sx={{ mt: 0.5 }} startIcon={busy === 'ai' ? <CircularProgress size={14} /> : <AutoAwesome />} onClick={draftAi} disabled={!!busy || isOut}>
            AI draft
          </Button>
        )}
      </Box>
    </Box>
  );
};

const InboxPage: React.FC = () => {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const [params, setParams] = useSearchParams();
  const { convs, leadsById, loaded, error, uid, manager } = useConversations();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [q, setQ] = useState('');
  const selectedPhone = toE164(params.get('phone') || '');
  const selected = convs.find((c) => c.phone === selectedPhone) ||
    (selectedPhone ? { phone: selectedPhone, name: '', lastAt: 0, lastBody: '', lastDir: 'out' as const, unread: 0, messages: [] } : null);
  const shown = convs.filter((c) => (filter === 'all' || c.unread > 0) &&
    (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || c.phone.includes(q.replace(/\D/g, '')) || c.lastBody.toLowerCase().includes(q.trim().toLowerCase())));
  const open = (phone: string) => setParams((p) => { p.set('phone', phone); return p; });
  const close = () => setParams((p) => { p.delete('phone'); return p; });
  const unread = convs.filter((c) => c.unread > 0).length;

  const list = (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Box sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="Search name, number or text" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: 1, minWidth: 160 }} />
        <ToggleButtonGroup size="small" exclusive value={filter} onChange={(_e, v) => v && setFilter(v)}>
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="unread">Unread{unread ? ` (${unread})` : ''}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {!loaded && <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box>}
      {loaded && !shown.length && <Typography color="text.secondary" sx={{ p: 2 }}>{filter === 'unread' ? 'All caught up.' : 'No texts in the last 30 days.'}</Typography>}
      <List dense sx={{ overflowY: 'auto', flex: 1, py: 0 }}>
        {shown.map((c) => (
          <ListItemButton key={c.phone} selected={c.phone === selectedPhone} onClick={() => open(c.phone)} divider>
            <ListItemText
              primary={(
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Typography sx={{ fontWeight: c.unread ? 800 : 500, flex: 1 }} noWrap>{c.name || displayPhone(c.phone)}</Typography>
                  <Typography variant="caption" color="text.secondary">{timeShort(c.lastAt)}</Typography>
                  {c.unread > 0 && <Badge color="error" badgeContent={c.unread} sx={{ ml: 1.5, mr: 1 }} />}
                </Box>
              )}
              secondary={`${c.lastDir === 'out' ? 'You: ' : ''}${c.lastBody}`}
              slotProps={{ secondary: { noWrap: true } }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Forum color="primary" />
        <Typography variant="h5" color="primary" sx={{ fontWeight: 700, flexGrow: 1 }}>Texts inbox</Typography>
        {unread > 0 && <Chip color="error" size="small" label={`${unread} unread`} />}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {manager ? 'Every customer conversation from the last 30 days.' : 'Conversations with your leads from the last 30 days.'} Replies go out from your store's texting phone.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <Paper variant="outlined" sx={{ display: 'flex', height: { xs: 'calc(100vh - 260px)', md: 'calc(100vh - 230px)' }, minHeight: 420, overflow: 'hidden' }}>
        {(wide || !selected) && <Box sx={{ width: wide ? 340 : '100%', borderRight: wide ? 1 : 0, borderColor: 'divider', minHeight: 0 }}>{list}</Box>}
        {selected && <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}><ChatView key={selected.phone} conv={selected} lead={selected.leadId ? leadsById[selected.leadId] : undefined} uid={uid} onBack={wide ? undefined : close} /></Box>}
        {wide && !selected && (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">Pick a conversation.</Typography>
          </Box>
        )}
      </Paper>
    </MpShell>
  );
};

export default InboxPage;
