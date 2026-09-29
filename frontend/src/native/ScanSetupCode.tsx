import React, { useState } from 'react';
import { Alert, Box, Button, TextField } from '@mui/material';
import { QrCodeScanner } from '@mui/icons-material';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
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
      setError(e instanceof Error ? e.message : 'Setup failed.');
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
