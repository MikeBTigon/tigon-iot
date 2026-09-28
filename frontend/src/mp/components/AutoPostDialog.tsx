import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel,
  MenuItem, Radio, RadioGroup, Select, TextField, Typography,
} from '@mui/material';
import { db } from '../../config/firebase';
import { useMp } from '../MpDataContext';
import { cartTitle } from '../cartLogic';
import { groupAccounts } from '../cartUtils';
import { queueCart } from '../queue';
import type { DeviceDoc, MpCart } from '../types';
import { seenLabel } from '../../devices/deviceStatus';

const toLocalInput = (ms: number) => {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

/**
 * "Auto Post": queue this cart to a person's phone. When it's due, the phone gets a push;
 * tapping it opens the Prepare-listing screen with everything ready to publish.
 */
const AutoPostDialog: React.FC<{ cart: MpCart; open: boolean; onClose: (queued?: boolean) => void }> = ({ cart, open, onClose }) => {
  const { profile, users, accounts } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [assignee, setAssignee] = useState(profile?.uid || '');
  const [deviceId, setDeviceId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [variation, setVariation] = useState(0);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState(() => toLocalInput(Date.now() + 60 * 60 * 1000));
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !assignee) return;
    return onSnapshot(
      query(collection(db, 'devices'), where('userId', '==', assignee)),
      (snap) =>
        setDevices(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as DeviceDoc)
            .filter((d) => d.source === 'tigon-iot-app' && d.status !== 'revoked'),
        ),
      () => setDevices([]),
    );
  }, [open, assignee]);

  // Suggest accounts owned by the assignee first.
  const accountOptions = useMemo(() => {
    const assigneeKeys = [assignee, users.find((u) => u.uid === assignee)?.legacyId].filter(Boolean);
    const mine = accounts.filter((a) => assigneeKeys.includes(a.owner));
    return { mine, grouped: groupAccounts(accounts) };
  }, [accounts, assignee, users]);

  const submit = async () => {
    if (!profile) return;
    const scheduledAt = when === 'now' ? Date.now() : new Date(at).getTime();
    if (when === 'later' && (!scheduledAt || scheduledAt < Date.now() - 60000)) {
      setError('Pick a time in the future.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const account = accounts.find((a) => a.id === accountId);
      await queueCart(profile, cart, {
        assignedUserId: assignee,
        deviceId,
        accountId,
        accountName: account?.name || '',
        variation,
        scheduledAt,
      });
      onClose(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not queue this cart.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => onClose()} fullWidth maxWidth="sm">
      <DialogTitle>Auto Post · {cartTitle(cart)}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <Typography variant="body2" color="text.secondary">
          The phone gets a notification when it's time. Tapping it opens this cart with the listing, photos and
          Marketplace ready — the person just reviews and taps <b>Publish</b>.
        </Typography>
        {isManager && (
          <FormControl fullWidth>
            <InputLabel>Who posts it</InputLabel>
            <Select label="Who posts it" value={assignee} onChange={(e) => { setAssignee(e.target.value); setDeviceId(''); setAccountId(''); }}>
              {users.map((u) => <MenuItem key={u.uid} value={u.uid}>{u.name || u.email}{u.uid === profile?.uid ? ' (me)' : ''}</MenuItem>)}
            </Select>
          </FormControl>
        )}
        <FormControl fullWidth>
          <InputLabel>Phone</InputLabel>
          <Select label="Phone" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <MenuItem value="">Any of their phones</MenuItem>
            {devices.map((d) => (
              <MenuItem key={d.id} value={d.id}>{d.deviceName} — {seenLabel(d)}{d.fcmToken ? '' : ' (notifications off)'}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {!devices.length && (
          <Alert severity="info">No paired phone for this person yet — it will still wait in their queue in the app.</Alert>
        )}
        <FormControl fullWidth>
          <InputLabel>Facebook account</InputLabel>
          <Select label="Facebook account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <MenuItem value="">Let them choose</MenuItem>
            {accountOptions.mine.length > 0 && <MenuItem disabled>— Their accounts —</MenuItem>}
            {accountOptions.mine.map((a) => (
              <MenuItem key={`m-${a.id}`} value={a.id} disabled={!!cart.postedAccounts[a.id]}>
                {a.name}{cart.postedAccounts[a.id] ? ' (already posted)' : ''}
              </MenuItem>
            ))}
            {accountOptions.grouped.flatMap(([g, list]) => [
              <MenuItem key={`g-${g}`} disabled>— {g} —</MenuItem>,
              ...list.map((a) => (
                <MenuItem key={a.id} value={a.id} disabled={!!cart.postedAccounts[a.id]}>
                  {a.name}{cart.postedAccounts[a.id] ? ' (already posted)' : ''}
                </MenuItem>
              )),
            ])}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>Listing</InputLabel>
          <Select label="Listing" value={variation} onChange={(e) => setVariation(Number(e.target.value))}>
            {[0, 1, 2, 3, 4].map((i) => <MenuItem key={i} value={i}>Variation #{i + 1}</MenuItem>)}
          </Select>
        </FormControl>
        <RadioGroup row value={when} onChange={(e) => setWhen(e.target.value as 'now' | 'later')}>
          <FormControlLabel value="now" control={<Radio />} label="Send now" />
          <FormControlLabel value="later" control={<Radio />} label="Schedule" />
        </RadioGroup>
        {when === 'later' && (
          <TextField type="datetime-local" label="Send at" value={at} onChange={(e) => setAt(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={busy || !assignee}>
          {busy ? 'Queuing…' : when === 'now' ? 'Send to phone' : 'Schedule'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AutoPostDialog;
