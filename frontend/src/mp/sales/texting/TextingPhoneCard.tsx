// Track 2 (texting) — phone app (Android): make this phone the store's texting phone. It then sends the store's
// texts to customers from its own number (checks in every 30 seconds) and passes customer replies on.
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, FormControl, InputLabel, MenuItem, Paper, Select, Typography,
} from '@mui/material';
import { Settings, Sms } from '@mui/icons-material';
import { useAuth } from '../../../context/AuthContext';
import { useMp } from '../../MpDataContext';
import { DEALERSHIPS, DEALERSHIP_BY_ID } from '../../constants';
import { isManager } from '../../crm/crmData';
import { deviceDocId } from '../../../native/deviceSession';
import { TigonEcho, ensureEcho } from '../../../native/echo';
import { TigonSms, smsStatus, smsSupported, type SmsStatus } from '../../../native/sms';
import { notify } from '../../../ui/notify';
import { useSalesSettings } from '../salesData';
import { smsAdmin, when } from './textingUi';

const STORES = DEALERSHIPS.filter((d) => d.id !== 'T0');
const storeName = (id: string) => (id === '*' ? 'every other store' : DEALERSHIP_BY_ID[id]?.name || id);

const TextingPhoneCard: React.FC = () => {
  const { currentUser } = useAuth();
  const { profile } = useMp();
  const { settings, loaded } = useSalesSettings();
  const [st, setSt] = useState<SmsStatus | null | undefined>(undefined);
  const [store, setStore] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    smsStatus().then(setSt).catch(() => setSt(null));
  }, []);

  useEffect(() => {
    if (!smsSupported()) return;
    const first = setTimeout(refresh, 0);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    const t = setInterval(refresh, 15_000);
    return () => { clearTimeout(first); clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  if (!smsSupported() || !currentUser || !loaded) return null;
  const manager = isManager(profile);
  const deviceId = deviceDocId(currentUser.uid);
  const map = settings.sms.senderDeviceByStore || {};
  const myStores = [
    ...Object.keys(map).filter((k) => map[k] === deviceId),
    ...(settings.sms.defaultSenderDeviceId === deviceId ? ['*'] : []),
  ];
  const isTextingPhone = myStores.length > 0;
  // Salespeople only see this on a phone that is already a texting phone.
  if (!manager && !isTextingPhone) return null;
  const pick = store || profile?.location || 'T1';
  const twilio = settings.sms.provider === 'twilio';

  if (st === null) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Texting phone</Typography>
        <Alert severity="info" sx={{ mt: 1 }}>Update the TIGON IOT app on this phone to use it as the store's texting phone.</Alert>
      </Paper>
    );
  }
  if (st === undefined) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const makeTextingPhone = () => run(async () => {
    // 1. The check-in runs through notification echo: make sure it has this phone's key.
    await ensureEcho(currentUser.uid, true);
    // 2. Android asks "Allow TIGON IOT to send and view SMS messages?"
    const s = await TigonSms.requestPermission();
    if (s.permission !== 'granted') {
      notify('Texting needs the SMS permission. Tap the button again and choose Allow.', 'error');
      return;
    }
    await TigonSms.setTextingPhone({ enabled: true });
    await smsAdmin.setPhone(pick, deviceId);
    notify(`This phone now sends texts for ${storeName(pick)}.`, 'success');
  });

  const turnOn = () => run(async () => {
    await ensureEcho(currentUser.uid);
    const s = await TigonSms.requestPermission();
    if (s.permission !== 'granted') throw new Error('Texting needs the SMS permission.');
    await TigonSms.setTextingPhone({ enabled: true });
  });

  const stop = () => run(async () => {
    await TigonSms.setTextingPhone({ enabled: false });
    for (const s of myStores) await smsAdmin.setPhone(s, '');
    notify('This phone no longer sends the store\'s texts.', 'info');
  });

  const working = isTextingPhone && st.canSend && st.notificationAccess && st.echoConfigured;

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Sms color="primary" />
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>Texting phone</Typography>
        {isTextingPhone && <Chip size="small" color={working ? 'success' : 'warning'} label={working ? 'Sending texts' : 'Needs attention'} />}
      </Box>

      {isTextingPhone ? (
        <Typography variant="body2" sx={{ mb: 1 }}>
          This phone sends the texts for <b>{myStores.map(storeName).join(', ')}</b> from its own number, and passes customer
          replies to the salesperson. Keep it charged, on Wi-Fi or data, and with the TIGON IOT app installed.
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Pick one Android phone per store (with a SIM card and a texting plan). Texts to customers — from salespeople and
          automatic ones — go out from this phone's number.
        </Typography>
      )}

      {twilio && <Alert severity="info" sx={{ mb: 1 }}>Texts are sent with Twilio right now (Sell more → Texting). This phone is only a backup.</Alert>}
      {!st.supported && <Alert severity="warning" sx={{ mb: 1 }}>This phone can't send texts (no SIM card).</Alert>}
      {isTextingPhone && !st.notificationAccess && (
        <Alert severity="warning" sx={{ mb: 1 }} action={
          <Button color="inherit" size="small" startIcon={<Settings />} onClick={() => run(() => TigonEcho.openAccessSettings())}>Allow</Button>
        }>
          Turn on <b>notification access</b> for TIGON IOT — the phone checks for texts to send through it, and it's how
          customer replies reach the salesperson.
        </Alert>
      )}
      {isTextingPhone && (!st.isTextingPhone || st.permission !== 'granted') && (
        <Alert severity="warning" sx={{ mb: 1 }} action={<Button color="inherit" size="small" disabled={busy} onClick={turnOn}>Turn on</Button>}>
          Texting is switched off on this phone{st.permission !== 'granted' ? ' (the SMS permission is not allowed)' : ''}.
        </Alert>
      )}

      {isTextingPhone && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
          {st.sentCount ? `${st.sentCount} texts sent` : 'No texts sent yet'}
          {st.lastSentAt ? ` · last one ${when(st.lastSentAt)}` : ''}
          {st.waiting ? ` · ${st.waiting} on the way` : ''}
          {st.lastPingAt ? ` · checked in ${when(st.lastPingAt)}` : ''}
          {st.lastError ? ` · last problem: ${st.lastError}` : ''}
        </Typography>
      )}

      {manager && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {!isTextingPhone && (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Store</InputLabel>
              <Select label="Store" value={pick} onChange={(e) => setStore(String(e.target.value))}>
                {STORES.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          {!isTextingPhone && (
            <Button variant="contained" disabled={busy || !st.supported} onClick={makeTextingPhone}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <Sms />}>
              Make this the texting phone for {storeName(pick)}
            </Button>
          )}
          {isTextingPhone && (
            <Button variant="outlined" color="inherit" size="small" disabled={busy} onClick={stop}>Stop texting from this phone</Button>
          )}
          {isTextingPhone && st.canSend && (
            <Button size="small" disabled={busy} onClick={() => run(() => TigonSms.checkNow())}>Check for texts now</Button>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default TextingPhoneCard;
