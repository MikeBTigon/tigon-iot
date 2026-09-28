import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup, TextField, Typography,
} from '@mui/material';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from '../constants';
import { useMp } from '../MpDataContext';
import { contactUrl, loadCart, openContact, recordReviewRequest, shortDateTime } from './crmData';
import { fillFor, reviewTemplate, useReplyTemplates } from './replyTemplates';
import type { Customer, Lead } from '../growthTypes';
import type { MpCart } from '../types';

type ReviewChannel = 'sms' | 'whatsapp' | 'email' | 'call' | 'in-person';

/**
 * Ask a buyer for a genuine Google review. Text/WhatsApp/Email only when the customer opted in;
 * a phone call or asking in person is always allowed (recorded manually).
 */
export default function ReviewRequestDialog({ open, onClose, lead, customer }: {
  open: boolean;
  onClose: () => void;
  lead?: Lead | null;
  customer?: Customer | null;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      {open && <ReviewBody onClose={onClose} lead={lead || null} customer={customer || null} />}
    </Dialog>
  );
}

function ReviewBody({ onClose, lead, customer: initialCustomer }: { onClose: () => void; lead: Lead | null; customer: Customer | null }) {
  const { profile, carts } = useMp();
  const templates = useReplyTemplates(profile?.uid);
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer);
  const [cart, setCart] = useState<MpCart | null>(null);
  const [channel, setChannel] = useState<ReviewChannel | ''>('');
  const [edited, setEdited] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const customerId = initialCustomer?.id || lead?.customerId;
  useEffect(() => {
    if (initialCustomer || !customerId) return;
    let alive = true;
    getDoc(doc(db, COLLECTIONS.customers, customerId))
      .then((s) => { if (alive && s.exists()) setCustomer({ id: s.id, ...s.data() } as Customer); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [initialCustomer, customerId]);

  useEffect(() => {
    let alive = true;
    loadCart(carts, lead?.cartId).then((c) => { if (alive) setCart(c); });
    return () => { alive = false; };
  }, [carts, lead?.cartId]);

  const name = customer?.name || lead?.name || '';
  const phone = customer?.phone || lead?.phone || '';
  const email = customer?.email || lead?.email || '';
  const options: Array<{ value: ReviewChannel; label: string; ok: boolean; why?: string }> = [
    { value: 'sms', label: 'Text message', ok: !!customer?.consentSms && !!phone, why: 'needs SMS opt-in' },
    { value: 'whatsapp', label: 'WhatsApp', ok: !!customer?.consentWhatsapp && !!phone, why: 'needs WhatsApp opt-in' },
    { value: 'email', label: 'Email', ok: !!customer?.consentEmail && !!email, why: 'needs email opt-in' },
    { value: 'call', label: 'Phone call (ask during the call)', ok: !!phone, why: 'no phone number' },
    { value: 'in-person', label: 'In person', ok: true },
  ];
  const tpl = reviewTemplate(templates);
  const message = edited ?? (tpl ? fillFor(tpl.body, { cart, name, locationId: customer?.locationId }) : '');
  const already = customer?.reviewRequestedAt;

  const send = async () => {
    if (!channel) return;
    setBusy(true);
    setError('');
    try {
      if (channel !== 'in-person') await openContact(contactUrl(channel, { phone, email }, message, 'Thank you from TIGON Golf Carts'));
      await recordReviewRequest(lead?.id, customer?.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogTitle>Ask {name || 'the customer'} for a review</DialogTitle>
      <DialogContent>
        {already && <Alert severity="info" sx={{ mb: 1 }}>A review was already requested {shortDateTime(already)}.</Alert>}
        {!customer && <Alert severity="info" sx={{ mb: 1 }}>No customer record with opt-in yet — you can ask by phone or in person.</Alert>}
        <RadioGroup value={channel} onChange={(e) => setChannel(e.target.value as ReviewChannel)}>
          {options.map((o) => (
            <FormControlLabel key={o.value} value={o.value} disabled={!o.ok} control={<Radio size="small" />}
              label={o.ok ? o.label : `${o.label} — ${o.why}`} />
          ))}
        </RadioGroup>
        <TextField fullWidth multiline minRows={3} label="Message" value={message} onChange={(e) => setEdited(e.target.value)} sx={{ mt: 1 }} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Ask for an honest review only — never offer discounts, gifts or anything else in return.
        </Typography>
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!channel || busy} onClick={send}>
          {channel === 'in-person' ? 'Record request' : channel === 'call' ? 'Call & record' : 'Open & record'}
        </Button>
      </DialogActions>
    </>
  );
}
