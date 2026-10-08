// Track 2 (texting) — /mp/texts: every text the team sent (managers) or your own (salespeople), replies,
// numbers that opted out, and whether each store's texting phone is online.
import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, setDoc, where,
} from 'firebase/firestore';
import {
  Alert, Box, Button, Chip, FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Stack, Tab, Tabs, TextField,
  Tooltip, Typography,
} from '@mui/material';
import { Delete, PhoneAndroid } from '@mui/icons-material';
import MpShell from '../../components/MpShell';
import { db } from '../../../config/firebase';
import { useAuth } from '../../../context/AuthContext';
import { useMp } from '../../MpDataContext';
import { isManager, useNow } from '../../crm/crmData';
import { DEALERSHIPS, DEALERSHIP_BY_ID } from '../../constants';
import { notify } from '../../../ui/notify';
import { e164, useSalesSettings } from '../salesData';
import { SALES_COLLECTIONS } from '../salesTypes';
import type { SmsDoc, SmsInbound, SmsKind } from '../salesTypes';
import {
  KIND_LABEL, STATUS_COLOR, STATUS_LABEL, TEXTING_PHONE_ONLINE_MS, lastCheckIn, prettyPhone, useDevice, when,
} from './textingUi';

interface OptOut { id: string; phone?: string; at?: number; via?: string; leadId?: string }

const storeLabel = (id: string) => (id === '*' ? 'Other stores (fallback)' : DEALERSHIP_BY_ID[id]?.name || id || '—');

const PhoneRow: React.FC<{ storeId: string; deviceId: string }> = ({ storeId, deviceId }) => {
  const dev = useDevice(deviceId);
  const { userName } = useMp();
  const now = useNow(30_000);
  const last = lastCheckIn(dev);
  const online = !!last && now - last < TEXTING_PHONE_ONLINE_MS;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
      <PhoneAndroid fontSize="small" color={online ? 'success' : 'disabled'} />
      <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 140 }}>{storeLabel(storeId)}</Typography>
      <Typography variant="body2" sx={{ flexGrow: 1 }}>
        {!deviceId ? 'No texting phone yet' : dev === undefined ? '…' : dev === null ? 'Phone not found' :
          `${dev.deviceName || 'Phone'}${dev.deviceNumber ? ` #${dev.deviceNumber}` : ''} · ${userName(dev.userId)}`}
      </Typography>
      {deviceId && dev && (
        <Chip size="small" color={online ? 'success' : 'error'} label={online ? 'Online' : last ? `Offline since ${when(last)}` : 'Never checked in'} />
      )}
    </Box>
  );
};

const TextsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { profile, userName } = useMp();
  const { settings } = useSalesSettings();
  const manager = isManager(profile);
  const uid = currentUser?.uid || '';
  const [tab, setTab] = useState<'texts' | 'replies' | 'optout' | 'phones'>('texts');
  const [mine, setMine] = useState<SmsDoc[]>([]);
  const [owned, setOwned] = useState<SmsDoc[]>([]);
  const [inbound, setInbound] = useState<SmsInbound[]>([]);
  const [optOuts, setOptOuts] = useState<OptOut[]>([]);
  const [kind, setKind] = useState<'all' | SmsKind>('all');
  const [status, setStatus] = useState<'all' | SmsDoc['status']>('all');
  const [newOptOut, setNewOptOut] = useState('');
  const [error, setError] = useState('');
  const now = useNow(60_000);

  useEffect(() => {
    if (!uid || profile === undefined) return;
    const col = collection(db, SALES_COLLECTIONS.sms);
    const toDocs = (s: { docs: Array<{ id: string; data: () => unknown }> }) => s.docs.map((d) => ({ ...(d.data() as SmsDoc), id: d.id }));
    const unsubs: Array<() => void> = [];
    if (manager) {
      unsubs.push(onSnapshot(query(col, orderBy('createdAt', 'desc'), limit(500)), (s) => setMine(toDocs(s)),
        (e) => setError(e.message)));
    } else {
      unsubs.push(onSnapshot(query(col, where('createdBy', '==', uid), limit(500)), (s) => setMine(toDocs(s)), (e) => setError(e.message)));
      // Automatic texts to my leads (needs the ownerUid read rule; quietly empty without it).
      unsubs.push(onSnapshot(query(col, where('ownerUid', '==', uid), limit(500)), (s) => setOwned(toDocs(s)), () => setOwned([])));
    }
    unsubs.push(onSnapshot(query(collection(db, SALES_COLLECTIONS.smsInbound), orderBy('receivedAt', 'desc'), limit(300)),
      (s) => setInbound(s.docs.map((d) => ({ ...(d.data() as SmsInbound), id: d.id }))), () => setInbound([])));
    unsubs.push(onSnapshot(collection(db, SALES_COLLECTIONS.smsOptOut),
      (s) => setOptOuts(s.docs.map((d) => ({ ...(d.data() as Omit<OptOut, 'id'>), id: d.id }))), () => setOptOuts([])));
    return () => unsubs.forEach((u) => u());
  }, [uid, manager, profile]);

  const texts = useMemo(() => {
    const seen = new Set<string>();
    return [...mine, ...owned].filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [mine, owned]);
  const shown = texts.filter((x) => (kind === 'all' || x.kind === kind) && (status === 'all' || x.status === status));
  const kinds = Array.from(new Set(texts.map((x) => x.kind)));
  const failed = texts.filter((x) => x.status === 'failed').length;

  // Salespeople see replies from people they texted.
  const myNumbers = useMemo(() => new Set(texts.map((x) => x.to)), [texts]);
  const myLeads = useMemo(() => new Set(texts.map((x) => x.leadId).filter(Boolean)), [texts]);
  const replies = manager ? inbound : inbound.filter((m) => myNumbers.has(m.from) || (m.leadId && myLeads.has(m.leadId)));

  const addOptOut = async () => {
    const p = e164(newOptOut);
    if (!p) {
      notify('Enter a 10-digit US phone number.', 'error');
      return;
    }
    try {
      await setDoc(doc(db, SALES_COLLECTIONS.smsOptOut, p), { phone: p, at: Date.now(), via: 'manual', by: uid });
      setNewOptOut('');
      notify(`${prettyPhone(p)} won't get any more texts.`, 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    }
  };
  const removeOptOut = async (id: string) => {
    if (!window.confirm(`Allow texts to ${prettyPhone(id)} again? Only do this if they asked to get texts again.`)) return;
    try {
      await deleteDoc(doc(db, SALES_COLLECTIONS.smsOptOut, id));
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const phoneRows = [
    ...DEALERSHIPS.filter((d) => d.id !== 'T0').map((d) => ({ storeId: d.id, deviceId: settings.sms.senderDeviceByStore?.[d.id] || '' })),
    { storeId: '*', deviceId: settings.sms.defaultSenderDeviceId || '' },
  ];

  return (
    <MpShell>
      <Typography variant="h5" color="primary" sx={{ fontWeight: 700, mb: 0.5 }}>Texts</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {manager ? 'Every text the team sent' : 'Texts you sent and texts to your leads'}, customer replies, and people who
        asked not to be texted.
      </Typography>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2 }}>
        <Tab value="texts" label={failed ? `Texts (${failed} failed)` : 'Texts'} />
        <Tab value="replies" label="Replies" />
        <Tab value="optout" label={`Opted out (${optOuts.length})`} />
        {manager && <Tab value="phones" label="Texting phones" />}
      </Tabs>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {tab === 'texts' && (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>Kind</InputLabel>
              <Select label="Kind" value={kind} onChange={(e) => setKind(e.target.value as 'all' | SmsKind)}>
                <MenuItem value="all">All kinds</MenuItem>
                {kinds.map((k) => <MenuItem key={k} value={k}>{KIND_LABEL[k] || k}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as 'all' | SmsDoc['status'])}>
                <MenuItem value="all">Any status</MenuItem>
                {(Object.keys(STATUS_LABEL) as SmsDoc['status'][]).map((s) => <MenuItem key={s} value={s}>{STATUS_LABEL[s]}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          {shown.length === 0 && <Alert severity="info">No texts yet.</Alert>}
          <Stack spacing={1}>
            {shown.map((x) => (
              <Paper key={x.id} variant="outlined" sx={{ p: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{prettyPhone(x.to)}</Typography>
                  <Chip size="small" label={KIND_LABEL[x.kind] || x.kind} variant="outlined" />
                  <Chip size="small" color={STATUS_COLOR[x.status]} label={STATUS_LABEL[x.status] || x.status} />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    {x.createdBy ? userName(x.createdBy) : 'Automatic'} · {storeLabel(x.storeId)} · {when(x.sentAt || x.createdAt)}
                    {x.status === 'queued' && x.sendAt > now + 60_000 ? ` · goes out ${when(x.sendAt)}` : ''}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{x.body}</Typography>
                {x.error && x.status !== 'sent' && (
                  <Typography variant="caption" color={x.status === 'failed' ? 'error' : 'text.secondary'}>{x.error}</Typography>
                )}
              </Paper>
            ))}
          </Stack>
        </>
      )}

      {tab === 'replies' && (
        <Stack spacing={1}>
          {replies.length === 0 && <Alert severity="info">No replies yet. When a customer texts back, it shows here and the salesperson gets a notification.</Alert>}
          {replies.map((m) => (
            <Paper key={m.id} variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {prettyPhone(m.from) || (m as SmsInbound & { fromName?: string }).fromName || 'Unknown'}
                </Typography>
                {!m.leadId && <Chip size="small" label="Not matched to a lead" variant="outlined" />}
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                  {m.via === 'twilio' ? 'Twilio' : 'Texting phone'} · {when(m.receivedAt)}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</Typography>
            </Paper>
          ))}
        </Stack>
      )}

      {tab === 'optout' && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These people replied STOP (or asked not to be texted). Nobody on the team can text them — not by hand and not automatically.
          </Typography>
          {manager && (
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <TextField size="small" label="Phone number" value={newOptOut} onChange={(e) => setNewOptOut(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addOptOut(); }} />
              <Button variant="outlined" onClick={addOptOut}>Don't text this number</Button>
            </Box>
          )}
          {optOuts.length === 0 && <Alert severity="info">Nobody has opted out.</Alert>}
          <Stack spacing={0.5}>
            {[...optOuts].sort((a, b) => (b.at || 0) - (a.at || 0)).map((o) => (
              <Box key={o.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 130 }}>{prettyPhone(o.id)}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
                  {o.via === 'manual' ? 'Added by hand' : 'Replied STOP'}{o.at ? ` · ${when(o.at)}` : ''}
                </Typography>
                {manager && (
                  <Tooltip title="Allow texts again">
                    <IconButton size="small" onClick={() => removeOptOut(o.id)} aria-label="Allow texts again"><Delete fontSize="small" /></IconButton>
                  </Tooltip>
                )}
              </Box>
            ))}
          </Stack>
        </>
      )}

      {tab === 'phones' && manager && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          {settings.sms.provider === 'twilio' && (
            <Alert severity="info" sx={{ mb: 1 }}>Texts are sent with Twilio, so texting phones aren't used right now.</Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Each store's texting phone checks in every 30 seconds. To set one up, open the TIGON IOT app on that phone →
            Dashboard → This Device → "Make this the texting phone", or pick it in Sell more settings → Texting.
          </Typography>
          {phoneRows.map((r) => <PhoneRow key={r.storeId} storeId={r.storeId} deviceId={r.deviceId} />)}
        </Paper>
      )}
    </MpShell>
  );
};

export default TextsPage;
