import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  InputLabel, ListSubheader, MenuItem, Select, TextField, Typography,
} from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import { useMp } from '../mp/MpDataContext';
import { DEALERSHIPS } from '../mp/constants';
import { groupAccounts } from '../mp/cartUtils';
import type { DeviceDoc } from '../mp/types';
import { locationLabel, nextDeviceNumber } from './phoneSetup';

interface PairingCode {
  token: string;
  code: string;
  expiresAt: number;
  qr: string;
}

/**
 * Computer side of phone setup: choose the phone number (#0003), location, person and Facebook account, then show a
 * one-time QR code. The phone app scans it (sign-in screen or Devices → "Scan setup QR code") and is set up.
 */
const PairPhoneDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { profile, users, accounts } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  const [forUserId, setForUserId] = useState('');
  const [numberInput, setNumberInput] = useState<string | null>(null);
  const [locationId, setLocationId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [replaceId, setReplaceId] = useState('');
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Managers see every phone (for free numbers); members only their own.
  useEffect(() => {
    if (!open || !profile) return;
    const q = isManager ? collection(db, 'devices') : query(collection(db, 'devices'), where('userId', '==', profile.uid));
    return onSnapshot(q, (s) => setDevices(s.docs.map((d) => ({ id: d.id, ...d.data() }) as DeviceDoc)), () => setDevices([]));
  }, [open, profile, isManager]);

  useEffect(() => {
    if (!pairing) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pairing]);

  const suggested = useMemo(() => nextDeviceNumber(devices), [devices]);
  const deviceNumber = (numberInput ?? suggested).trim();
  const taken = devices.find((d) => d.status !== 'revoked' && d.deviceNumber && d.deviceNumber === deviceNumber);
  const owner = users.find((u) => u.uid === (forUserId || profile?.uid));
  const account = accounts.find((a) => a.id === accountId);

  const create = async () => {
    if (!/^[A-Za-z0-9-]{1,12}$/.test(deviceNumber)) { setError('Enter a phone number like 0003 (letters, digits, "-").'); return; }
    if (taken && replaceId !== taken.id) { setError(`#${deviceNumber} is already used by ${taken.deviceName}. Pick another number or choose "Replace".`); return; }
    setBusy(true);
    setError('');
    try {
      const fn = httpsCallable<Record<string, string>, PairingCode>(functions, 'mpCreatePairingCode');
      const res = await fn({
        ...(forUserId ? { forUserId } : {}), deviceNumber, locationId, accountId,
        ...(taken && replaceId === taken.id ? { replaceDeviceId: taken.id } : {}),
      });
      setPairing(res.data);
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a setup code.');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setPairing(null);
    setError('');
    setNumberInput(null);
    setReplaceId('');
    onClose();
  };

  const secondsLeft = pairing ? Math.max(0, Math.round((pairing.expiresAt - now) / 1000)) : 0;
  const expired = !!pairing && secondsLeft === 0;

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Set up a phone</DialogTitle>
      <DialogContent>
        {!profile && <Alert severity="info">Open MP Assistant once to set up your profile, then set up phones here.</Alert>}
        {profile && !pairing && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Typography color="text.secondary">
              1) Fill this in. 2) Click <b>Create setup QR code</b>. 3) On the phone, open the TIGON IOT app and tap
              <b> Scan setup QR code</b> (on the sign-in screen, or Devices if already signed in). The phone signs in as the
              person you choose — no password needed.
            </Typography>
            <TextField label="Phone number (on the team)" value={deviceNumber} onChange={(e) => { setNumberInput(e.target.value.toUpperCase()); setReplaceId(''); }}
              helperText={taken ? `Already used by ${taken.deviceName}` : `The number written on the phone, e.g. 0003. Next free: ${suggested || '—'}`}
              error={!!taken && replaceId !== taken.id} slotProps={{ htmlInput: { maxLength: 12 } }} />
            {taken && (
              <Alert severity="warning" action={
                <Button color="inherit" size="small" onClick={() => setReplaceId(replaceId === taken.id ? '' : taken.id)}>
                  {replaceId === taken.id ? 'Undo' : 'Replace it'}
                </Button>
              }>
                {replaceId === taken.id ? `The old phone ${taken.deviceName} will be retired when the new one is set up.` : 'This number is already set up on another phone.'}
              </Alert>
            )}
            <FormControl fullWidth>
              <InputLabel>Location</InputLabel>
              <Select label="Location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <MenuItem value="">(none)</MenuItem>
                {DEALERSHIPS.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
              </Select>
            </FormControl>
            {isManager && (
              <FormControl fullWidth>
                <InputLabel>User (who uses this phone)</InputLabel>
                <Select label="User (who uses this phone)" value={forUserId} onChange={(e) => setForUserId(e.target.value)}>
                  <MenuItem value="">Me ({profile.name})</MenuItem>
                  {users.filter((u) => u.uid !== profile.uid).map((u) => (
                    <MenuItem key={u.uid} value={u.uid}>{u.name || u.email}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <FormControl fullWidth>
              <InputLabel>Facebook account</InputLabel>
              <Select label="Facebook account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <MenuItem value="">(choose later)</MenuItem>
                {groupAccounts(accounts).flatMap(([g, list]) => list.length ? [
                  <ListSubheader key={`g-${g}`}>{locationLabel(g) || g}</ListSubheader>,
                  ...list.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>),
                ] : [])}
              </Select>
            </FormControl>
          </Box>
        )}
        {pairing && (
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ mb: 1 }}>
              <b>#{deviceNumber}</b>{owner ? ` · ${owner.name || owner.email}` : ''}{locationId ? ` · ${locationLabel(locationId)}` : ''}{account ? ` · ${account.name}` : ''}
            </Typography>
            <Box sx={{ display: 'inline-block', p: 2, bgcolor: 'white', borderRadius: 2, opacity: expired ? 0.2 : 1 }}>
              <QRCodeSVG value={pairing.qr} size={240} />
            </Box>
            <Typography variant="h4" sx={{ fontFamily: 'monospace', letterSpacing: 4, mt: 1 }}>{pairing.code}</Typography>
            <Typography color={expired ? 'error' : 'text.secondary'}>
              {expired ? 'Expired — make a new code.' : `On the phone: TIGON IOT app → Scan setup QR code. Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')} · one phone only`}
            </Typography>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        {pairing && !expired && <Button onClick={() => { setPairing(null); setNumberInput(null); setReplaceId(''); }}>Set up another phone</Button>}
        <Button onClick={close}>{pairing ? 'Done' : 'Cancel'}</Button>
        {profile && (!pairing || expired) && (
          <Button variant="contained" onClick={create} disabled={busy} startIcon={busy ? <CircularProgress size={16} /> : undefined}>
            {pairing ? 'New code' : 'Create setup QR code'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default PairPhoneDialog;
