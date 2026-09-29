import React, { useState } from 'react';
import { Alert, Box, Button, Paper, Typography } from '@mui/material';
import { sendEmailVerification } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authErrorMessage } from '../context/authErrors';

/** Shown when the signed-in account's email isn't verified yet — with a way forward (and out). */
const VerifyEmailGate: React.FC<{ user: User }> = ({ user }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: authErrorMessage(e) }); } finally { setBusy(false); }
  };

  const resend = () => run(async () => {
    await sendEmailVerification(user);
    setMsg({ ok: true, text: `Sent. Open the email to ${user.email} (check spam), tap the link, then come back and tap "I verified it".` });
  });
  const check = () => run(async () => {
    await user.reload();
    await user.getIdToken(true);
    if (user.emailVerified) window.location.reload();
    else setMsg({ ok: false, text: 'Not verified yet. Open the link in the email first (it may take a minute to arrive).' });
  });
  const signOut = () => run(async () => { await logout(); navigate('/login'); });

  return (
    <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', mt: 6 }}>
      <Paper sx={{ p: 3, maxWidth: 480, width: '100%' }}>
        <Typography variant="h5" color="primary" gutterBottom>Verify your email</Typography>
        <Typography sx={{ mb: 1 }}>
          <b>{user.email}</b> hasn't been verified yet. Open the verification email and tap its link.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Tip: phones set up with the QR code from the computer (Devices → Set up a phone) skip this step.
        </Typography>
        {msg && <Alert severity={msg.ok ? 'success' : 'warning'} sx={{ mb: 2 }}>{msg.text}</Alert>}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={check} disabled={busy}>I verified it</Button>
          <Button variant="outlined" onClick={resend} disabled={busy}>Send the email again</Button>
          <Button onClick={signOut} disabled={busy}>Sign out</Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default VerifyEmailGate;
