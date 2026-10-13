import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Divider, Grid, Paper, Stack, Typography,
} from '@mui/material';
import {
  AccountCircle, ChevronRight, Devices, Email, Logout, NotificationsActive, Palette, Storefront, Tune, Webhook, LockReset,
} from '@mui/icons-material';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/Layout/DashboardLayout';
import PreferencesControls from '../ui/PreferencesControls';
import PhoneAlertsCard from '../native/PhoneAlertsCard';
import { isNativeApp } from '../native/platform';
import { disablePhoneAlerts } from '../native/phoneAlerts';
import { useMp } from '../mp/MpDataContext';
import { ProfileSetup } from '../mp/components/MpShell';
import { canSee, type MinRole } from '../mp/navRegistry';
import { ROLE_LABELS } from '../mp/constants';
import { useT } from '../i18n';

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <Paper sx={{ p: { xs: 2, sm: 3 }, height: '100%' }}>
    <Typography variant="h6" component="h2" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
      {icon} {title}
    </Typography>
    <Divider sx={{ mb: 2 }} />
    {children}
  </Paper>
);

interface HubLink { title: string; text: string; to: string; min: MinRole; icon: React.ReactNode }

const LINKS: HubLink[] = [
  { title: 'Phones', text: 'Set up a phone, see which phones are online, rename or remove one.', to: '/devices', min: 'sales', icon: <Devices /> },
  { title: 'MP Assistant settings', text: 'Manager approval for posts, default phone, relist reminder and logo.', to: '/mp/settings', min: 'admin', icon: <Storefront /> },
  { title: 'Sell more settings', text: 'Leads & speed, texting, quotes & booking, inventory, reviews & referrals.', to: '/mp/sales-settings', min: 'admin', icon: <Tune /> },
  { title: 'Website forms settings', text: 'Defaults for every website, spam protection, connections and who can do what.', to: '/wh/settings', min: 'admin', icon: <Webhook /> },
];

/** One settings page: my account, display & language, phone alerts, and links to the team settings pages. */
const Settings: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const { currentUser, logout, resetPassword } = useAuth();
  const { profile } = useMp();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const email = currentUser?.email || '';
  const role = profile?.role;

  const run = async (fn: () => Promise<void>, ok: string, fail: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
    } catch {
      setMsg({ ok: false, text: fail });
    } finally {
      setBusy(false);
    }
  };

  const sendReset = () => run(() => resetPassword(email), `We emailed a password reset link to ${email}.`, 'Could not send the email. Please try again in a minute.');
  const sendVerify = () => run(
    async () => { if (currentUser) await sendEmailVerification(currentUser); },
    `We emailed a confirmation link to ${email}.`,
    'Could not send the email. Please try again in a minute.',
  );

  const signOut = async () => {
    setBusy(true);
    try {
      // A signed-out phone must stop receiving this user's alerts.
      if (isNativeApp() && currentUser) await disablePhoneAlerts(currentUser.uid).catch(() => undefined);
      await logout();
      navigate('/login');
    } catch {
      setMsg({ ok: false, text: 'Could not sign out. Please try again.' });
      setBusy(false);
    }
  };

  const links = LINKS.filter((l) => canSee(role, l.min));

  return (
    <DashboardLayout>
      <Typography variant="h4" component="h1" color="primary" sx={{ mb: 2, fontSize: { xs: '1.5rem', sm: '2rem' } }}>
        {t('nav.settings')}
      </Typography>
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Section icon={<AccountCircle />} title="My account">
            <Stack spacing={2}>
              <Box>
                <Typography variant="body2" color="text.secondary">Email</Typography>
                <Typography sx={{ fontWeight: 500, wordBreak: 'break-all' }}>{email}</Typography>
                {currentUser && !currentUser.emailVerified && (
                  <Button size="small" startIcon={<Email />} onClick={sendVerify} disabled={busy} sx={{ mt: 0.5, px: 0 }}>
                    Send the confirmation email again
                  </Button>
                )}
              </Box>
              {profile && (
                <Box>
                  <Typography variant="body2" color="text.secondary">Role</Typography>
                  <Typography sx={{ fontWeight: 500 }}>{ROLE_LABELS[profile.role] || profile.role}</Typography>
                </Box>
              )}
              {profile && (
                <Box sx={{ '& > .MuiPaper-root': { p: 0, boxShadow: 'none', maxWidth: 'none', bgcolor: 'transparent' } }}>
                  <ProfileSetup editing onDone={() => setMsg({ ok: true, text: 'Saved.' })} />
                </Box>
              )}
              <Divider />
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Forgot your password or want a new one? We&apos;ll email you a link to choose a new password.
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button variant="outlined" startIcon={<LockReset />} onClick={sendReset} disabled={busy || !email}>
                    Email me a password link
                  </Button>
                  <Button variant="outlined" color="inherit" startIcon={<Logout />} onClick={signOut} disabled={busy}>
                    {t('layout.logout')}
                  </Button>
                </Stack>
              </Box>
            </Stack>
          </Section>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={2} sx={{ height: '100%' }}>
            <Section icon={<Palette />} title={t('prefs.title')}>
              <PreferencesControls />
            </Section>
            <Section icon={<NotificationsActive />} title="Phone alerts">
              {isNativeApp() ? (
                <PhoneAlertsCard />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Alerts for new messages and leads come to your phone through the TIGON IOT app. Open the app on your phone
                  and turn on alerts there.{' '}
                  <Button component={RouterLink} to="/download" size="small" sx={{ px: 0.5 }}>{t('nav.download', 'Download app')}</Button>
                </Typography>
              )}
            </Section>
          </Stack>
        </Grid>

        {links.length > 0 && (
          <Grid size={12}>
            <Typography variant="h6" component="h2" sx={{ mt: 1, mb: 1 }}>More settings</Typography>
            <Grid container spacing={2}>
              {links.map((l) => (
                <Grid key={l.to} size={{ xs: 12, sm: 6, lg: 3 }}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardActionArea component={RouterLink} to={l.to} sx={{ height: '100%' }}>
                      <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                        <Box sx={{ color: 'primary.main', display: 'flex', pt: 0.25 }} aria-hidden>{l.icon}</Box>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography sx={{ fontWeight: 600 }}>{l.title}</Typography>
                          <Typography variant="body2" color="text.secondary">{l.text}</Typography>
                        </Box>
                        <ChevronRight color="action" aria-hidden />
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Grid>
        )}
      </Grid>
    </DashboardLayout>
  );
};

export default Settings;
