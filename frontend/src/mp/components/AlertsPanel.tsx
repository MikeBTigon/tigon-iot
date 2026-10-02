import React, { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { Alert, Box, Button, Chip, Paper, Typography } from '@mui/material';
import { NotificationsActive } from '@mui/icons-material';
import { db } from '../../config/firebase';
import { useMp } from '../MpDataContext';
import { timeAgo } from '../cartUtils';
import { COLLECTIONS } from '../constants';
import type { MpAlert } from '../types';

const KIND_LABEL: Record<MpAlert['kind'], string> = {
  device_offline: 'Phone offline',
  post_failed: 'Post failed',
  sync_failed: 'DMS sync failed',
  device_low_hours: 'Phone on too few hours',
};

function acknowledge(a: MpAlert, uid: string) {
  return updateDoc(doc(db, COLLECTIONS.alerts, a.id), { acknowledgedBy: uid, acknowledgedAt: Date.now() });
}

/** Managers: open alerts (offline phones, failed posts, failed syncs) with acknowledge. */
const AlertsPanel: React.FC = () => {
  const { profile, userName } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [alerts, setAlerts] = useState<MpAlert[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!isManager) return;
    return onSnapshot(
      query(collection(db, COLLECTIONS.alerts), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => setAlerts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MpAlert)),
      () => setAlerts([]),
    );
  }, [isManager]);

  if (!isManager) return null;
  const open = alerts.filter((a) => !a.acknowledgedAt);
  const list = showAll ? alerts : open;

  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <NotificationsActive color={open.length ? 'error' : 'disabled'} />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Alerts</Typography>
        <Chip size="small" color={open.length ? 'error' : 'default'} label={`${open.length} open`} />
        <Button size="small" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Open only' : 'Show all'}</Button>
      </Box>
      {!list.length && <Typography color="text.secondary">No {showAll ? '' : 'open '}alerts. Alerts also arrive as IoT notifications for managers.</Typography>}
      {list.map((a) => (
        <Alert
          key={a.id}
          severity={a.acknowledgedAt ? 'info' : a.kind === 'device_offline' ? 'warning' : 'error'}
          sx={{ mb: 1 }}
          action={!a.acknowledgedAt && <Button color="inherit" size="small" onClick={() => acknowledge(a, profile!.uid)}>Acknowledge</Button>}
        >
          <b>{KIND_LABEL[a.kind] || a.kind}</b> · {timeAgo(a.createdAt)} — {a.text}
          {a.acknowledgedAt && ` (acknowledged by ${userName(a.acknowledgedBy || '')})`}
        </Alert>
      ))}
    </Paper>
  );
};

export default AlertsPanel;
