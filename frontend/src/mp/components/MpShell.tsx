import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import {
  Alert, Box, Button, Chip, CircularProgress, FormControl, InputLabel, MenuItem, Paper, Select, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { Storefront } from '@mui/icons-material';
import DashboardLayout from '../../components/Layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../config/firebase';
import { LEGACY_USERS } from '../constants';
import { timeAgo } from '../cartUtils';
import { useMp } from '../MpDataContext';

const TABS = [
  { label: 'Home', path: '/mp' },
  { label: 'Find a Cart', path: '/mp/find' },
  { label: 'Locations', path: '/mp/locations' },
  { label: 'Browse', path: '/mp/browse' },
  { label: 'Profiles', path: '/mp/profiles' },
  { label: 'Accounts', path: '/mp/accounts', admin: true },
];

function activeTab(pathname: string): string | false {
  if (pathname === '/mp' || pathname === '/mp/') return '/mp';
  const hit = TABS.find((t) => t.path !== '/mp' && pathname.startsWith(t.path));
  return hit ? hit.path : false;
}

/** First-visit setup: display name + optional legacy identity (keeps old posted history). */
export const ProfileSetup: React.FC<{ editing?: boolean; onDone?: () => void }> = ({ editing, onDone }) => {
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

  const claimed = new Set(users.filter((u) => u.uid !== currentUser?.uid && u.legacyId).map((u) => u.legacyId));

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await saveProfile({ name: name.trim(), legacyId, role: bootstrapAdmin ? 'admin' : 'sales' });
      onDone?.();
    } catch (e) {
      console.error(e);
      setError('Could not save your profile. Only verified @tigongolfcarts.com accounts can use MP Assistant.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ p: 3, maxWidth: 520 }}>
      <Typography variant="h5" color="primary" gutterBottom>{editing ? 'Your MP profile' : 'Set up MP Assistant'}</Typography>
      {!editing && (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Your posted carts and listing wording are tracked per user. New users start with the sales role; an admin can
          promote you on the Accounts tab.
        </Typography>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TextField fullWidth label="Display name" value={name} onChange={(e) => setName(e.target.value)} sx={{ mb: 2 }} />
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Previous MP Assistant identity</InputLabel>
        <Select label="Previous MP Assistant identity" value={legacyId} onChange={(e) => setLegacyId(e.target.value)}>
          <MenuItem value="">None — I'm new</MenuItem>
          {LEGACY_USERS.map((u) => (
            <MenuItem key={u.id} value={u.id} disabled={claimed.has(u.id)}>
              {u.name}{claimed.has(u.id) ? ' (claimed)' : ''}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {bootstrapAdmin && <Alert severity="info" sx={{ mb: 2 }}>Your email is listed as an MP Assistant admin.</Alert>}
      <Button variant="contained" onClick={submit} disabled={saving || !name.trim()}>
        {saving ? 'Saving…' : editing ? 'Save' : 'Start using MP Assistant'}
      </Button>
    </Paper>
  );
};

const MpShell: React.FC<{ children: React.ReactNode; adminOnly?: boolean }> = ({ children, adminOnly }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, isAdmin, carts, cartsLoading, cartsError, ensureCartsLoaded, syncStatus } = useMp();

  useEffect(() => {
    if (profile) ensureCartsLoaded();
  }, [profile, ensureCartsLoaded]);

  let body: React.ReactNode = children;
  if (profile === undefined) body = <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>;
  else if (profile === null) body = <ProfileSetup />;
  else if (adminOnly && !isAdmin) body = <Alert severity="warning">This page needs the MP Assistant admin role.</Alert>;

  return (
    <DashboardLayout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1, flexWrap: 'wrap' }}>
        <Storefront color="primary" />
        <Typography variant="h4" color="primary" sx={{ flexGrow: 1 }}>MP Assistant</Typography>
        {profile && (
          <>
            <Chip label={`${carts.length}${cartsLoading ? '+' : ''} carts`} variant="outlined" />
            {syncStatus?.finishedAt && (
              <Chip
                size="small"
                color={syncStatus.ok ? 'default' : 'error'}
                label={syncStatus.ok ? `DMS synced ${timeAgo(syncStatus.finishedAt)}` : 'DMS sync failed'}
                title={syncStatus.error || syncStatus.warning || ''}
              />
            )}
            <Chip
              label={`${profile.name} · ${profile.role}`}
              color={isAdmin ? 'primary' : 'default'}
              onClick={() => navigate('/mp/profiles?me=1')}
            />
          </>
        )}
      </Box>
      {profile && (
        <Tabs
          value={activeTab(location.pathname)}
          onChange={(_, v) => navigate(v)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
        >
          {TABS.filter((t) => !t.admin || isAdmin).map((t) => <Tab key={t.path} value={t.path} label={t.label} />)}
        </Tabs>
      )}
      {cartsError && <Alert severity="error" sx={{ mb: 2 }}>{cartsError}</Alert>}
      {body}
    </DashboardLayout>
  );
};

export default MpShell;
