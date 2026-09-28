import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup, TextField, Typography,
} from '@mui/material';
import { PersonAdd, Sell } from '@mui/icons-material';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from '../constants';
import { useMp } from '../MpDataContext';
import { cartTitle } from '../cartLogic';
import LeadDialog from './LeadDialog';
import MarkSoldDialog from './MarkSoldDialog';
import { createLead, isManager, isOpenLead } from './crmData';
import type { Lead } from '../growthTypes';
import type { MpCart } from '../types';

/** Cart page: "New lead" (prefilled with the cart) and "Mark sold" (pick the buyer's lead or add a walk-in). */
export default function CrmCartButtons({ cart }: { cart: MpCart }) {
  const { profile } = useMp();
  const [newLead, setNewLead] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sold, setSold] = useState<Lead | null>(null);
  const title = cartTitle(cart);

  if (!profile) return null;
  return (
    <>
      <Button size="small" variant="outlined" startIcon={<PersonAdd />} onClick={() => setNewLead(true)}>New lead</Button>
      <Button size="small" variant="outlined" color="success" startIcon={<Sell />} onClick={() => setPicking(true)}>Mark sold</Button>
      <LeadDialog open={newLead} onClose={() => setNewLead(false)} initial={{ cartId: cart.docId, cartTitle: title }} />
      <Dialog open={picking} onClose={() => setPicking(false)} fullWidth maxWidth="xs">
        {picking && <BuyerPicker cart={cart} onCancel={() => setPicking(false)} onPicked={(l) => { setPicking(false); setSold(l); }} />}
      </Dialog>
      <MarkSoldDialog lead={sold} onClose={() => setSold(null)} />
    </>
  );
}

/** Choose which lead bought the cart (open leads on this cart), or add the buyer as a walk-in lead. */
function BuyerPicker({ cart, onCancel, onPicked }: { cart: MpCart; onCancel: () => void; onPicked: (lead: Lead) => void }) {
  const { profile } = useMp();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [choice, setChoice] = useState('new');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    // Members may only query their own leads (rules).
    const q = isManager(profile)
      ? query(collection(db, COLLECTIONS.leads), where('cartId', '==', cart.docId))
      : query(collection(db, COLLECTIONS.leads), where('ownerUid', '==', profile.uid), where('cartId', '==', cart.docId));
    let alive = true;
    getDocs(q)
      .then((s) => {
        if (!alive) return;
        const open = s.docs.map((d) => ({ id: d.id, ...d.data() }) as Lead).filter((l) => isOpenLead(l.status));
        setLeads(open);
        if (open.length) setChoice(open[0].id);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [profile, cart.docId]);

  const next = async () => {
    if (!profile) return;
    const existing = leads.find((l) => l.id === choice);
    if (existing) {
      onPicked(existing);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = {
        name: name.trim() || 'Walk-in buyer', phone: phone.trim(), email: '', channel: 'walk-in' as const, status: 'talking' as const,
        cartId: cart.docId, cartTitle: cartTitle(cart), ownerUid: profile.uid, notes: '',
      };
      const id = await createLead(profile, data);
      onPicked({ ...data, id, createdAt: Date.now(), updatedAt: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogTitle>Who bought it?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{cartTitle(cart)}</Typography>
        <RadioGroup value={choice} onChange={(e) => setChoice(e.target.value)}>
          {leads.map((l) => <FormControlLabel key={l.id} value={l.id} control={<Radio size="small" />} label={`${l.name || l.phone || 'Lead'} (lead)`} />)}
          <FormControlLabel value="new" control={<Radio size="small" />} label="Someone else" />
        </RadioGroup>
        {choice === 'new' && (
          <>
            <TextField fullWidth size="small" label="Buyer name" value={name} onChange={(e) => setName(e.target.value)} sx={{ mt: 1 }} />
            <TextField fullWidth size="small" label="Phone (optional)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} sx={{ mt: 1 }} />
          </>
        )}
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" disabled={busy} onClick={next}>Next</Button>
      </DialogActions>
    </>
  );
}
