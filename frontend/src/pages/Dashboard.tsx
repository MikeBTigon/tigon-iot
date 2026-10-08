import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, FormControl, InputAdornment, InputLabel, MenuItem,
  Paper, Select, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Notifications as NotificationsIcon,
  PersonAdd as PersonAddIcon,
  Replay as ReplayIcon,
  Search as SearchIcon,
  Smartphone as SmartphoneIcon,
} from '@mui/icons-material';
import { collection, deleteField, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/Layout/DashboardLayout';
import MpDashboardCard from '../mp/components/MpDashboardCard';
import PhoneAlertsCard from '../native/PhoneAlertsCard';
import { useMp } from '../mp/MpDataContext';
import NewLeadDialog, { type LeadSourceNotification } from '../mp/crm/NewLeadDialog';
import { isWanted, toMs, when } from '../devices/notificationFilter';
import type { DeviceInfo, Notification } from '../devices/notificationFilter';
import ThisDeviceTab from '../devices/ThisDeviceTab';

/** notifications/{id}: written by worker phones (old worker app) and by notification echo (mpEcho). */
const MAX = 2000;

type StatusFilter = 'all' | 'unhandled' | 'handled';

/** Organization tab: the organization-wide dashboard (unchanged). */
const OrganizationDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { profile: mpProfile, users, userName } = useMp();
  const isManager = mpProfile?.role === 'admin' || mpProfile?.role === 'manager';
  const [scope, setScope] = useState<'team' | 'mine'>('team');
  const teamView = isManager && scope === 'team';

  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [error, setError] = useState('');
  const [devices, setDevices] = useState<Map<string, DeviceInfo>>(new Map());
  const [status, setStatus] = useState<StatusFilter>('all');
  const [person, setPerson] = useState('all');
  const [phone, setPhone] = useState('all');
  const [search, setSearch] = useState('');
  const [leadFrom, setLeadFrom] = useState<LeadSourceNotification | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Managers/admins: everyone's notifications (newest first). Others: their own.
  // Queries use single-field indexes only (sorted in the browser), so no extra Firestore index is needed.
  useEffect(() => {
    if (!currentUser) return;
    const q = teamView
      ? query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(MAX))
      : query(collection(db, 'notifications'), where('targetUserId', '==', currentUser.uid), limit(MAX));
    return onSnapshot(
      q,
      (snap) => {
        setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Notification).filter(isWanted).sort((a, b) => when(b) - when(a)));
        setError('');
      },
      (e) => {
        console.error('Error fetching notifications:', e);
        setNotifications([]);
        setError(e.message);
      },
    );
  }, [currentUser, teamView]);

  // Phone numbers (#0003) for notifications that only carry a device id (e.g. from the old worker app).
  useEffect(() => {
    if (!currentUser || mpProfile === undefined) return;
    const q = isManager ? collection(db, 'devices') : query(collection(db, 'devices'), where('userId', '==', currentUser.uid));
    return onSnapshot(q, (snap) => {
      const m = new Map<string, DeviceInfo>();
      snap.docs.forEach((d) => m.set(d.id, { id: d.id, ...(d.data() as Omit<DeviceInfo, 'id'>) }));
      setDevices(m);
    }, () => undefined);
  }, [currentUser, isManager, mpProfile]);

  const numberOf = (n: Notification) => {
    if (n.sourceDeviceNumber) return n.sourceDeviceNumber;
    const d = devices.get(n.sourceDeviceId || n.deviceId || '');
    return d?.deviceNumber || '';
  };
  const phoneKey = (n: Notification) => numberOf(n) ? `#${numberOf(n)}` : n.sourceDeviceName || 'Unknown phone';

  const all = useMemo(() => notifications || [], [notifications]);
  const people = useMemo(() => [...new Set(all.map((n) => n.targetUserId).filter(Boolean) as string[])], [all]);
  const phones = useMemo(
    () => [...new Set(all.map(phoneKey))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- phoneKey depends on devices
    [all, devices],
  );
  const needle = search.trim().toLowerCase();
  const shown = all.filter((n) =>
    (status === 'all' || (status === 'handled' ? !!n.isHandled : !n.isHandled)) &&
    (person === 'all' || n.targetUserId === person) &&
    (phone === 'all' || phoneKey(n) === phone) &&
    (!needle || `${n.text || ''} ${n.sourceDeviceName || ''} ${n.sourceApp || ''}`.toLowerCase().includes(needle)),
  );
  const stats = {
    total: all.length,
    unhandled: all.filter((n) => !n.isHandled).length,
    handled: all.filter((n) => n.isHandled).length,
  };

  const setHandled = async (n: Notification, handled: boolean) => {
    try {
      await updateDoc(doc(db, 'notifications', n.id), handled
        ? { isHandled: true, handledAt: new Date(), handledBy: currentUser?.uid || '', handledByName: mpProfile?.name || currentUser?.email || '' }
        : { isHandled: false, handledAt: deleteField(), handledBy: deleteField(), handledByName: deleteField() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const fmt = (ms: number) => (ms ? new Date(ms).toLocaleString() : 'Unknown time');
  const ago = (ms: number) => (ms ? formatDistanceToNow(Math.min(ms, now), { addSuffix: true }) : '');

  const statCard = (value: number, label: string, bg: string, icon: React.ReactNode, filter: StatusFilter) => (
    <Card sx={{ bgcolor: bg, color: 'white', cursor: 'pointer', flex: '1 1 180px' }} onClick={() => setStatus(filter)}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h3" sx={{ fontWeight: 600 }}>{value}</Typography>
          <Typography variant="body2">{label}</Typography>
        </Box>
        {icon}
      </CardContent>
    </Card>
  );

  return (
    <>
      <Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 4 }}>
          {statCard(stats.total, teamView ? 'Total notifications (all phones)' : 'Total notifications', 'primary.light', <NotificationsIcon sx={{ fontSize: 48, opacity: 0.8 }} />, 'all')}
          {statCard(stats.unhandled, 'Unhandled', 'error.main', <SmartphoneIcon sx={{ fontSize: 48, opacity: 0.8 }} />, 'unhandled')}
          {statCard(stats.handled, 'Handled', 'success.main', <CheckCircleIcon sx={{ fontSize: 48, opacity: 0.8 }} />, 'handled')}
        </Box>

        <PhoneAlertsCard />
        <MpDashboardCard />

        <Paper sx={{ p: { xs: 2, sm: 3 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h5" color="primary">Notifications</Typography>
            {isManager && (
              <ToggleButtonGroup size="small" exclusive value={scope} onChange={(_, v) => v && setScope(v)}>
                <ToggleButton value="team">All phones</ToggleButton>
                <ToggleButton value="mine">Mine</ToggleButton>
              </ToggleButtonGroup>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="unhandled">Unhandled</MenuItem>
                <MenuItem value="handled">Handled</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Phone</InputLabel>
              <Select label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)}>
                <MenuItem value="all">All phones</MenuItem>
                {phones.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </Select>
            </FormControl>
            {teamView && (
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Person</InputLabel>
                <Select label="Person" value={person} onChange={(e) => setPerson(e.target.value)}>
                  <MenuItem value="all">Everyone</MenuItem>
                  {people.map((u) => <MenuItem key={u} value={u}>{userName(u) || users.find((x) => x.uid === u)?.email || u}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            <TextField size="small" placeholder="Search message" value={search} onChange={(e) => setSearch(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>Could not load notifications: {error}</Alert>}
          {all.length >= MAX && <Alert severity="info" sx={{ mb: 2 }}>Showing the newest {MAX} notifications.</Alert>}

          {notifications === null ? (
            <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
          ) : shown.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <NotificationsIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">
                {all.length ? 'No notifications match these filters' : 'No notifications yet'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Facebook messages, Messenger chats and DMs from the phones appear here.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {shown.map((n) => {
                const ms = when(n);
                const num = numberOf(n);
                const handledMs = toMs(n.handledAt);
                return (
                  <Paper key={n.id} elevation={1}
                    sx={{ p: 2, borderLeft: n.isHandled ? '4px solid #4caf50' : '4px solid #af1f31' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                          {num && <Chip label={`#${num}`} size="small" color="secondary" sx={{ fontWeight: 700 }} />}
                          <Chip label={n.sourceDeviceName || 'Unknown phone'} size="small" color="primary" icon={<SmartphoneIcon />} />
                          {teamView && n.targetUserId && <Chip label={userName(n.targetUserId)} size="small" variant="outlined" />}
                          {n.sourceApp && <Chip label={n.sourceApp} size="small" variant="outlined" />}
                          <Chip label={n.isHandled ? 'Handled' : 'Unhandled'} size="small" color={n.isHandled ? 'success' : 'error'} />
                        </Box>
                        <Typography variant="body1" sx={{ mb: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{n.text || 'No message'}</Typography>
                        <Typography variant="caption" color="text.secondary" component="div">
                          {fmt(ms)}{ms ? ` · ${ago(ms)}` : ''}
                        </Typography>
                        {n.isHandled && (
                          <Typography variant="caption" color="success.main" component="div">
                            Handled{n.handledByName ? ` by ${n.handledByName}` : ''}{handledMs ? ` · ${fmt(handledMs)}` : ''}
                          </Typography>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: { xs: 'row', sm: 'column' }, gap: 1, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        {!n.isHandled ? (
                          <Button size="small" variant="outlined" color="success" startIcon={<CheckCircleIcon />} onClick={() => setHandled(n, true)}>
                            Mark handled
                          </Button>
                        ) : (
                          <Tooltip title="Mark as not handled">
                            <Button size="small" color="inherit" startIcon={<ReplayIcon />} onClick={() => setHandled(n, false)}>Undo</Button>
                          </Tooltip>
                        )}
                        {mpProfile && (
                          <Button size="small" variant="outlined" startIcon={<PersonAddIcon />}
                            onClick={() => setLeadFrom({ id: n.id, text: n.text, sourceDeviceName: n.sourceDeviceName, deviceId: n.deviceId, sourceDeviceId: n.sourceDeviceId })}>
                            Make lead
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          )}
        </Paper>
        <NewLeadDialog notification={leadFrom} onClose={() => setLeadFrom(null)} />
      </Box>
    </>
  );
};

/**
 * Dashboard with two tabs on every device: "This Device" (always opens here) and "Organization".
 * The device is worked out at runtime (see ThisDeviceTab), so new devices need no setup.
 */
const Dashboard: React.FC = () => {
  const [tab, setTab] = useState<'device' | 'org'>('device');
  return (
    <DashboardLayout>
      <Typography variant="h4" gutterBottom color="primary" sx={{ mb: 1 }}>Dashboard</Typography>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="device" label="This Device" />
        <Tab value="org" label="Organization" />
      </Tabs>
      {tab === 'device' ? <ThisDeviceTab /> : <OrganizationDashboard />}
    </DashboardLayout>
  );
};

export default Dashboard;
