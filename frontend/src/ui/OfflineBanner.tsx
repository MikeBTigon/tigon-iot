import React, { useEffect, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { CloudOff } from '@mui/icons-material';
import { useT } from '../i18n';

const initialOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine);

/**
 * "You're offline" banner (browser online/offline events). Firestore keeps working from its local cache
 * and queues writes, so this only informs the user. Shows a short "Back online" note on reconnect.
 */
const OfflineBanner: React.FC = () => {
  const t = useT();
  const [online, setOnline] = useState(initialOnline);
  const [justBack, setJustBack] = useState(false);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      setJustBack(true);
    };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return (
    <>
      {!online && (
        <Alert severity="warning" icon={<CloudOff />} role="status" aria-live="polite" sx={{ mb: 2 }}>
          {t('offline.banner')}
        </Alert>
      )}
      <Snackbar
        open={online && justBack}
        autoHideDuration={3000}
        onClose={() => setJustBack(false)}
        message={t('offline.back')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
    </>
  );
};

export default OfflineBanner;
