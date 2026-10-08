import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, MenuItem, TextField, Typography } from '@mui/material';
import { CheckCircle, Notifications as NotificationsIcon, Smartphone } from '@mui/icons-material';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useMp } from '../mp/MpDataContext';
import type { DeviceDoc } from '../mp/types';
import { isNativeApp } from '../native/platform';
import { deviceDocId } from '../native/deviceSession';
import { isOnline, seenLabel } from './deviceStatus';
import { isWanted } from './notificationFilter';
import type { Notification } from './notificationFilter';

const PICK_KEY = 'tigon.dashboardDevice';
const MAX = 2000;

const readPick = () => { try { return localStorage.getItem(PICK_KEY) || ''; } catch { return ''; } };
const savePick = (id: string) => { try { localStorage.setItem(PICK_KEY, id); } catch { /* private mode */ } };
const label = (d: DeviceDoc) => `${d.deviceNumber ? `#${d.deviceNumber} ` : ''}${d.deviceName || 'Phone'}`;

/**
 * "This Device" tab: total / unhandled / handled notifications for the device the dashboard is running on.
 * - Phone app: the device is this install's device doc (app_<installId>_<uid>), found automatically.
 * - Computer: notifications only come from phones, so the person picks which phone this computer shows
 *   (remembered in this browser; defaults to their most recently seen phone).
 */
const ThisDeviceTab: React.FC = () => {
  const { currentUser } = useAuth();
  const { profile, userName } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const native = isNativeApp();
  const [device, setDevice] = useState<DeviceDoc | null | undefined>(undefined);
  const [choices, setChoices] = useState<DeviceDoc[] | undefined>(undefined);
  const [pick, setPick] = useState(readPick);
  const [loaded, setLoaded] = useState<{ key: string; items: Notification[] } | null>(null);
  const [error, setError] = useState('');

  // Phone app: this phone's own device doc.
  useEffect(() => {
    if (!native || !currentUser) return;
    return onSnapshot(doc(db, 'devices', deviceDocId(currentUser.uid)),
      (s) => setDevice(s.exists() ? ({ id: s.id, ...s.data() } as DeviceDoc) : null),
      () => setDevice(null));
  }, [native, currentUser]);

  // Computer: the phones this person may pick from (managers: every phone; others: their own).
  useEffect(() => {
    if (native || !currentUser || profile === undefined) return;
    const q = isManager ? collection(db, 'devices') : query(collection(db, 'devices'), where('userId', '==', currentUser.uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DeviceDoc).filter((d) => d.status !== 'revoked');
      list.sort((a, b) => Number(b.userId === currentUser.uid) - Number(a.userId === currentUser.uid) || (b.lastSeen || 0) - (a.lastSeen || 0));
      setChoices(list);
    }, (e) => { setChoices([]); setError(e.message); });
  }, [native, currentUser, profile, isManager]);

  const webDevice = useMemo(() => {
    if (native || !choices) return undefined;
    return choices.find((d) => d.id === pick) || choices.find((d) => d.userId === currentUser?.uid) || null;
  }, [native, choices, pick, currentUser]);
  const current = native ? device : webDevice;

  // Notifications that came from this device (same filter as the Organization tab).
  const devId = current?.id || '';
  const owner = current?.userId || '';
  const key = `${devId}|${owner}`;
  useEffect(() => {
    if (!devId || !owner) return;
    const q = query(collection(db, 'notifications'), where('targetUserId', '==', owner), limit(MAX));
    return onSnapshot(q, (snap) => {
      setLoaded({ key, items: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Notification)
        .filter((n) => isWanted(n) && (n.sourceDeviceId || n.deviceId) === devId) });
      setError('');
    }, (e) => { setLoaded({ key, items: [] }); setError(e.message); });
  }, [devId, owner, key]);
  const items = loaded?.key === key ? loaded.items : undefined;

  if (native && device === undefined) return <CircularProgress />;
  if (native && (device === null || device?.status === 'revoked' || device?.userId !== currentUser?.uid)) {
    return (
      <Alert severity="info" action={<Button color="inherit" component={RouterLink} to="/devices">Set up</Button>}>
        This phone isn&apos;t set up for your account yet, so it has no notifications of its own. Open Devices → Set up this phone.
        The Organization tab still shows everything.
      </Alert>
    );
  }
  if (!native && choices === undefined) return <CircularProgress />;
  if (!native && !webDevice) {
    return (
      <Alert severity="info">
        Notifications come from phones, and no phone is set up for your account yet. Set one up in the TIGON IOT app,
        or use the Organization tab.
      </Alert>
    );
  }

  const total = items?.length ?? 0;
  const unhandled = items ? items.filter((n) => !n.isHandled).length : 0;
  const handled = total - unhandled; // Total = Unhandled + Handled, always.
  const card = (value: number, text: string, bg: string, icon: React.ReactNode) => (
    <Card sx={{ bgcolor: bg, color: 'white', flex: '1 1 180px' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h3" sx={{ fontWeight: 600 }}>{items ? value : '…'}</Typography>
          <Typography variant="body2">{text}</Typography>
        </Box>
        {icon}
      </CardContent>
    </Card>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {native ? (
          <Typography variant="h6">{current ? label(current) : ''}</Typography>
        ) : (
          <TextField select size="small" label="This computer shows" value={current?.id || ''} sx={{ minWidth: 260 }}
            onChange={(e) => { setPick(e.target.value); savePick(e.target.value); }}
            helperText="Notifications come from phones — pick the phone this computer belongs with. Remembered on this computer.">
            {(choices || []).map((d) => (
              <MenuItem key={d.id} value={d.id}>{label(d)}{d.userId !== currentUser?.uid ? ` — ${userName(d.userId || '') || 'someone else'}` : ''}</MenuItem>
            ))}
          </TextField>
        )}
        {current && <Chip size="small" color={isOnline(current) ? 'success' : 'default'} label={isOnline(current) ? 'Online' : `Seen ${seenLabel(current)}`} />}
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>Could not load notifications: {error}</Alert>}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        {card(total, 'Total notifications', 'primary.light', <NotificationsIcon sx={{ fontSize: 48, opacity: 0.8 }} />)}
        {card(unhandled, 'Unhandled', 'error.main', <Smartphone sx={{ fontSize: 48, opacity: 0.8 }} />)}
        {card(handled, 'Handled', 'success.main', <CheckCircle sx={{ fontSize: 48, opacity: 0.8 }} />)}
      </Box>
      {items && items.length >= MAX && (
        <Typography variant="caption" color="text.secondary">Counted from this person&apos;s newest {MAX} notifications.</Typography>
      )}
    </Box>
  );
};

export default ThisDeviceTab;
