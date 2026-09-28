import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Divider, TextField, Typography } from '@mui/material';
import { QrCodeScanner } from '@mui/icons-material';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { auth, functions } from '../config/firebase';
import { isNativeApp, nativePlatform } from './platform';
import { installId } from './deviceSession';

/** Phone app sign-in screen: pair with a QR code or typed code from the dashboard. */
const PairThisPhone: React.FC = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isNativeApp()) return null;

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
      const fn = httpsCallable<Record<string, string>, { customToken: string }>(functions, 'mpPairDevice');
      const res = await fn({ ...payload, installId: installId(), platform: nativePlatform(), ...info } as Record<string, string>);
      await signInWithCustomToken(auth, res.data.customToken);
      navigate('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pairing failed.');
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
        scanInstructions: 'Scan the pairing QR code from TIGON IOT → Devices → Pair a phone',
      });
      if (res.ScanResult) await pair({ token: res.ScanResult });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan cancelled.');
    }
  };

  return (
    <Box sx={{ mt: 3 }}>
      <Divider sx={{ mb: 2 }}>or pair this phone</Divider>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        On a computer open TIGON IOT → Devices → <b>Pair a phone</b>, then scan the QR code or type the code.
      </Typography>
      <Button fullWidth variant="outlined" startIcon={<QrCodeScanner />} onClick={scan} disabled={busy} sx={{ mb: 1.5 }}>
        Scan pairing QR code
      </Button>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          fullWidth
          label="Pairing code"
          placeholder="ABCD-EFGH"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          slotProps={{ htmlInput: { autoCapitalize: 'characters', autoCorrect: 'off', maxLength: 9 } }}
        />
        <Button variant="contained" disabled={busy || code.replace(/[^A-Z0-9]/g, '').length !== 8} onClick={() => pair({ code })}>
          Pair
        </Button>
      </Box>
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
    </Box>
  );
};

export default PairThisPhone;
