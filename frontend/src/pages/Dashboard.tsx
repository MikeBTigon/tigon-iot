import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress, FormControl, InputAdornment, InputLabel, MenuItem,
  Paper, Select, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Notifications as NotificationsIcon,
  OpenInNew,
  PersonAdd as PersonAddIcon,
  Replay as ReplayIcon,
  Search as SearchIcon,
  Smartphone as SmartphoneIcon,
} from '@mui/icons-material';
import { collection, deleteField, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/Layout/DashboardLayout';
import MpDashboardCard from '../mp/components/MpDashboardCard';
import PhoneAlertsCard from '../native/PhoneAlertsCard';
import { useMp } from '../mp/MpDataContext';
import NewLeadDialog, { type LeadSourceNotification } from '../mp/crm/NewLeadDialog';
import { isWanted, toMs, when } from '../devices/notificationFilter';
import type { Notification } from '../devices/notificationFilter';
import ThisDeviceTab from '../devices/ThisDeviceTab';
import { useSharedDevices } from '../devices/sharedDevices';
import TimeAgo from '../ui/TimeAgo';

/** notifications/{id}: written by worker phones (old worker app) and by notification echo (mpEcho). */
/** "Mine": all of the person's notifications (up to MAX), sorted here — equality query, no extra index needed. */
const MAX = 2000;
/** "All phones": newest first, read STEP at a time (single-field orderBy only). */
const STEP = 200;
/** Cards drawn per "Load more". */
const PAGE = 50;

type StatusFilter = 'all' | 'unhandled' | 'handled';
type Note = Notification & { leadId?: string };

/** One notification card (memoized: typing in the filters doesn't redraw every card). */
const NoteCard = React.memo(function NoteCard({ n, num, who, onHandled, onMakeLead, member }: {
  n: Note;
  num: string;
  who: string;
  member: boolean;
  onHandled: (n: Note, handled: boolean) => void;
  onMakeLead: (n: Note) => void;
}) {
  const ms = when(n);
  const handledMs = toMs(n.handledAt);
  const fmt = (v: number) => (v ? new Date(v).toLocaleString() : 'Unknown time');
  return (
    <Paper elevation={1} sx={{ p: 2, borderLeft: 4, borderLeftColor: n.isHandled ? 'success.main' : 'error.main' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            {num && <Chip label={`#${num}`} size="small" color="secondary" sx={{ fontWeight: 700 }} />}
            <Chip label={n.sourceDeviceName || 'Unknown phone'} size="small" color="primary" icon={<SmartphoneIcon />} />
            {who && <Chip label={who} size="small" variant="outlined" />}
            {n.sourceApp && <Chip label={n.sourceApp} size="small" variant="outlined" />}
            <Chip label={n.isHandled ? 'Handled' : 'Unhandled'} size="small" color={n.isHandled ? 'success' : 'error'} />
          </Box>
          <Typography variant="body1" sx={{ mb: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{n.text || 'No message'}</Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {fmt(ms)}{ms ? <> · <TimeAgo ms={ms} /></> : null}
          </Typography>
          {n.isHandled && (
            <Typography variant="caption" color="success.main" component="div">
              Handled{n.handledByName ? ` by ${n.handledByName}` : ''}{handledMs ? ` · ${fmt(handledMs)}` : ''}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'row', sm: 'column' }, gap: 1, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {!n.isHandled ? (
            <Button size="small" variant="outlined" color="success" startIcon={<CheckCircleIcon />} onClick={() => onHandled(n, true)}>
              Mark handled
            </Button>
          ) : (
            <Tooltip title="Mark as not handled">
              <Button size="small" color="inherit" startIcon={<ReplayIcon />} onClick={() => onHandled(n, false)}>Undo</Button>
            </Tooltip>
          )}
          {member && n.leadId && (
            <Button size="small" variant="contained" startIcon={<OpenInNew />} component={RouterLink} to={`/mp/leads?lead=${encodeURIComponent(n.leadId)}`}>
              Open lead
            </Button>
          )}
          {member && !n.leadId && (
            <Button size="small" variant="outlined" startIcon={<PersonAddIcon />} onClick={() => onMakeLead(n)}>
              Make lead
            </Button>
          )}
        </Box>
      </Box>
    </Paper>
  );
});

/** Organization tab: everyone's (managers) or my phone notifications, 50 cards at a time. */
const OrganizationDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { profile: mpProfile, users, userName } = useMp();
  const isManager = mpProfile?.role === 'admin' || mpProfile?.role === 'manager';
  const [scope, setScope] = useState<'team' | 'mine'>('team');
  const teamView = isManager && scope === 'team';

  const [loaded, setLoaded] = useState<{ key: string; items: Note[]; raw: number } | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [person, setPerson] = useState('all');
  const [phone, setPhone] = useState('all');
  const [search, setSearch] = useState('');
  const [leadFrom, setLeadFrom] = useState<LeadSourceNotification | null>(null);
  const [teamLimit, setTeamLimit] = useState(STEP);
  const [cards, setCards] = useState(PAGE);
  const uid = currentUser?.uid || '';
  const dataKey = teamView ? `team|${teamLimit}` : `mine|${uid}`;

  // Managers/admins: everyone's notifications, newest first, STEP at a time. Others: their own.
  // Queries use single-field indexes only (sorted in the browser), so no extra Firestore index is needed.
  useEffect(() => {
    if (!uid) return;
    const q = teamView
      ? query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(teamLimit))
      : query(collection(db, 'notifications'), where('targetUserId', '==', uid), limit(MAX));
    return onSnapshot(
      q,
      (snap) => {
        setLoaded({
          key: dataKey,
          raw: snap.size,
          items: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Note).filter(isWanted).sort((a, b) => when(b) - when(a)),
        });
        setError('');
      },
      (e) => {
        console.error('Error fetching notifications:', e);
        setLoaded({ key: dataKey, raw: 0, items: [] });
        setError(e.message);
      },
    );
  }, [uid, teamView, teamLimit, dataKey]);
  // Keep showing the previous list while a bigger page loads.
  const notifications = loaded && (loaded.key === dataKey || loaded.key.startsWith('team|') === teamView) ? loaded.items : null;
  const mayHaveMore = teamView ? (loaded?.raw ?? 0) >= teamLimit : false;

  // Phone numbers (#0003) for notifications that only carry a device id (e.g. from the old worker app).
  const { rows: deviceRows } = useSharedDevices(mpProfile === undefined ? null : isManager ? 'all' : uid || null);
  const devices = useMemo(() => new Map((deviceRows || []).map((d) => [d.id, d])), [deviceRows]);

  const numberOf = useCallback((n: Notification) => {
    if (n.sourceDeviceNumber) return n.sourceDeviceNumber;
    const d = devices.get(n.sourceDeviceId || n.deviceId || '');
    return d?.deviceNumber || '';
  }, [devices]);
  const phoneKey = useCallback((n: Notification) => (numberOf(n) ? `#${numberOf(n)}` : n.sourceDeviceName || 'Unknown phone'), [numberOf]);

  const all = useMemo(() => notifications || [], [notifications]);
  const people = useMemo(() => [...new Set(all.map((n) => n.targetUserId).filter(Boolean) as string[])], [all]);
  const phones = useMemo(() => [...new Set(all.map(phoneKey))].sort(), [all, phoneKey]);
  const needle = search.trim().toLowerCase();
  const shown = useMemo(() => all.filter((n) =>
    (status === 'all' || (status === 'handled' ? !!n.isHandled : !n.isHandled)) &&
    (person === 'all' || n.targetUserId === person) &&
    (phone === 'all' || phoneKey(n) === phone) &&
    (!needle || `${n.text || ''} ${n.sourceDeviceName || ''} ${n.sourceApp || ''}`.toLowerCase().includes(needle))),
  [all, status, person, phone, needle, phoneKey]);
  const stats = useMemo(() => {
    const unhandled = all.filter((n) => !n.isHandled).length;
    return { total: all.length, unhandled, handled: all.length - unhandled };
  }, [all]);

  const setHandled = useCallback(async (n: Note, handled: boolean) => {
    try {
      await updateDoc(doc(db, 'notifications', n.id), handled
        ? { isHandled: true, handledAt: new Date(), handledBy: currentUser?.uid || '', handledByName: mpProfile?.name || currentUser?.email || '' }
        : { isHandled: false, handledAt: deleteField(), handledBy: deleteField(), handledByName: deleteField() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [currentUser, mpProfile]);
  const makeLead = useCallback((n: Note) => {
    setLeadFrom({ id: n.id, text: n.text, sourceDeviceName: n.sourceDeviceName, deviceId: n.deviceId, sourceDeviceId: n.sourceDeviceId });
  }, []);

  const pick = (filter: StatusFilter) => {
    setStatus(filter);
    setCards(PAGE);
  };

  const statCard = (value: number, label: string, bg: string, icon: React.ReactNode, filter: StatusFilter) => (
    <Card sx={{ bgcolor: bg, color: 'common.white', flex: '1 1 180px' }}>
      <CardActionArea onClick={() => pick(filter)} aria-pressed={status === filter} aria-label={`${label}: ${value}. Show these`}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 600 }}>{value}</Typography>
            <Typography variant="body2">{label}</Typography>
          </Box>
          {icon}
        </CardContent>
      </CardActionArea>
    </Card>
  );

  const loadMore = () => {
    if (cards < shown.length) setCards((c) => c + PAGE);
    else if (mayHaveMore) {
      setTeamLimit((l) => l + STEP);
      setCards((c) => c + PAGE);
    }
  };
  const canLoadMore = cards < shown.length || mayHaveMore;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 4 }}>
        {statCard(stats.total, teamView ? 'Total notifications (all phones)' : 'Total notifications', 'primary.light', <NotificationsIcon sx={{ fontSize: 48, opacity: 0.8 }} aria-hidden />, 'all')}
        {statCard(stats.unhandled, 'Unhandled', 'error.main', <SmartphoneIcon sx={{ fontSize: 48, opacity: 0.8 }} aria-hidden />, 'unhandled')}
        {statCard(stats.handled, 'Handled', 'success.main', <CheckCircleIcon sx={{ fontSize: 48, opacity: 0.8 }} aria-hidden />, 'handled')}
      </Box>

      <PhoneAlertsCard />
      <MpDashboardCard />

      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h5" component="h2" color="primary">Notifications</Typography>
          {isManager && (
            <ToggleButtonGroup size="small" exclusive value={scope} onChange={(_, v) => { if (v) { setScope(v); setCards(PAGE); } }}>
              <ToggleButton value="team">All phones</ToggleButton>
              <ToggleButton value="mine">Mine</ToggleButton>
            </ToggleButtonGroup>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="dash-status">Status</InputLabel>
            <Select labelId="dash-status" label="Status" value={status} onChange={(e) => pick(e.target.value as StatusFilter)}>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="unhandled">Unhandled</MenuItem>
              <MenuItem value="handled">Handled</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="dash-phone">Phone</InputLabel>
            <Select labelId="dash-phone" label="Phone" value={phone} onChange={(e) => { setPhone(e.target.value); setCards(PAGE); }}>
              <MenuItem value="all">All phones</MenuItem>
              {phones.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </Select>
          </FormControl>
          {teamView && (
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="dash-person">Person</InputLabel>
              <Select labelId="dash-person" label="Person" value={person} onChange={(e) => { setPerson(e.target.value); setCards(PAGE); }}>
                <MenuItem value="all">Everyone</MenuItem>
                {people.map((u) => <MenuItem key={u} value={u}>{userName(u) || users.find((x) => x.uid === u)?.email || u}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          <TextField size="small" placeholder="Search message" value={search} onChange={(e) => { setSearch(e.target.value); setCards(PAGE); }}
            slotProps={{
              htmlInput: { 'aria-label': 'Search message' },
              input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
            }} />
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>Could not load notifications: {error}</Alert>}
        {!teamView && all.length >= MAX && <Alert severity="info" sx={{ mb: 2 }}>Showing the newest {MAX} notifications.</Alert>}
        {teamView && mayHaveMore && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
            Counts are for the newest {teamLimit} notifications. Use &ldquo;Load more&rdquo; at the bottom to go further back.
          </Typography>
        )}

        {notifications === null ? (
          <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress aria-label="Loading" /></Box>
        ) : shown.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <NotificationsIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} aria-hidden />
            <Typography variant="h6" color="text.secondary">
              {all.length ? 'No notifications match these filters' : 'No notifications yet'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Facebook messages, Messenger chats and DMs from the phones appear here.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {shown.slice(0, cards).map((n) => (
              <NoteCard
                key={n.id}
                n={n}
                num={numberOf(n)}
                who={teamView && n.targetUserId ? userName(n.targetUserId) : ''}
                member={!!mpProfile}
                onHandled={setHandled}
                onMakeLead={makeLead}
              />
            ))}
          </Box>
        )}
        {notifications !== null && canLoadMore && (
          <Box sx={{ textAlign: 'center', mt: 2 }}>
            <Button variant="outlined" onClick={loadMore}>
              Load more{cards < shown.length ? ` (${shown.length - cards} more here)` : ''}
            </Button>
          </Box>
        )}
      </Paper>
      <NewLeadDialog notification={leadFrom} onClose={() => setLeadFrom(null)} />
    </Box>
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
      <Typography variant="h4" component="h1" gutterBottom color="primary" sx={{ mb: 1, fontSize: { xs: '1.5rem', sm: '2rem' } }}>Phone alerts dashboard</Typography>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="device" label="This Device" />
        <Tab value="org" label="Organization" />
      </Tabs>
      {tab === 'device' ? <ThisDeviceTab /> : <OrganizationDashboard />}
    </DashboardLayout>
  );
};

export default Dashboard;
