import React, { useState } from 'react';
import { Alert } from '@mui/material';
import { Campaign } from '@mui/icons-material';
import { readLocal, writeLocal } from './prefs';
import { useT } from '../i18n';

/** Bump the id to show a new announcement to everyone, including people who closed the last one. */
const ANNOUNCEMENT_ID = 'financing-calculator-2026-10';
const DISMISS_KEY = 'tigon.announcement.dismissed';

/** A one-time "what's new" note on the website and in the phone app. Closing it hides it on that device for good. */
const AnnouncementBanner: React.FC = () => {
  const t = useT();
  const [hidden, setHidden] = useState(() => readLocal(DISMISS_KEY) === ANNOUNCEMENT_ID);

  if (hidden) return null;
  return (
    <Alert
      severity="success"
      icon={<Campaign />}
      sx={{ mb: 2 }}
      onClose={() => {
        writeLocal(DISMISS_KEY, ANNOUNCEMENT_ID);
        setHidden(true);
      }}
    >
      {t('announcement.financingCalculator')}
    </Alert>
  );
};

export default AnnouncementBanner;
