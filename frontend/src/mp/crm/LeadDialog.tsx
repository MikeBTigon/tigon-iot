import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from '../constants';
import { useMp } from '../MpDataContext';
import { writeAudit } from '../audit';
import { currentDeviceId } from '../../native/deviceSession';
import CartPicker, { type CartChoice } from './CartPicker';
import ContactPanel from './ContactPanel';
import MarkSoldDialog from './MarkSoldDialog';
import ReviewRequestDialog from './ReviewRequestDialog';
import {
  CHANNELS, CHANNEL_LABEL, LEAD_STATUS_LABEL, createLead, fromLocalInput, isManager, loadCart, markContacted,
  shortDateTime, toLocalInput, updateLead, type LeadInput,
} from './crmData';
import type { Lead, LeadChannel, LeadStatus } from '../growthTypes';
import LeadSalesPanel from '../sales/LeadSalesPanel';
import type { MpCart } from '../types';
import CustomerTimeline from '../insights/CustomerTimeline';
import { useT } from '../../i18n';

export interface LeadDialogProps {
  open: boolean;
  onClose: () => void;
  /** Existing lead to edit; omit to create. */
  lead?: Lead | null;
  /** Prefill for a new lead (cart, channel, notes, attribution…). */
  initial?: Partial<LeadInput>;
  /** When set (lead made from an IoT notification), offers to mark it handled. */
  notificationId?: string;
  onSaved?: (id: string) => void;
}

/** Create / edit a lead, with reply shortcuts (Call, Text, WhatsApp, Email) and Mark sold. */
export default function LeadDialog(props: LeadDialogProps) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      {props.open && <LeadBody key={props.lead?.id || 'new'} {...props} />}
    </Dialog>
  );
}

function LeadBody({ onClose, lead, initial, notificationId, onSaved }: LeadDialogProps) {
  const t = useT();
  const { profile, users, carts, userName } = useMp();
  const src = lead || initial || {};
  const [name, setName] = useState(src.name || '');
  const [phone, setPhone] = useState(src.phone || '');
  const [email, setEmail] = useState(src.email || '');
  const [channel, setChannel] = useState<LeadChannel>(src.channel || 'facebook');
  const [status, setStatus] = useState<LeadStatus>(src.status || 'new');
  const [notes, setNotes] = useState(src.notes || '');
  const [followUp, setFollowUp] = useState(toLocalInput(src.followUpAt));
  const [ownerUid, setOwnerUid] = useState(src.ownerUid || profile?.uid || '');
  const [cartChoice, setCartChoice] = useState<CartChoice | null>(src.cartId ? { id: src.cartId, title: src.cartTitle || src.cartId } : null);
  const [cart, setCart] = useState<MpCart | null>(null);
  const [markHandled, setMarkHandled] = useState(true);
  const [contactedAt, setContactedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selling, setSelling] = useState(false);
  const [review, setReview] = useState(false);
  const manager = isManager(profile);

  const cartId = cartChoice?.id;
  useEffect(() => {
    let alive = true;
    loadCart(carts, cartId).then((c) => { if (alive) setCart(c); });
    return () => { alive = false; };
  }, [carts, cartId]);

  const onContact = async () => {
    if (!lead) {
      // New lead: remember it; saved with the lead.
      setContactedAt(Date.now());
      if (status === 'new') setStatus('talking');
      return;
    }
    try {
      await markContacted(lead);
      if (status === 'new') setStatus('talking');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    if (!profile) return;
    if (!name.trim() && !phone.trim() && !email.trim()) {
      setError(t('leadDialog.needContact'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = {
        name: name.trim(), phone: phone.trim(), email: email.trim(), channel, status, notes: notes.trim(),
        cartId: cartChoice?.id, cartTitle: cartChoice?.title, followUpAt: fromLocalInput(followUp),
        ownerUid: manager ? ownerUid || profile.uid : lead?.ownerUid || profile.uid,
      };
      let id = lead?.id || '';
      if (lead) {
        // deleteField would be cleaner, but 0 keeps "no follow-up" simple and rule-friendly.
        await updateLead(lead.id, { ...data, followUpAt: data.followUpAt || 0, cartId: data.cartId || '', cartTitle: data.cartTitle || '' });
      } else {
        id = await createLead(profile, {
          ...initial, ...data,
          deviceId: initial?.deviceId || currentDeviceId(),
          notificationId: notificationId || initial?.notificationId,
          lastContactAt: contactedAt || undefined,
        });
        if (notificationId && markHandled) {
          await updateDoc(doc(db, 'notifications', notificationId), { isHandled: true, handledAt: new Date() }).catch(() => undefined);
        }
      }
      onSaved?.(id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!lead || !window.confirm(t('leadDialog.confirmDelete', { name: lead.name || lead.phone }))) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.leads, lead.id));
      await writeAudit(profile, 'lead.delete', lead.id, lead.name);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const statusOptions: LeadStatus[] = status === 'sold' ? ['sold'] : ['new', 'talking', 'lost'];

  return (
    <>
      <DialogTitle>{lead ? lead.name || t('leadDialog.lead') : t('leadDialog.newLead')}</DialogTitle>
      <DialogContent>
        {lead && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {t('leadDialog.added', { when: shortDateTime(lead.createdAt) })}
            {lead.lastContactAt ? t('leadDialog.lastContact', { when: shortDateTime(lead.lastContactAt) }) : ''}
            {lead.soldAt ? t('leadDialog.soldFor', { when: shortDateTime(lead.soldAt), price: `$${(lead.soldPrice || 0).toLocaleString('en-US')}` }) : ''}
          </Typography>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 1 }}>
          <TextField label={t('leadDialog.name')} value={name} onChange={(e) => setName(e.target.value)} autoFocus={!lead} />
          <TextField select label={t('leadDialog.channel')} value={channel} onChange={(e) => setChannel(e.target.value as LeadChannel)}>
            {CHANNELS.map((c) => <MenuItem key={c} value={c}>{t(`leads.channels.${c}`, { defaultValue: CHANNEL_LABEL[c] })}</MenuItem>)}
          </TextField>
          <TextField label={t('leadDialog.phone')} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField label={t('leadDialog.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Box>
        <Box sx={{ mt: 1.5 }}>
          <CartPicker value={cartChoice} onChange={(c) => setCartChoice(c)} />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 1.5 }}>
          <TextField select label={t('leadDialog.status')} value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)}
            helperText={status !== 'sold' ? t('leadDialog.statusHelp') : ' '}>
            {statusOptions.map((s) => <MenuItem key={s} value={s}>{t(`leads.status.${s}`, { defaultValue: LEAD_STATUS_LABEL[s] })}</MenuItem>)}
          </TextField>
          <TextField label={t('leadDialog.followUp')} type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} helperText={t('leadDialog.followUpHelp')} />
          {manager && (
            <TextField select label={t('leadDialog.owner')} value={ownerUid} onChange={(e) => setOwnerUid(e.target.value)}>
              {users.map((u) => <MenuItem key={u.uid} value={u.uid}>{u.name || u.email}</MenuItem>)}
              {ownerUid && !users.some((u) => u.uid === ownerUid) && <MenuItem value={ownerUid}>{userName(ownerUid)}</MenuItem>}
            </TextField>
          )}
        </Box>
        <TextField fullWidth multiline minRows={2} label={t('leadDialog.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} sx={{ mt: 1.5, mb: 1.5 }} />
        <ContactPanel key={cartId || 'none'} name={name} phone={phone} email={email} cart={cart} onContact={onContact} />
        {!lead && contactedAt > 0 && <Typography variant="caption" color="text.secondary">{t('leadDialog.contactRecorded')}</Typography>}
        {notificationId && !lead && (
          <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={markHandled} onChange={(e) => setMarkHandled(e.target.checked)} />}
            label={t('leadDialog.markHandled')} />
        )}
        {lead && <LeadSalesPanel lead={lead} />}
        {lead?.phone && <Box sx={{ mt: 2 }}><CustomerTimeline phone={lead.phone} compact /></Box>}
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {lead && manager && <Button color="error" onClick={remove}>{t('leadDialog.delete')}</Button>}
        <Box sx={{ flexGrow: 1 }} />
        {lead && lead.status !== 'sold' && <Button color="success" onClick={() => setSelling(true)}>{t('leadDialog.markSold')}</Button>}
        {lead && lead.status === 'sold' && <Button onClick={() => setReview(true)}>{t('leadDialog.reviewRequest')}</Button>}
        <Button onClick={onClose}>{t('leadDialog.cancel')}</Button>
        <Button variant="contained" disabled={busy} onClick={save}>{lead ? t('leadDialog.save') : t('leadDialog.addLead')}</Button>
      </DialogActions>
      <MarkSoldDialog lead={selling ? lead || null : null} onClose={() => { setSelling(false); onClose(); }} />
      <ReviewRequestDialog open={review} onClose={() => setReview(false)} lead={lead} />
    </>
  );
}
