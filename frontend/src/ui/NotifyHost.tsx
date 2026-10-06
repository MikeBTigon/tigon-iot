import React, { useEffect, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { NOTIFY_EVENT } from './notify';
import type { NotifyTone } from './notify';

/** Shows messages sent with notify(). */
const NotifyHost: React.FC = () => {
  const [msg, setMsg] = useState<{ text: string; tone: NotifyTone; key: number } | null>(null);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; tone: NotifyTone }>).detail;
      setMsg({ ...d, key: Date.now() });
    };
    window.addEventListener(NOTIFY_EVENT, h);
    return () => window.removeEventListener(NOTIFY_EVENT, h);
  }, []);
  return (
    <Snackbar key={msg?.key} open={!!msg} autoHideDuration={msg?.tone === 'error' ? 9000 : 6000} onClose={() => setMsg(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      {msg ? <Alert severity={msg.tone} variant="filled" onClose={() => setMsg(null)} sx={{ width: '100%' }}>{msg.text}</Alert> : undefined}
    </Snackbar>
  );
};

export default NotifyHost;
