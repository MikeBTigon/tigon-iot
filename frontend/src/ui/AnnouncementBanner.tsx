import React, { useState } from 'react';
import { Alert, Button, IconButton, Stack } from '@mui/material';
import { Campaign, Close } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { readLocal, writeLocal } from './prefs';
import { useT } from '../i18n';

/**
 * "What's new" notes. Add an entry with a new id to announce something; closing one (or tapping its button)
 * hides only that one, on that device, for good.
 */
const ANNOUNCEMENTS: Array<{ id: string; textKey: string; link: string }> = [
  { id: 'financing-calculator-2026-10', textKey: 'announcement.financingCalculator', link: '/mp/finance' },
  { id: 'request-a-change-2026-10', textKey: 'announcement.requestChange', link: '/requests' },
];
const dismissKey = (id: string) => `tigon.announcement.dismissed.${id}`;

/** Shown at the top of every signed-in page, on the website and in the phone app. */
const AnnouncementBanner: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(() => new Set(ANNOUNCEMENTS.filter((a) => readLocal(dismissKey(a.id))).map((a) => a.id)));

  const dismiss = (id: string) => {
    writeLocal(dismissKey(id), '1');
    setDismissed((s) => new Set(s).add(id));
  };

  // Hide a note while you're on the page it points to.
  const shown = ANNOUNCEMENTS.filter((a) => !dismissed.has(a.id) && pathname !== a.link);
  if (!shown.length) return null;
  return (
    <Stack spacing={1} sx={{ mb: 2 }}>
      {shown.map((a) => (
        <Alert
          key={a.id}
          severity="success"
          icon={<Campaign />}
          // MUI drops the built-in X when `action` is set, so the X sits next to Open here.
          action={
            <>
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  dismiss(a.id);
                  navigate(a.link);
                }}
              >
                {t('announcement.open')}
              </Button>
              <IconButton color="inherit" size="small" aria-label={t('common.close')} onClick={() => dismiss(a.id)}>
                <Close fontSize="small" />
              </IconButton>
            </>
          }
        >
          {t(a.textKey)}
        </Alert>
      ))}
    </Stack>
  );
};

export default AnnouncementBanner;
