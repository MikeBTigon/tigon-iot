import React, { useState } from 'react';
import { Alert, Box, Button, Paper, Typography } from '@mui/material';
import { HourglassTop, Block } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

/**
 * Full-page message for people whose team account isn't approved yet ('pending') or was turned off
 * ('disabled'). Mounted by the app guard (see useMemberStatus).
 */
const PendingApproval: React.FC<{ status?: 'pending' | 'disabled' }> = ({ status = 'pending' }) => {
  const { currentUser, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const disabled = status === 'disabled';

  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      await logout();
      window.location.assign('/login');
    } catch {
      setError('Could not sign out. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'background.default' }}>
      <Paper sx={{ p: { xs: 3, sm: 4 }, maxWidth: 480, width: '100%', textAlign: 'center' }}>
        {disabled
          ? <Block color="disabled" sx={{ fontSize: 56, mb: 1 }} aria-hidden />
          : <HourglassTop color="primary" sx={{ fontSize: 56, mb: 1 }} aria-hidden />}
        <Typography variant="h5" component="h1" color="primary" gutterBottom>
          {disabled ? 'Your account is turned off' : 'Thanks for signing up!'}
        </Typography>
        {disabled ? (
          <Typography sx={{ mb: 2 }}>
            An admin turned off <b>{currentUser?.email}</b>. If you think this is a mistake, ask your manager or an admin to turn it back on.
          </Typography>
        ) : (
          <>
            <Typography sx={{ mb: 1 }}>
              An admin needs to approve your account before you can use TIGON IOT.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Tip: tell your manager you signed up so they can approve you quickly. This page opens the app
              by itself once you're approved — or tap &ldquo;Check again&rdquo;.
            </Typography>
          </>
        )}
        {error && <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>{error}</Alert>}
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          {!disabled && (
            <Button variant="contained" onClick={() => window.location.reload()} disabled={busy}>Check again</Button>
          )}
          <Button variant={disabled ? 'contained' : 'outlined'} onClick={signOut} disabled={busy}>Sign out</Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default PendingApproval;
