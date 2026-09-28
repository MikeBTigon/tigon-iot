import { useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography,
} from '@mui/material';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS, DEALERSHIPS } from '../constants';
import { useMp } from '../MpDataContext';
import { writeAudit } from '../audit';
import ConsentFields, { type ConsentValue } from './ConsentFields';
import ReviewRequestDialog from './ReviewRequestDialog';
import { hasAnyConsent, isManager, saveCustomer, shortDateTime } from './crmData';
import type { Customer } from '../growthTypes';

/** Add / edit a customer with per-channel opt-in consent. */
export default function CustomerDialog({ open, customer, allTags, onClose }: {
  open: boolean;
  customer: Customer | null;
  allTags: string[];
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      {open && <CustomerBody key={customer?.id || 'new'} customer={customer} allTags={allTags} onClose={onClose} />}
    </Dialog>
  );
}

function CustomerBody({ customer, allTags, onClose }: { customer: Customer | null; allTags: string[]; onClose: () => void }) {
  const { profile } = useMp();
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [locationId, setLocationId] = useState(customer?.locationId || '');
  const [tags, setTags] = useState<string[]>(customer?.tags || []);
  const [consent, setConsent] = useState<ConsentValue>({
    consentSms: !!customer?.consentSms, consentWhatsapp: !!customer?.consentWhatsapp,
    consentEmail: !!customer?.consentEmail, consentSource: customer?.consentSource || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);

  const anyConsent = hasAnyConsent(consent);
  const valid = !!(name.trim() || phone.trim() || email.trim()) && (!anyConsent || !!consent.consentSource.trim());

  const save = async () => {
    if (!profile || !valid) return;
    setBusy(true);
    setError('');
    try {
      const hadConsent = customer ? hasAnyConsent(customer) : false;
      await saveCustomer(
        profile,
        {
          name: name.trim(), phone: phone.trim(), email: email.trim(), locationId, tags,
          ...consent, consentSource: consent.consentSource.trim(),
          // Consent time: kept while consent continues, stamped when newly given.
          consentAt: anyConsent ? (hadConsent && customer?.consentAt) || Date.now() : customer?.consentAt,
          lastPurchaseAt: customer?.lastPurchaseAt, reviewRequestedAt: customer?.reviewRequestedAt,
        },
        customer?.id,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!customer || !window.confirm(`Delete ${customer.name || 'this customer'}?`)) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.customers, customer.id));
      await writeAudit(profile, 'customer.delete', customer.id, customer.name);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <DialogTitle>{customer ? customer.name || 'Customer' : 'New customer'}</DialogTitle>
      <DialogContent>
        {customer && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {customer.consentAt ? `Consent recorded ${shortDateTime(customer.consentAt)}` : 'No consent recorded'}
            {customer.lastPurchaseAt ? ` · bought ${shortDateTime(customer.lastPurchaseAt)}` : ''}
            {customer.reviewRequestedAt ? ` · review asked ${shortDateTime(customer.reviewRequestedAt)}` : ''}
          </Typography>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 1, mb: 1.5 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField select label="Store" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <MenuItem value="">—</MenuItem>
            {DEALERSHIPS.map((d) => <MenuItem key={d.id} value={d.id}>{d.id} · {d.name}</MenuItem>)}
          </TextField>
          <TextField label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Box>
        <Autocomplete
          multiple freeSolo options={allTags} value={tags}
          onChange={(_, v) => setTags([...new Set(v.map((t) => t.trim().toLowerCase()).filter(Boolean))])}
          renderValue={(value, getItemProps) => value.map((t, i) => <Chip size="small" label={t} {...getItemProps({ index: i })} key={t} />)}
          renderInput={(params) => <TextField {...params} label="Tags" placeholder="buyer, lithium, VIP…" />}
          sx={{ mb: 1.5 }}
        />
        <ConsentFields value={consent} onChange={setConsent} />
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {customer && isManager(profile) && <Button color="error" onClick={remove}>Delete</Button>}
        <Box sx={{ flexGrow: 1 }} />
        {customer && <Button onClick={() => setReview(true)}>Review request</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid || busy} onClick={save}>Save</Button>
      </DialogActions>
      <ReviewRequestDialog open={review} onClose={() => setReview(false)} customer={customer} />
    </>
  );
}
