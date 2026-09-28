import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Typography } from '@mui/material';
import { NotificationsActive, NotificationsOff } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { isNativeApp, nativePlatform } from './platform';
import { disablePhoneAlerts, enablePhoneAlerts, isPhoneAlertsOn } from './phoneAlerts';

/** "Get alerts on this phone" — shown only inside the phone app. */
const PhoneAlertsCard: React.FC = () => {
  const { currentUser } = useAuth();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const uid = currentUser?.uid;

  useEffect(() => {
    if (!uid || !isNativeApp()) return;
    isPhoneAlertsOn(uid).then(setOn).catch(() => setOn(false));
  }, [uid]);

  if (!isNativeApp() || !uid) return null;

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      if (on) {
        await disablePhoneAlerts(uid);
        setOn(false);
      } else {
        const name = `${currentUser?.email?.split('@')[0] || 'My'} ${nativePlatform() === 'ios' ? 'iPhone' : 'Android'} (app)`;
        await enablePhoneAlerts(uid, name);
        setOn(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change alerts.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card sx={{ mb: 3, borderLeft: '4px solid', borderColor: on ? 'success.main' : 'warning.main' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        {on ? <NotificationsActive color="success" sx={{ fontSize: 40 }} /> : <NotificationsOff color="warning" sx={{ fontSize: 40 }} />}
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6">Alerts on this phone</Typography>
          <Typography variant="body2" color="text.secondary">
            {on === null
              ? 'Checking…'
              : on
                ? 'This phone gets a push alert for every new notification from your worker phones.'
                : 'Turn on to get a push alert for every new notification from your worker phones.'}
          </Typography>
        </Box>
        <Button variant={on ? 'outlined' : 'contained'} disabled={busy || on === null} onClick={toggle}>
          {busy ? 'Working…' : on ? 'Turn off' : 'Turn on alerts'}
        </Button>
        {error && <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>}
      </CardContent>
    </Card>
  );
};

export default PhoneAlertsCard;
