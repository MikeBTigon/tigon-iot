import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputAdornment, TextField, Typography,
} from '@mui/material';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from '../constants';
import { useMp } from '../MpDataContext';
import { fromLocalInput, loadCart, markLeadSold, toDateInput, type SoldResult } from './crmData';
import ConsentFields, { type ConsentValue } from './ConsentFields';
import ReviewRequestDialog from './ReviewRequestDialog';
import type { Customer, Lead } from '../growthTypes';

/**
 * Mark a lead as sold: price + date, hides the linked cart from inventory, cancels its open queue items,
 * optionally saves the buyer as a customer (with opt-in) and offers a review request.
 */
export default function MarkSoldDialog({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  return (
    <Dialog open={!!lead} onClose={onClose} fullWidth maxWidth="sm">
      {lead && <SoldBody key={lead.id} lead={lead} onClose={onClose} />}
    </Dialog>
  );
}

function SoldBody({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { profile, carts, refreshCart } = useMp();
  const [price, setPrice] = useState(lead.soldPrice ? String(lead.soldPrice) : '');
  const [date, setDate] = useState(() => toDateInput(lead.soldAt || Date.now()));
  const [locationId, setLocationId] = useState('');
  const [saveCustomer, setSaveCustomer] = useState(true);
  const [consent, setConsent] = useState<ConsentValue>({ consentSms: false, consentWhatsapp: false, consentEmail: false, consentSource: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SoldResult | null>(null);
  const [review, setReview] = useState(false);

  // Default price and store from the linked cart.
  useEffect(() => {
    let alive = true;
    loadCart(carts, lead.cartId).then((c) => {
      if (!alive || !c) return;
      setPrice((p) => p || (c.price > 0 ? String(c.price) : ''));
      setLocationId(c.locationId);
    });
    return () => { alive = false; };
  }, [carts, lead.cartId]);

  // Keep an existing customer's consent.
  useEffect(() => {
    if (!lead.customerId) return;
    let alive = true;
    getDoc(doc(db, COLLECTIONS.customers, lead.customerId))
      .then((s) => {
        if (!alive || !s.exists()) return;
        const c = s.data() as Customer;
        setConsent({ consentSms: !!c.consentSms, consentWhatsapp: !!c.consentWhatsapp, consentEmail: !!c.consentEmail, consentSource: c.consentSource || '' });
        if (c.locationId) setLocationId((l) => l || c.locationId);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [lead.customerId]);

  const anyConsent = consent.consentSms || consent.consentWhatsapp || consent.consentEmail;
  const valid = Number(price) > 0 && !!date && (!saveCustomer || !anyConsent || !!consent.consentSource.trim());

  const submit = async () => {
    if (!profile || !valid) return;
    setBusy(true);
    setError('');
    try {
      // Noon local time avoids the date shifting across time zones.
      const soldAt = fromLocalInput(`${date}T12:00`) || Date.now();
      const res = await markLeadSold(profile, lead, {
        price: Number(price),
        soldAt,
        customer: saveCustomer ? { ...consent, consentSource: consent.consentSource.trim(), locationId } : undefined,
      });
      if (lead.cartId) await refreshCart(lead.cartId).catch(() => undefined);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <>
        <DialogTitle>Marked as sold</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}>{lead.name} · {lead.cartTitle || 'no cart linked'} · ${Number(price).toLocaleString('en-US')}</Typography>
          {lead.cartId && <Typography variant="body2" color="text.secondary">The cart is hidden from inventory until the DMS catches up.</Typography>}
          {result.cancelledQueue > 0 && <Typography variant="body2" color="text.secondary">Cancelled {result.cancelledQueue} open posting-queue item(s).</Typography>}
          {result.skippedQueue > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>{result.skippedQueue} queue item(s) assigned to someone else are still open — ask a manager to cancel them.</Alert>
          )}
          {result.warning && <Alert severity="warning" sx={{ mt: 1 }}>{result.warning}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Done</Button>
          <Button variant="contained" onClick={() => setReview(true)}>Send review request</Button>
        </DialogActions>
        <ReviewRequestDialog
          open={review}
          onClose={() => { setReview(false); onClose(); }}
          lead={{ ...lead, status: 'sold', customerId: result.customerId || lead.customerId }}
        />
      </>
    );
  }

  return (
    <>
      <DialogTitle>Mark as sold</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {lead.name}{lead.cartTitle ? ` · ${lead.cartTitle}` : ''}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
          <TextField label="Sold price" type="number" value={price} onChange={(e) => setPrice(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }} />
          <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        {lead.cartId && (
          <Alert severity="info" sx={{ mb: 2 }}>The linked cart will be hidden from inventory and its open posting-queue items cancelled.</Alert>
        )}
        <FormControlLabel control={<Checkbox checked={saveCustomer} onChange={(e) => setSaveCustomer(e.target.checked)} />} label="Save the buyer as a customer" />
        {saveCustomer && <ConsentFields value={consent} onChange={setConsent} />}
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="success" disabled={!valid || busy} onClick={submit}>Mark sold</Button>
      </DialogActions>
    </>
  );
}
