import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  InputLabel, MenuItem, Select, Typography,
} from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { useMp } from '../mp/MpDataContext';

interface PairingCode {
  token: string;
  code: string;
  expiresAt: number;
  qr: string;
}

/** Shows a one-time QR code + typed code that a phone app uses to register to a user. */
const PairPhoneDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { profile, users } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [forUserId, setForUserId] = useState('');
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!pairing) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pairing]);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const fn = httpsCallable<{ forUserId?: string }, PairingCode>(functions, 'mpCreatePairingCode');
      const res = await fn(forUserId ? { forUserId } : {});
      setPairing(res.data);
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a pairing code.');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setPairing(null);
    setError('');
    onClose();
  };

  const secondsLeft = pairing ? Math.max(0, Math.round((pairing.expiresAt - now) / 1000)) : 0;
  const expired = !!pairing && secondsLeft === 0;

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>Pair a phone</DialogTitle>
      <DialogContent>
        {!profile && <Alert severity="info">Open MP Assistant once to set up your profile, then pair phones here.</Alert>}
        {profile && !pairing && (
          <>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Install the TIGON IOT app on the phone, tap <b>Pair this phone</b> on its sign-in screen, then scan the QR code
              or type the code. The phone signs in automatically — no password needed.
            </Typography>
            {isManager && (
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Phone belongs to</InputLabel>
                <Select label="Phone belongs to" value={forUserId} onChange={(e) => setForUserId(e.target.value)}>
                  <MenuItem value="">Me ({profile.name})</MenuItem>
                  {users.filter((u) => u.uid !== profile.uid).map((u) => (
                    <MenuItem key={u.uid} value={u.uid}>{u.name || u.email}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </>
        )}
        {pairing && (
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{ display: 'inline-block', p: 2, bgcolor: 'white', borderRadius: 2, opacity: expired ? 0.2 : 1 }}>
              <QRCodeSVG value={pairing.qr} size={220} />
            </Box>
            <Typography variant="h4" sx={{ fontFamily: 'monospace', letterSpacing: 4, mt: 1 }}>{pairing.code}</Typography>
            <Typography color={expired ? 'error' : 'text.secondary'}>
              {expired ? 'Expired — make a new code.' : `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')} · one use only`}
            </Typography>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Close</Button>
        {profile && (!pairing || expired) && (
          <Button variant="contained" onClick={create} disabled={busy} startIcon={busy ? <CircularProgress size={16} /> : undefined}>
            {pairing ? 'New code' : 'Create pairing code'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default PairPhoneDialog;
