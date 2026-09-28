import React, { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  Alert, Box, Button, Chip, CircularProgress, List, ListItem, ListItemText, Paper, Typography,
} from '@mui/material';
import type { AlertColor } from '@mui/material';
import {
  AutoAwesome, Backup, CloudSync, ErrorOutline, Extension, NotificationsActive, PhoneIphone, Queue, Refresh,
} from '@mui/icons-material';
import { db, functions } from '../../config/firebase';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { COLLECTIONS, ONLINE_WINDOW_MS } from '../constants';
import { timeAgo } from '../cartUtils';
import { QUEUE_STATUS_LABEL } from '../queue';
import type { DeviceDoc, MpAlert, QueueItem, QueueStatus } from '../types';
import type { Integration } from '../growthTypes';

const DAY = 24 * 60 * 60 * 1000;

/** Device doc plus the push-problem fields the dispatcher records. */
type Phone = DeviceDoc & { pushError?: string; pushErrorAt?: number };

interface BackupMeta {
  ok?: boolean;
  trigger?: string;
  startedAt?: number;
  operation?: string;
  outputUriPrefix?: string;
  error?: string;
}

interface Snapshot {
  at: number;
  open: QueueItem[];
  recent: QueueItem[];
  phones: Phone[];
  alerts: MpAlert[];
  integrations: Integration[];
  backup: BackupMeta | null;
  errors: string[];
}

type Level = 'ok' | 'warn' | 'bad';
const LEVEL_COLOR: Record<Level, AlertColor> = { ok: 'success', warn: 'warning', bad: 'error' };
const LEVEL_CHIP: Record<Level, 'success' | 'warning' | 'error'> = { ok: 'success', warn: 'warning', bad: 'error' };
const worst = (levels: Level[]): Level => (levels.includes('bad') ? 'bad' : levels.includes('warn') ? 'warn' : 'ok');

async function loadStatus(): Promise<Snapshot> {
  const at = Date.now();
  const [open, recent, phones, alerts, integrations, backup] = await Promise.allSettled([
    getDocs(query(collection(db, COLLECTIONS.queue), where('status', 'in', ['pending_approval', 'queued', 'sent', 'opened']))),
    getDocs(query(collection(db, COLLECTIONS.queue), where('updatedAt', '>=', at - 7 * DAY))),
    getDocs(query(collection(db, 'devices'), where('source', '==', 'tigon-iot-app'))),
    getDocs(query(collection(db, COLLECTIONS.alerts), orderBy('createdAt', 'desc'), limit(300))),
    getDocs(collection(db, COLLECTIONS.integrations)),
    getDoc(doc(db, 'mp_meta', 'backup')),
  ]);
  const errors: string[] = [];
  const docs = <T,>(r: PromiseSettledResult<{ docs: Array<{ id: string; data: () => unknown }> }>, label: string): T[] => {
    if (r.status === 'rejected') {
      errors.push(`${label}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      return [];
    }
    return r.value.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T);
  };
  return {
    at,
    open: docs<QueueItem>(open, 'Queue'),
    recent: docs<QueueItem>(recent, 'Queue history'),
    phones: docs<Phone>(phones, 'Phones').filter((p) => p.status !== 'revoked'),
    alerts: docs<MpAlert>(alerts, 'Alerts'),
    integrations: docs<Integration>(integrations, 'Import connectors'),
    backup: backup.status === 'fulfilled' ? ((backup.value.data() as BackupMeta) || null) : null,
    errors,
  };
}

/** One health card: icon, title, status chip and body. */
const Card: React.FC<{ icon: React.ReactNode; title: string; level: Level; status: string; children: React.ReactNode }> = ({ icon, title, level, status, children }) => (
  <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ color: 'secondary.main', display: 'flex' }}>{icon}</Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>{title}</Typography>
      <Chip size="small" color={LEVEL_CHIP[level]} label={status} />
    </Box>
    <Box sx={{ typography: 'body2', color: 'text.secondary' }}>{children}</Box>
  </Paper>
);

const Line: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
    <span>{label}</span>
    <Box component="span" sx={{ color: 'text.primary', fontWeight: 600, textAlign: 'right' }}>{value}</Box>
  </Box>
);

/** Managers: system health at a glance — DMS sync, queue, phones, alerts, imports, backups. */
const MpStatus: React.FC = () => {
  const { profile, isAdmin, syncStatus, userName } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [backingUp, setBackingUp] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');

  const refresh = useCallback(() => {
    loadStatus().then(setData).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (isManager) refresh();
  }, [isManager, refresh]);

  const backupNow = async () => {
    setBackingUp(true);
    setBackupMsg('');
    try {
      const res = await httpsCallable<unknown, BackupMeta>(functions, 'mpBackupNow', { timeout: 120_000 })();
      setBackupMsg(`Backup started → ${res.data.outputUriPrefix}`);
      refresh();
    } catch (e) {
      setBackupMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBackingUp(false);
    }
  };

  if (profile && !isManager) {
    return <MpShell><Alert severity="warning">The Status page is for managers and admins.</Alert></MpShell>;
  }

  let body: React.ReactNode = <CircularProgress />;
  if (data) {
    const now = data.at;
    // DMS sync
    const syncAge = syncStatus?.finishedAt ? now - syncStatus.finishedAt : Infinity;
    const syncLevel: Level = !syncStatus || syncStatus.ok === false || syncAge > DAY ? 'bad' : syncStatus.warning || syncAge > 3 * 60 * 60 * 1000 ? 'warn' : 'ok';

    // Queue
    const byStatus = new Map<QueueStatus, number>();
    const seen = new Set<string>();
    for (const i of [...data.open, ...data.recent]) {
      if (seen.has(i.id)) continue;
      seen.add(i.id);
      byStatus.set(i.status, (byStatus.get(i.status) || 0) + 1);
    }
    const waiting = data.open.filter((i) => i.status !== 'pending_approval' && i.scheduledAt <= now).sort((a, b) => a.scheduledAt - b.scheduledAt);
    const oldest = waiting[0];
    const pending = data.open.filter((i) => i.status === 'pending_approval');
    const failed24 = data.recent.filter((i) => i.status === 'failed' && i.updatedAt >= now - DAY);
    const queueLevel: Level = failed24.length >= 5 ? 'bad' : failed24.length || (oldest && now - oldest.scheduledAt > DAY) || pending.length ? 'warn' : 'ok';

    // Phones
    const lastSeen = (p: Phone) => Number(p.lastSeen || 0);
    const online = data.phones.filter((p) => now - lastSeen(p) < ONLINE_WINDOW_MS);
    const offline = data.phones.filter((p) => now - lastSeen(p) > DAY).sort((a, b) => lastSeen(a) - lastSeen(b));
    const noToken = data.phones.filter((p) => !p.fcmToken);
    const pushProblems = data.phones.filter((p) => p.pushError);
    const phoneLevel: Level = pushProblems.length || offline.length || noToken.length ? 'warn' : 'ok';

    // Alerts
    const openAlerts = data.alerts.filter((a) => !a.acknowledgedAt);
    const alertLevel: Level = openAlerts.length ? 'warn' : 'ok';

    // Import connectors
    const failedImports = data.integrations.filter((i) => i.enabled && /fail|error/i.test(i.lastResult || ''));
    const importLevel: Level = failedImports.length ? 'warn' : 'ok';

    // Backup
    const backupAge = data.backup?.startedAt ? now - data.backup.startedAt : Infinity;
    const backupLevel: Level = data.backup?.ok === false ? 'bad' : backupAge > 2 * DAY ? 'warn' : 'ok';

    const overall = worst([syncLevel, queueLevel, phoneLevel, alertLevel, importLevel, backupLevel]);
    const phoneName = (p: Phone) => `${p.deviceName} (${userName(p.userId)})`;

    body = (
      <>
        <Alert severity={LEVEL_COLOR[overall]} sx={{ mb: 2, fontWeight: 600 }}>
          {overall === 'ok' ? 'All systems normal.' : overall === 'warn' ? 'Mostly working — a few things need a look.' : 'Something is broken — see the red cards below.'}
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 400 }}>Checked {new Date(now).toLocaleTimeString()}</Typography>
        </Alert>
        {data.errors.map((e) => <Alert key={e} severity="warning" sx={{ mb: 1 }}>Could not load {e}</Alert>)}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2, mb: 2 }}>
          <Card icon={<CloudSync />} title="DMS inventory sync" level={syncLevel} status={!syncStatus ? 'Never ran' : syncStatus.ok === false ? 'Failed' : syncAge > DAY ? 'Stale' : 'OK'}>
            <Line label="Last run" value={syncStatus?.finishedAt ? `${timeAgo(syncStatus.finishedAt)}${syncStatus.trigger ? ` (${syncStatus.trigger})` : ''}` : '—'} />
            <Line label="In stock / fetched" value={`${syncStatus?.inStock ?? '—'} / ${syncStatus?.fetched ?? '—'}`} />
            <Line label="Written / unchanged" value={`${syncStatus?.written ?? '—'} / ${syncStatus?.unchanged ?? '—'}`} />
            <Line label="Removed (sold)" value={syncStatus?.removedSold ?? '—'} />
            {syncStatus?.warning && <Typography variant="body2" color="warning.main">{syncStatus.warning}</Typography>}
            {syncStatus?.error && <Typography variant="body2" color="error">{syncStatus.error}</Typography>}
          </Card>

          <Card icon={<Queue />} title="Posting queue" level={queueLevel} status={failed24.length ? `${failed24.length} failed (24h)` : 'OK'}>
            {(['pending_approval', 'queued', 'sent', 'opened', 'posted', 'failed', 'cancelled'] as QueueStatus[]).map((s) => (
              <Line key={s} label={QUEUE_STATUS_LABEL[s]} value={byStatus.get(s) || 0} />
            ))}
            <Line label="Oldest waiting" value={oldest ? `${oldest.cartTitle} · due ${timeAgo(oldest.scheduledAt)}` : '—'} />
            <Typography variant="caption">Posted/failed/cancelled counts cover the last 7 days.</Typography>
          </Card>

          <Card icon={<PhoneIphone />} title="Phones" level={phoneLevel} status={`${online.length}/${data.phones.length} online`}>
            <Line label="Online now" value={`${online.length} of ${data.phones.length}`} />
            <Line label="Offline > 24h" value={offline.length} />
            <Line label="No push token" value={noToken.length} />
            <Line label="Push token problems" value={pushProblems.length} />
            {offline.slice(0, 6).map((p) => (
              <Typography key={p.id} variant="caption" sx={{ display: 'block' }}>
                {phoneName(p)} — {lastSeen(p) ? `seen ${timeAgo(lastSeen(p))}` : 'never seen'}
              </Typography>
            ))}
            {offline.length > 6 && <Typography variant="caption">…and {offline.length - 6} more</Typography>}
          </Card>

          <Card icon={<NotificationsActive />} title="Alerts" level={alertLevel} status={`${openAlerts.length} open`}>
            {!openAlerts.length && 'No unacknowledged alerts.'}
            {openAlerts.slice(0, 5).map((a) => (
              <Typography key={a.id} variant="caption" sx={{ display: 'block' }}>{timeAgo(a.createdAt)} · {a.text}</Typography>
            ))}
            {openAlerts.length > 0 && <Typography variant="caption">Acknowledge them on the Queue page.</Typography>}
          </Card>

          <Card icon={<Extension />} title="Import connectors" level={importLevel} status={`${data.integrations.length} set up`}>
            {!data.integrations.length && 'No import connectors.'}
            {data.integrations.map((i) => (
              <Line
                key={i.id}
                label={`${i.name}${i.enabled ? '' : ' (off)'}`}
                value={i.lastRunAt ? `${timeAgo(i.lastRunAt)}${i.lastResult ? ` · ${i.lastResult}` : ''}` : 'never ran'}
              />
            ))}
          </Card>

          <Card icon={<Backup />} title="Backups" level={backupLevel} status={!data.backup ? 'None yet' : data.backup.ok ? 'OK' : 'Failed'}>
            <Line label="Last backup" value={data.backup?.startedAt ? `${timeAgo(data.backup.startedAt)}${data.backup.trigger ? ` (${data.backup.trigger})` : ''}` : '—'} />
            {data.backup?.outputUriPrefix && <Typography variant="caption" sx={{ wordBreak: 'break-all' }}>{data.backup.outputUriPrefix}</Typography>}
            {data.backup?.error && <Typography variant="body2" color="error">{data.backup.error}</Typography>}
            <Typography variant="caption">Nightly at 3am (New York). Full Firestore export to Cloud Storage.</Typography>
            {isAdmin && (
              <Box sx={{ mt: 1 }}>
                <Button size="small" variant="outlined" startIcon={<Backup />} onClick={backupNow} disabled={backingUp}>
                  {backingUp ? 'Starting…' : 'Back up now'}
                </Button>
              </Box>
            )}
            {backupMsg && <Typography variant="caption" sx={{ display: 'block', wordBreak: 'break-all' }}>{backupMsg}</Typography>}
          </Card>

          <Card icon={<AutoAwesome />} title="AI listing writer" level="ok" status="Optional">
            Turned on by the GitHub repository variable <b>ENABLE_AI_WRITER</b> = <code>true</code> plus the
            <b> ANTHROPIC_API_KEY</b> secret in Google Secret Manager. If the cart page's AI writer shows an error, check those two.
          </Card>
        </Box>

        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <ErrorOutline color={pushProblems.length || noToken.length ? 'warning' : 'disabled'} />
            <Typography variant="h6">Push token problems</Typography>
          </Box>
          {!pushProblems.length && !noToken.length && <Typography color="text.secondary">Every phone can receive pushes.</Typography>}
          <List dense disablePadding>
            {pushProblems.map((p) => (
              <ListItem key={p.id} disableGutters>
                <ListItemText
                  primary={phoneName(p)}
                  secondary={`${p.pushError}${p.pushErrorAt ? ` · ${timeAgo(p.pushErrorAt)}` : ''} — open the app on this phone and allow notifications to refresh it.`}
                />
              </ListItem>
            ))}
            {noToken.map((p) => (
              <ListItem key={`nt-${p.id}`} disableGutters>
                <ListItemText primary={phoneName(p)} secondary="Notifications are off (no push token) — turn them on in the app." />
              </ListItem>
            ))}
          </List>
        </Paper>
      </>
    );
  }

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>System status</Typography>
        <Button startIcon={<Refresh />} onClick={refresh}>Refresh</Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {body}
    </MpShell>
  );
};

export default MpStatus;
