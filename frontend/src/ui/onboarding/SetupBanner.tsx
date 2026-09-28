import React, { useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Alert, Box, Button, IconButton, LinearProgress, Typography } from '@mui/material';
import { Close, RocketLaunch } from '@mui/icons-material';
import { useMp } from '../../mp/MpDataContext';
import { useT } from '../../i18n';
import { prefsOf, readLocal, writeLocal } from '../prefs';
import { useSetupProgress } from './useSetupProgress';

const DISMISS_KEY = 'tigon.setupBannerDismissedAt';
const DISMISS_FOR_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * "Finish setup (2/4)" banner shown in MpShell until the user completes (or skips through) the setup
 * guide at /mp/welcome. Dismissing hides it on this device for 3 days. Never redirects.
 */
const SetupBanner: React.FC = () => {
  const t = useT();
  const { pathname } = useLocation();
  const { profile } = useMp();
  const [dismissedAt, setDismissedAt] = useState(() => Number(readLocal(DISMISS_KEY) || 0));
  // Date.now() at mount is fine here: the 3-day window doesn't need to tick live.
  const [now] = useState(() => Date.now());
  const show = !!profile && !prefsOf(profile).onboardingDone && pathname !== '/mp/welcome' && now - dismissedAt > DISMISS_FOR_MS;
  const progress = useSetupProgress(show);
  if (!show) return null;

  const dismiss = () => {
    const ts = Date.now();
    writeLocal(DISMISS_KEY, String(ts));
    setDismissedAt(ts);
  };

  return (
    <Alert
      severity="info"
      icon={<RocketLaunch />}
      sx={{ mb: 2, alignItems: 'center' }}
      action={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Button color="inherit" size="small" variant="outlined" component={RouterLink} to="/mp/welcome">
            {t('shell.continue')}
          </Button>
          <IconButton color="inherit" size="small" aria-label={t('shell.dismiss')} onClick={dismiss}>
            <Close fontSize="small" />
          </IconButton>
        </Box>
      }
    >
      <Typography sx={{ fontWeight: 600 }}>{t('shell.finishSetup', { done: progress.done, total: 4 })}</Typography>
      <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>{t('shell.finishSetupHint')}</Typography>
      <LinearProgress
        variant="determinate"
        value={(progress.done / 4) * 100}
        aria-label={t('onboarding.progress')}
        sx={{ mt: 0.75, maxWidth: 240, borderRadius: 1 }}
      />
    </Alert>
  );
};

export default SetupBanner;
