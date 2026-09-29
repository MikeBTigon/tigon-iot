import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import {
  Alert, Box, Button, Chip, CircularProgress, FormControl, InputLabel, MenuItem, Paper, Select, TextField, Typography,
} from '@mui/material';
import { Storefront } from '@mui/icons-material';
import DashboardLayout from '../../components/Layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../config/firebase';
import { LEGACY_USERS } from '../constants';
import { timeAgo } from '../cartUtils';
import { useMp } from '../MpDataContext';
import { useT } from '../../i18n';
import MpNav, { BOTTOM_NAV_HEIGHT } from '../../ui/MpNav';
import SetupBanner from '../../ui/onboarding/SetupBanner';
import HelpTip from '../help/HelpTip';

const ROLE_KEYS: Record<string, string> = { admin: 'shell.roleAdmin', manager: 'shell.roleManager', sales: 'shell.roleSales' };

/** First-visit setup: display name + optional legacy identity (keeps old posted history). */
export const ProfileSetup: React.FC<{ editing?: boolean; onDone?: () => void }> = ({ editing, onDone }) => {
  const t = useT();
  const { currentUser } = useAuth();
  const { profile, saveProfile, users } = useMp();
  const [name, setName] = useState(profile?.name || currentUser?.email?.split('@')[0] || '');
  const [legacyId, setLegacyId] = useState(profile?.legacyId || '');
  const [bootstrapAdmin, setBootstrapAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editing || !currentUser?.email) return;
    getDoc(doc(db, 'systemConfig', 'mpAssistant'))
      .then((s) => setBootstrapAdmin(((s.data()?.adminEmails as string[]) || []).includes(currentUser.email!)))
      .catch(() => setBootstrapAdmin(false));
  }, [editing, currentUser?.email]);

  // One person can run many phones/accounts, so an identity may be shared: show how many others use it.
  const usedBy = new Map<string, number>();
  for (const u of users) if (u.uid !== currentUser?.uid && u.legacyId) usedBy.set(u.legacyId, (usedBy.get(u.legacyId) || 0) + 1);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await saveProfile({ name: name.trim(), legacyId, role: bootstrapAdmin ? 'admin' : 'sales' });
      onDone?.();
    } catch (e) {
      console.error(e);
      setError(t('shell.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ p: 3, maxWidth: 520 }}>
      <Typography variant="h5" color="primary" gutterBottom>{editing ? t('shell.profileTitle') : t('shell.setupTitle')}</Typography>
      {!editing && (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {t('shell.setupIntro')}
        </Typography>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TextField fullWidth label={t('onboarding.displayName')} value={name} onChange={(e) => setName(e.target.value)} sx={{ mb: 2 }} />
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="mp-legacy-label">{t('shell.legacyIdentity')}</InputLabel>
        <Select labelId="mp-legacy-label" label={t('shell.legacyIdentity')} value={legacyId} onChange={(e) => setLegacyId(e.target.value)}>
          <MenuItem value="">{t('shell.legacyNone')}</MenuItem>
          {LEGACY_USERS.map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.name}{usedBy.get(u.id) ? ` ${t('shell.claimed').replace('{n}', String(usedBy.get(u.id)))}` : ''}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {bootstrapAdmin && <Alert severity="info" sx={{ mb: 2 }}>{t('shell.bootstrapAdmin')}</Alert>}
      <Button variant="contained" onClick={submit} disabled={saving || !name.trim()}>
        {saving ? t('shell.saving') : editing ? t('common.save') : t('shell.start')}
      </Button>
    </Paper>
  );
};

/**
 * Frame for every signed-in MP Assistant page: profile setup gate, header chips (carts, DMS sync, you),
 * section navigation (mp/navRegistry), the "Finish setup" banner, and the page body.
 */
const MpShell: React.FC<{ children: React.ReactNode; adminOnly?: boolean }> = ({ children, adminOnly }) => {
  const t = useT();
  const navigate = useNavigate();
  const { profile, isAdmin, carts, cartsLoading, cartsError, ensureCartsLoaded, syncStatus } = useMp();

  useEffect(() => {
    if (profile) ensureCartsLoaded();
  }, [profile, ensureCartsLoaded]);

  let body: React.ReactNode = children;
  if (profile === undefined) body = <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box>;
  else if (profile === null) body = <ProfileSetup />;
  else if (adminOnly && !isAdmin) body = <Alert severity="warning">{t('shell.adminOnly')}</Alert>;

  return (
    <DashboardLayout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1, flexWrap: 'wrap' }}>
        <Storefront color="primary" aria-hidden />
        <Typography variant="h4" component="h1" color="primary" sx={{ flexGrow: 1, fontSize: { xs: '1.35rem', sm: '1.5rem' } }}>
          {t('shell.title')}
        </Typography>
        {profile && (
          <>
            <Chip label={`${t('shell.carts', { count: carts.length })}${cartsLoading ? '+' : ''}`} variant="outlined" />
            {syncStatus?.finishedAt && (
              <Chip
                size="small"
                color={syncStatus.ok ? 'default' : 'error'}
                label={syncStatus.ok ? t('shell.dmsSynced', { ago: timeAgo(syncStatus.finishedAt) }) : t('shell.dmsFailed')}
                title={syncStatus.error || syncStatus.warning || ''}
              />
            )}
            <Chip
              label={`${profile.name} · ${ROLE_KEYS[profile.role] ? t(ROLE_KEYS[profile.role]) : profile.role}`}
              color={profile.role === 'sales' ? 'default' : 'primary'}
              onClick={() => navigate('/mp/profiles?me=1')}
              aria-label={`${t('shell.editProfile')}: ${profile.name}`}
            />
            <HelpTip article="post-3-taps" />
          </>
        )}
      </Box>
      {profile && <MpNav role={profile.role} />}
      {profile && <SetupBanner />}
      {cartsError && <Alert severity="error" sx={{ mb: 2 }}>{cartsError}</Alert>}
      {body}
      {/* Room for the phone bottom bar so it never covers the end of the page. */}
      {profile && <Box aria-hidden sx={{ display: { xs: 'block', sm: 'none' }, height: BOTTOM_NAV_HEIGHT }} />}
    </DashboardLayout>
  );
};

export default MpShell;
