// Track 3 — "Send quote" from the financing calculator: saves mp_quotes/{code} and texts the customer the link.
import React, { useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import { ContentCopy, Send } from '@mui/icons-material';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useMp } from '../../MpDataContext';
import { useLeads, updateLead } from '../../crm/crmData';
import { copyText } from '../../../native/actions';
import { notify } from '../../../ui/notify';
import { SALES_COLLECTIONS } from '../salesTypes';
import type { LeadSalesFields, Quote } from '../salesTypes';
import type { Lead } from '../../growthTypes';
import { e164, fill, leadTemplateData, quoteUrl, sendText, useSalesSettings } from '../salesData';
import { DAY_MS, TEXTS, money, randomCode, storePhone } from './closingUtils';

/** Everything about the price; the dialog adds the customer, salesperson, store and dates. */
export type QuoteDraft = Omit<Quote, 'id' | 'code' | 'leadId' | 'salespersonUid' | 'salespersonName' | 'salespersonPhone' | 'storeId' |
  'customerName' | 'customerPhone' | 'createdAt' | 'expiresAt' | 'openedAt' | 'openCount' | 'interestedAt'> & { tradeIn: number };

type LeadRow = Lead & LeadSalesFields;

const SendQuoteDialog: React.FC<{
  open: boolean; onClose: () => void; draft: QuoteDraft; lead?: LeadRow | null; storeId: string;
}> = (props) => (
  <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
    {props.open && <Body {...props} />}
  </Dialog>
);

const Body: React.FC<{ onClose: () => void; draft: QuoteDraft; lead?: LeadRow | null; storeId: string }> = ({ onClose, draft, lead, storeId }) => {
  const { profile } = useMp();
  const { settings } = useSalesSettings();
  const { leads } = useLeads(profile);
  const [code] = useState(() => randomCode(8));
  const [picked, setPicked] = useState<LeadRow | null>(lead || null);
  const [name, setName] = useState(lead?.name || '');
  const [phone, setPhone] = useState(lead?.phone || '');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const store = picked?.locationId || storeId || profile?.location || '';
  const link = quoteUrl(code);
  const auto = fill(TEXTS.quote, leadTemplateData({ name, cartTitle: draft.cartTitle || picked?.cartTitle, locationId: store }, profile?.name || '', { link }));
  const body = message ?? auto;
  const options = useMemo(() => (leads as LeadRow[]).filter((l) => l.status === 'new' || l.status === 'talking')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)), [leads]);

  const pick = (l: LeadRow | null) => {
    setPicked(l);
    if (l) { setName(l.name || ''); setPhone(l.phone || ''); }
  };

  const save = async (text: boolean) => {
    setError('');
    if (!profile) return;
    const to = e164(phone);
    if (text && !to) { setError('Enter the customer\'s 10-digit mobile number.'); return; }
    if (text && !body.includes(link)) { setError('Keep the quote link in the message.'); return; }
    setBusy(true);
    try {
      const now = Date.now();
      const q: Omit<Quote, 'id'> & { tradeIn: number } = {
        ...draft, code, storeId: store, salespersonUid: profile.uid, salespersonName: profile.name || profile.email || '',
        salespersonPhone: storePhone(store), createdAt: now, expiresAt: now + Math.max(1, Number(settings.quotes.expireDays) || 30) * DAY_MS,
        ...(picked ? { leadId: picked.id } : {}), ...(name.trim() ? { customerName: name.trim().slice(0, 80) } : {}), ...(to ? { customerPhone: to } : {}),
      };
      await setDoc(doc(db, SALES_COLLECTIONS.quotes, code), Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)));
      if (text) await sendText({ to, body, createdBy: profile.uid, storeId: store, leadId: picked?.id, kind: 'quote' });
      if (picked) {
        await updateLead(picked.id, { quoteCode: code, quoteSentAt: now }).catch(() => notify('Quote saved, but this lead could not be updated (it belongs to someone else).', 'info'));
      }
      if (!text) await copyText(link).catch(() => undefined);
      setDone(text ? `Quote texted to ${name.trim() || to}.` : 'Quote link copied.');
      notify(text ? 'Quote sent' : 'Quote link copied', 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <>
        <DialogTitle>Quote ready</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>{done} You'll get a notification when they open it.</Alert>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField size="small" fullWidth value={link} slotProps={{ htmlInput: { readOnly: true } }} />
            <Button startIcon={<ContentCopy />} onClick={() => copyText(link).then(() => notify('Link copied', 'success')).catch(() => undefined)}>Copy</Button>
          </Box>
          <Button sx={{ mt: 1 }} href={`/q/${code}?preview=1`} target="_blank">Preview what the customer sees</Button>
        </DialogContent>
        <DialogActions><Button variant="contained" onClick={onClose}>Done</Button></DialogActions>
      </>
    );
  }

  return (
    <>
      <DialogTitle>Text this quote</DialogTitle>
      <DialogContent>
        {!settings.quotes.enabled && <Alert severity="info" sx={{ mb: 2 }}>Quote links are turned off in Sell more → settings.</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {draft.cartTitle || draft.brand} · out the door {money(draft.otd)}{draft.rows.length ? ` · ${draft.rows.length} payment options` : ''}
          </Typography>
          <Autocomplete size="small" options={options} value={picked} onChange={(_e, v) => pick(v)}
            getOptionLabel={(l) => `${l.name || 'No name'}${l.phone ? ` · ${l.phone}` : ''}`} isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(p) => <TextField {...p} label="Lead (optional)" helperText="Pick a lead to track opens on it" />} />
          <TextField size="small" label="Customer name" value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} />
          <TextField size="small" label="Mobile phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" slotProps={{ htmlInput: { maxLength: 20 } }} />
          <TextField label="Message" value={body} onChange={(e) => setMessage(e.target.value)} multiline minRows={3}
            helperText={message !== null ? <Button size="small" onClick={() => setMessage(null)} sx={{ p: 0, minWidth: 0 }}>Reset message</Button> : 'You can change the message. Keep the link.'} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => save(false)} disabled={busy || !settings.quotes.enabled} startIcon={<ContentCopy />}>Copy link only</Button>
        <Button variant="contained" onClick={() => save(true)} disabled={busy || !settings.quotes.enabled} startIcon={<Send />}>Text quote</Button>
      </DialogActions>
    </>
  );
};

export default SendQuoteDialog;
