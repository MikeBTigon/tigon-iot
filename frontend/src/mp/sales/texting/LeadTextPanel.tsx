// Track 2 (texting) — inside the lead dialog: texts with this lead as a chat, a box to send one, and the
// follow-up plan (cadence) with a Stop button.
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { Alert, Box, Button, Chip, CircularProgress, Paper, TextField, Typography } from '@mui/material';
import { Send, Sms } from '@mui/icons-material';
import { db } from '../../../config/firebase';
import { useAuth } from '../../../context/AuthContext';
import { useMp } from '../../MpDataContext';
import { isManager } from '../../crm/crmData';
import type { Lead } from '../../growthTypes';
import { notify } from '../../../ui/notify';
import { e164, sendText, useSalesSettings } from '../salesData';
import { SALES_COLLECTIONS } from '../salesTypes';
import type { LeadSalesFields, SmsDoc, SmsInbound } from '../salesTypes';
import { CHANNEL_VERB, KIND_LABEL, STATUS_COLOR, STATUS_LABEL, sortSteps, when } from './textingUi';

type Item = { at: number; out: true; sms: SmsDoc } | { at: number; out: false; msg: SmsInbound };

const LeadTextPanel: React.FC<{ lead: Lead & LeadSalesFields }> = ({ lead }) => {
  const { currentUser } = useAuth();
  const { profile, userName } = useMp();
  const { settings } = useSalesSettings();
  const manager = isManager(profile);
  const uid = currentUser?.uid || '';
  const to = e164(lead.phone);
  const [outA, setOutA] = useState<SmsDoc[]>([]);
  const [outB, setOutB] = useState<SmsDoc[]>([]);
  const [inbound, setInbound] = useState<SmsInbound[]>([]);
  const [optedOut, setOptedOut] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!uid || !lead.id) return;
    const col = collection(db, SALES_COLLECTIONS.sms);
    const toDocs = (s: { docs: Array<{ id: string; data: () => unknown }> }) => s.docs.map((d) => ({ ...(d.data() as SmsDoc), id: d.id }));
    const unsubs: Array<() => void> = [];
    if (manager) {
      unsubs.push(onSnapshot(query(col, where('leadId', '==', lead.id)), (s) => setOutA(toDocs(s)), () => setOutA([])));
    } else {
      // Members read the texts they sent, and texts to their own leads (ownerUid).
      unsubs.push(onSnapshot(query(col, where('leadId', '==', lead.id), where('createdBy', '==', uid)), (s) => setOutA(toDocs(s)), () => setOutA([])));
      unsubs.push(onSnapshot(query(col, where('leadId', '==', lead.id), where('ownerUid', '==', uid)), (s) => setOutB(toDocs(s)), () => setOutB([])));
    }
    unsubs.push(onSnapshot(query(collection(db, SALES_COLLECTIONS.smsInbound), where('leadId', '==', lead.id)),
      (s) => setInbound(s.docs.map((d) => ({ ...(d.data() as SmsInbound), id: d.id }))), () => setInbound([])));
    return () => unsubs.forEach((u) => u());
  }, [uid, lead.id, manager]);

  useEffect(() => {
    if (!to) return;
    return onSnapshot(doc(db, SALES_COLLECTIONS.smsOptOut, to), (s) => setOptedOut(s.exists()), () => setOptedOut(false));
  }, [to]);

  const items = useMemo<Item[]>(() => {
    const seen = new Set<string>();
    const out: Item[] = [];
    for (const sms of [...outA, ...outB]) {
      if (seen.has(sms.id)) continue;
      seen.add(sms.id);
      out.push({ at: sms.sentAt || sms.createdAt, out: true, sms });
    }
    for (const msg of inbound) out.push({ at: msg.receivedAt, out: false, msg });
    return out.sort((a, b) => a.at - b.at);
  }, [outA, outB, inbound]);

  const send = async () => {
    if (!uid) return;
    setSending(true);
    try {
      await sendText({ to: lead.phone, body, createdBy: uid, storeId: lead.locationId, leadId: lead.id });
      setBody('');
      notify('Text queued — it goes out in about a minute.', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSending(false);
    }
  };

  // Follow-up plan
  const steps = sortSteps(settings.cadence.steps);
  const step = Number(lead.cadenceStep) || 0;
  const closed = lead.status === 'sold' || lead.status === 'lost';
  const enrolled = typeof lead.cadenceStartedAt === 'number';
  let cadence = '';
  if (enrolled && settings.cadence.enabled && steps.length) {
    if (lead.cadenceStopped) cadence = 'Follow-ups stopped';
    else if (closed) cadence = 'No more follow-ups (lead closed)';
    else if (step >= steps.length) cadence = `All ${steps.length} follow-ups done`;
    else {
      const next = steps[step];
      const at = (lead.cadenceStartedAt || 0) + next.day * 86_400_000;
      cadence = `Step ${step + 1} of ${steps.length} — next: Day ${next.day} ${CHANNEL_VERB[next.channel]} (${when(at)})`;
    }
  }
  const setStopped = async (stopped: boolean) => {
    try {
      await updateDoc(doc(db, 'mp_leads', lead.id), { cadenceStopped: stopped, updatedAt: Date.now() });
      notify(stopped ? 'Follow-ups stopped for this lead.' : 'Follow-ups are back on.', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Sms fontSize="small" color="primary" />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flexGrow: 1 }}>Texts</Typography>
        {optedOut && <Chip size="small" color="warning" label="Replied STOP" />}
      </Box>

      {cadence && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{cadence}</Typography>
          {!closed && !lead.cadenceStopped && step < steps.length && (
            <Button size="small" color="inherit" onClick={() => setStopped(true)}>Stop follow-ups</Button>
          )}
          {!closed && lead.cadenceStopped && (
            <Button size="small" onClick={() => setStopped(false)}>Start again</Button>
          )}
        </Box>
      )}

      {items.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, maxHeight: 320, overflowY: 'auto', mb: 1, pr: 0.5 }}>
          {items.map((it) => it.out ? (
            <Box key={`o_${it.sms.id}`} sx={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
              <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', px: 1.25, py: 0.75, borderRadius: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                <Typography variant="body2">{it.sms.body}</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', alignItems: 'center', mt: 0.25, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary">
                  {it.sms.createdBy ? userName(it.sms.createdBy) : KIND_LABEL[it.sms.kind] || 'Automatic'} · {when(it.at)}
                </Typography>
                {it.sms.status !== 'sent' && <Chip size="small" color={STATUS_COLOR[it.sms.status]} label={STATUS_LABEL[it.sms.status]} sx={{ height: 18 }} />}
              </Box>
              {it.sms.error && it.sms.status !== 'sent' && (
                <Typography variant="caption" color={it.sms.status === 'failed' ? 'error' : 'text.secondary'} component="div" sx={{ textAlign: 'right' }}>
                  {it.sms.error}
                </Typography>
              )}
            </Box>
          ) : (
            <Box key={`i_${it.msg.id}`} sx={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
              <Box sx={{ bgcolor: 'action.hover', px: 1.25, py: 0.75, borderRadius: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                <Typography variant="body2">{it.msg.body}</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">{when(it.at)}</Typography>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>No texts with this lead yet.</Typography>
      )}

      {!to ? (
        <Alert severity="info" sx={{ py: 0 }}>Add a 10-digit phone number to text this lead.</Alert>
      ) : optedOut ? (
        <Alert severity="warning" sx={{ py: 0 }}>They replied STOP, so we can't text them. Call instead.</Alert>
      ) : (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField size="small" fullWidth multiline maxRows={5} placeholder="Type a text…" value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 1200))} />
          <Button variant="contained" disabled={sending || !body.trim()} onClick={send} sx={{ minWidth: 0, px: 2 }}
            aria-label="Send text">
            {sending ? <CircularProgress size={20} color="inherit" /> : <Send fontSize="small" />}
          </Button>
        </Box>
      )}
    </Paper>
  );
};

export default LeadTextPanel;
