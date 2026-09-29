import React, { useState } from 'react';
import { Alert, Box, Button, TextField } from '@mui/material';
import { QrCodeScanner } from '@mui/icons-material';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth';
import { authErrorMessage } from '../context/authErrors';
import { auth, functions } from '../config/firebase';
import { nativePlatform } from './platform';
import { installId } from './deviceSession';

/**
 * Phone side of phone setup: scan the setup QR shown on the computer (TIGON IOT → Devices → Set up a phone),
 * or type its 8-letter code. The phone is registered with the number / location / person / account chosen on the
 * computer and signs in as that person. The phone never shows a code itself.
 */
const ScanSetupCode: React.FC<{ onDone: (deviceName: string) => void }> = ({ onDone }) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Phone registered but automatic sign-in isn't enabled on the server: finish with that account's password.
  const [finish, setFinish] = useState<{ email: string; deviceName: string } | null>(null);
  const [password, setPassword] = useState('');

  const pair = async (payload: { token?: string; code?: string }) => {
    setBusy(true);
    setError('');
    try {
      let info = { model: '', osVersion: '', appVersion: '' };
      try {
        const [{ Device }, { App }] = await Promise.all([import('@capacitor/device'), import('@capacitor/app')]);
        const [d, a] = await Promise.all([Device.getInfo(), App.getInfo()]);
        info = { model: `${d.manufacturer} ${d.model}`.trim(), osVersion: d.osVersion, appVersion: `${a.version} (${a.build})` };
      } catch {
        // device info is optional
      }
      const fn = httpsCallable<Record<string, string>, { customToken: string; deviceName?: string }>(functions, 'mpPairDevice');
      const res = await fn({ ...payload, installId: installId(), platform: nativePlatform(), ...info } as Record<string, string>);
      if (res.data.customToken) await signInWithCustomToken(auth, res.data.customToken);
      onDone(res.data.deviceName || 'This phone');
    } catch (e) {
      const details = (e as { details?: { email?: string; deviceName?: string } }).details;
      if (details?.email) {
        setFinish({ email: details.email, deviceName: details.deviceName || 'This phone' });
        setError('');
      } else {
        setError(e instanceof Error ? e.message : 'Setup failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    setError('');
    try {
      const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import('@capacitor/barcode-scanner');
      const res = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
        scanInstructions: 'Scan the setup QR code on the computer (TIGON IOT → Devices → Set up a phone)',
      });
      if (res.ScanResult) await pair({ token: res.ScanResult });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan cancelled.');
    }
  };

  const signIn = async () => {
    if (!finish) return;
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, finish.email, password);
      onDone(finish.deviceName);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (finish) {
    return (
      <Box>
        <Alert severity="info" sx={{ mb: 1.5 }}>
          <b>{finish.deviceName}</b> is set up. To finish, enter the password for <b>{finish.email}</b>.
          (An admin can switch on automatic sign-in so this step isn't needed — see Help.)
        </Alert>
        <TextField fullWidth size="small" type="password" label={`Password for ${finish.email}`} value={password}
          onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" sx={{ mb: 1 }}
          onKeyDown={(e) => { if (e.key === 'Enter' && password) signIn(); }} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" onClick={signIn} disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in and finish'}</Button>
          <Button onClick={() => { setFinish(null); setPassword(''); setError(''); }} disabled={busy}>Cancel</Button>
        </Box>
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      </Box>
    );
  }

  return (
    <Box>
      <Button fullWidth size="large" variant="contained" startIcon={<QrCodeScanner />} onClick={scan} disabled={busy} sx={{ mb: 1.5 }}>
        {busy ? 'Setting up…' : 'Scan setup QR code'}
      </Button>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          fullWidth
          label="Or type the setup code"
          placeholder="ABCD-EFGH"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          slotProps={{ htmlInput: { autoCapitalize: 'characters', autoCorrect: 'off', maxLength: 9 } }}
        />
        <Button variant="outlined" disabled={busy || code.replace(/[^A-Z0-9]/g, '').length !== 8} onClick={() => pair({ code })}>
          Set up
        </Button>
      </Box>
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
    </Box>
  );
};

export default ScanSetupCode;
