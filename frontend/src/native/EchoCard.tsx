import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, FormControlLabel, Paper, Switch, Typography } from '@mui/material';
import { NotificationsActive, Send, Settings } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { TigonEcho, echoSupported, ensureEcho, type EchoStatus } from './echo';

/** Phone app (Android): notification echo on/off, access permission, test. */
const EchoCard: React.FC = () => {
  const { currentUser } = useAuth();
  const [st, setSt] = useState<EchoStatus | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => {
    try {
      setSt(await TigonEcho.getStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!echoSupported()) return;
    const first = setTimeout(refresh, 0);
    // Coming back from Android settings → re-check the permission.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(first); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  if (!echoSupported() || !currentUser) return null;

  const run = async (fn: () => Promise<unknown>, done = '') => {
    setError('');
    setMsg('');
    try {
      await fn();
      if (done) setMsg(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    refresh();
  };

  const toggle = (enabled: boolean) => run(async () => {
    if (enabled) await ensureEcho(currentUser.uid, true);
    else await TigonEcho.configure({ enabled: false });
  });

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <NotificationsActive color="primary" />
        <Typography variant="h6" color="primary" sx={{ flexGrow: 1 }}>Notification echo</Typography>
        {st && <Chip size="small" color={st.access && st.enabled && st.configured ? 'success' : 'default'}
          label={st.access && st.enabled && st.configured ? 'Echoing' : 'Off'} />}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        This phone forwards the notifications it gets (Facebook, Messenger, …) to the TIGON IOT dashboard, labeled with
        this phone's number. It keeps working when the app is closed.
      </Typography>
      {st && !st.access && (
        <Alert severity="warning" sx={{ mb: 2 }} action={
          <Button color="inherit" size="small" startIcon={<Settings />} onClick={() => run(() => TigonEcho.openAccessSettings())}>Allow</Button>
        }>
          Step 1: allow <b>notification access</b> — tap Allow, find <b>TIGON IOT</b> and switch it on, then come back.
          <br />If the switch is greyed out or says <b>"Restricted setting"</b> (Android 13+ for apps installed from the
          website): open Android <b>Settings → Apps → TIGON IOT</b>, tap <b>⋮</b> (top right) → <b>Allow restricted
          settings</b>, then try again.
        </Alert>
      )}
      {st && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <FormControlLabel control={<Switch checked={st.enabled && st.configured} onChange={(e) => toggle(e.target.checked)} />}
            label="Echo notifications to the dashboard" />
          <FormControlLabel control={<Switch checked={st.onlyFacebook} onChange={(e) => run(() => TigonEcho.configure({ onlyFacebook: e.target.checked }))} />}
            label="Only Facebook & Messenger" />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mt: 1 }}>
            <Button variant="outlined" size="small" startIcon={<Send />} disabled={!st.configured || !st.enabled}
              onClick={() => run(() => TigonEcho.sendTest(), 'Test sent — it shows on the dashboard in a few seconds.')}>
              Send test
            </Button>
            <Typography variant="caption" color="text.secondary">
              {st.lastSentAt ? `Last sent ${new Date(st.lastSentAt).toLocaleString()}` : 'Nothing sent yet'}
              {st.queued ? ` · ${st.queued} waiting (no internet)` : ''}
              {st.lastError ? ` · last error: ${st.lastError}` : ''}
            </Typography>
          </Box>
        </Box>
      )}
      {msg && <Alert severity="success" sx={{ mt: 2 }}>{msg}</Alert>}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Paper>
  );
};

export default EchoCard;
