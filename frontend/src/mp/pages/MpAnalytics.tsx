import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, FormControl, IconButton, InputLabel, MenuItem, Paper, Select,
  Table, TableBody, TableCell, TableHead, TableRow, Tooltip as MuiTooltip, Typography,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp, Refresh } from '@mui/icons-material';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import MpShell from '../components/MpShell';
import ChipFilter from '../components/ChipFilter';
import { useMp } from '../MpDataContext';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../config/firebase';
import { COLLECTIONS } from '../constants';
import { timeAgo } from '../cartUtils';
import {
  RANGE_OPTIONS, buildOutcomes, dailySeries, dateKey, emptyStats, formatHours, formatPct, isOnline, isPermissionError,
  isPhone, lastErrorByDevice, rangeStart, recentFailures, statsBy, successRate, totals,
} from '../analyticsUtils';
import type { Outcome, RangeKey, Stats } from '../analyticsUtils';
import type { DeviceDay, DeviceDoc, MpEvent, QueueItem } from '../types';

const RED = '#af1f31';
const BLUE = '#0e4671';
const GREY = '#8a8f98';
const EVENT_LIMIT = 20000;

interface Loaded {
  key: string;
  start: number;
  events: MpEvent[];
  days: DeviceDay[];
  queue: QueueItem[];
  devices: DeviceDoc[];
  errors: string[];
}

const SOURCE_LABELS = ['activity events', 'active time', 'posting queue', 'phones'];

async function loadAll(uid: string, manager: boolean, start: number): Promise<Omit<Loaded, 'key'>> {
  const startStr = dateKey(start);
  const eventsQ = manager
    ? query(collection(db, COLLECTIONS.events), where('ts', '>=', start), orderBy('ts', 'desc'), limit(EVENT_LIMIT))
    // Members: equality only (userId + ts range would need a composite index); ts filtered below.
    : query(collection(db, COLLECTIONS.events), where('userId', '==', uid), limit(EVENT_LIMIT));
  const daysQ = manager
    ? query(collection(db, COLLECTIONS.deviceDays), where('date', '>=', startStr))
    : query(collection(db, COLLECTIONS.deviceDays), where('userId', '==', uid));
  const queueQ = query(collection(db, COLLECTIONS.queue), where('updatedAt', '>=', start));
  const devicesQ = manager
    ? query(collection(db, 'devices'))
    : query(collection(db, 'devices'), where('userId', '==', uid));

  const [ev, dd, qu, dv] = await Promise.allSettled([getDocs(eventsQ), getDocs(daysQ), getDocs(queueQ), getDocs(devicesQ)]);
  const errors: string[] = [];
  const note = (r: PromiseSettledResult<unknown>, i: number) => {
    if (r.status !== 'rejected') return;
    console.error(`MP analytics: ${SOURCE_LABELS[i]}`, r.reason);
    errors.push(
      isPermissionError(r.reason)
        ? `You don't have permission to read ${SOURCE_LABELS[i]}.`
        : `Could not load ${SOURCE_LABELS[i]}.`,
    );
  };
  [ev, dd, qu, dv].forEach(note);

  const events = ev.status === 'fulfilled'
    ? ev.value.docs.map((d) => ({ id: d.id, ...d.data() }) as MpEvent).filter((e) => e.ts >= start)
    : [];
  const days = dd.status === 'fulfilled'
    ? dd.value.docs.map((d) => d.data() as DeviceDay).filter((d) => d.date >= startStr)
    : [];
  const queue = qu.status === 'fulfilled'
    ? qu.value.docs.map((d) => ({ ...d.data(), id: d.id }) as QueueItem).filter((q) => manager || q.assignedUserId === uid)
    : [];
  const devices = dv.status === 'fulfilled'
    ? dv.value.docs.map((d) => ({ ...d.data(), id: d.id }) as DeviceDoc).filter(isPhone)
    : [];
  return { start, events, days, queue, devices, errors };
}

// ---------------------------------------------------------------------------

const Kpi: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <Paper variant="outlined" sx={{ p: 2 }}>
    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block' }}>{label}</Typography>
    <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2, my: 0.5 }}>{value}</Typography>
    {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
  </Paper>
);

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 3 }}>
    <Typography variant="h6" sx={{ mb: subtitle ? 0 : 1 }}>{title}</Typography>
    {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{subtitle}</Typography>}
    {children}
  </Paper>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>{text}</Typography>
);

function deviceLabel(id: string, names: Map<string, string>): string {
  if (id === 'web') return 'Website';
  if (!id) return 'Any phone';
  return names.get(id) || `Removed device (${id.slice(0, 6)})`;
}

interface DeviceTableProps {
  userId: string;
  devices: DeviceDoc[];
  /** Device ids seen in this user's activity (covers website + removed phones). */
  activeIds: Set<string>;
  deviceStats: Map<string, Stats>;
  lastErrors: Map<string, MpEvent>;
  names: Map<string, string>;
  now: number;
}

const DeviceTable: React.FC<DeviceTableProps> = ({ userId, devices, activeIds, deviceStats, lastErrors, names, now }) => {
  const own = devices.filter((d) => d.userId === userId).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  const extra = [...activeIds].filter((id) => !own.some((d) => d.id === id)).sort();
  if (!own.length && !extra.length) return <Empty text="No phones paired and no activity in this range." />;

  const statCells = (id: string) => {
    const s = deviceStats.get(id) || emptyStats();
    const err = lastErrors.get(id);
    return (
      <>
        <TableCell align="right">{s.prepared}</TableCell>
        <TableCell align="right">{s.posted}</TableCell>
        <TableCell align="right">{s.failed}</TableCell>
        <TableCell align="right">{formatHours(s.activeMinutes)}</TableCell>
        <TableCell sx={{ maxWidth: 280 }}>
          {err ? (
            <MuiTooltip title={err.message || err.type}>
              <Typography variant="body2" noWrap color="error">
                {timeAgo(err.ts)} · {err.message || err.type}
              </Typography>
            </MuiTooltip>
          ) : <Typography variant="body2" color="text.secondary">—</Typography>}
        </TableCell>
      </>
    );
  };

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 820 }}>
        <TableHead>
          <TableRow>
            <TableCell>Phone</TableCell>
            <TableCell>Platform / model</TableCell>
            <TableCell>App</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Prepared</TableCell>
            <TableCell align="right">Posted</TableCell>
            <TableCell align="right">Failed</TableCell>
            <TableCell align="right">Active h</TableCell>
            <TableCell>Last error</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {own.map((d) => {
            const online = isOnline(d, now);
            return (
              <TableRow key={d.id}>
                <TableCell sx={{ fontWeight: 600 }}>{d.deviceName || 'Phone'}</TableCell>
                <TableCell>{[d.platform, d.model].filter(Boolean).join(' · ') || '—'}</TableCell>
                <TableCell>{d.appVersion || '—'}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Chip
                    size="small"
                    label={d.status === 'revoked' ? 'Revoked' : online ? 'Online' : 'Offline'}
                    color={online ? 'success' : 'default'}
                    variant={online ? 'filled' : 'outlined'}
                    sx={{ mr: 1 }}
                  />
                  {!online && d.lastSeen ? (
                    <Typography component="span" variant="caption" color="text.secondary">{timeAgo(d.lastSeen)}</Typography>
                  ) : null}
                </TableCell>
                {statCells(d.id)}
              </TableRow>
            );
          })}
          {extra.map((id) => (
            <TableRow key={id}>
              <TableCell sx={{ fontWeight: 600 }}>{deviceLabel(id, names)}</TableCell>
              <TableCell>{id === 'web' ? 'Browser' : '—'}</TableCell>
              <TableCell>—</TableCell>
              <TableCell>—</TableCell>
              {statCells(id)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
};

// ---------------------------------------------------------------------------

interface LeaderRow {
  uid: string;
  name: string;
  phones: number;
  stats: Stats;
  lastSeen: number;
}

const MpAnalytics: React.FC = () => {
  const { currentUser } = useAuth();
  const { profile, users, userName } = useMp();
  const uid = currentUser?.uid || '';
  const manager = profile?.role === 'admin' || profile?.role === 'manager';

  const [range, setRange] = useState<RangeKey>('7d');
  const [userFilter, setUserFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [data, setData] = useState<Loaded | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadKey = `${uid}|${manager}|${range}|${reloadTick}`;
  const loading = !data || data.key !== loadKey;

  useEffect(() => {
    if (!uid || !profile) return;
    let cancelled = false;
    const start = rangeStart(range);
    loadAll(uid, manager, start)
      .then((res) => {
        if (cancelled) return;
        setData({ ...res, key: loadKey });
        setNow(Date.now());
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error(e);
        setData({ key: loadKey, start, events: [], days: [], queue: [], devices: [], errors: ['Could not load analytics.'] });
      });
    return () => {
      cancelled = true;
    };
  }, [uid, profile, manager, range, loadKey]);

  // Keep "online" / "x ago" fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Which user the numbers are about: null = whole team.
  const scopeUser = manager ? (userFilter === 'all' ? null : userFilter) : uid;

  const all = useMemo(() => {
    const events = data?.events || [];
    const days = data?.days || [];
    const devices = data?.devices || [];
    const start = data?.start ?? 0;
    const outcomes = buildOutcomes(events, data?.queue || [], start);
    const names = new Map(devices.map((d) => [d.id, d.deviceName]));
    const deviceStats = statsBy(events, outcomes, days, (x) => x.deviceId);
    const userStats = statsBy(events, outcomes, days, (x) => x.userId);
    const lastErrors = lastErrorByDevice(events);
    const idsByUser = new Map<string, Set<string>>();
    const addId = (x: { userId: string; deviceId: string }) => {
      if (!x.userId || !x.deviceId) return;
      let s = idsByUser.get(x.userId);
      if (!s) idsByUser.set(x.userId, (s = new Set()));
      s.add(x.deviceId);
    };
    events.forEach(addId);
    days.forEach(addId);
    outcomes.forEach(addId);
    return { events, days, devices, start, outcomes, names, deviceStats, userStats, lastErrors, idsByUser };
  }, [data]);

  const scoped = useMemo(() => {
    const byUser = <T extends { userId: string }>(xs: T[]) => (scopeUser ? xs.filter((x) => x.userId === scopeUser) : xs);
    const events = byUser(all.events);
    const days = byUser(all.days);
    const outcomes: Outcome[] = byUser(all.outcomes);
    const devices = byUser(all.devices);
    return {
      events,
      devices,
      total: totals(events, outcomes, days),
      series: all.start ? dailySeries(events, outcomes, days, all.start) : [],
      failures: recentFailures(events, 20),
    };
  }, [all, scopeUser]);

  const leaderboard = useMemo<LeaderRow[]>(() => {
    if (!manager) return [];
    const ids = new Set<string>([...users.map((u) => u.uid), ...all.userStats.keys(), ...all.devices.map((d) => d.userId)]);
    const rows: LeaderRow[] = [];
    for (const id of ids) {
      if (!id) continue;
      const phones = all.devices.filter((d) => d.userId === id);
      const stats = all.userStats.get(id) || emptyStats();
      if (!phones.length && !stats.prepared && !stats.posted && !stats.failed && !stats.activeMinutes) continue;
      rows.push({ uid: id, name: userName(id), phones: phones.length, stats, lastSeen: Math.max(0, ...phones.map((p) => p.lastSeen || 0)) });
    }
    return rows.sort((a, b) => b.stats.posted - a.stats.posted || b.stats.prepared - a.stats.prepared || a.name.localeCompare(b.name));
  }, [manager, users, all, userName]);

  const userOptions = useMemo(
    () => [...users].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [users],
  );

  const t = scoped.total;
  const online = scoped.devices.filter((d) => isOnline(d, now)).length;
  const hasActivity = scoped.series.some((p) => p.prepared || p.posted || p.failed);
  const hasActive = scoped.series.some((p) => p.activeMinutes);
  const denseDots = scoped.series.length <= 31;
  const hoursSeries = useMemo(
    () => scoped.series.map((p) => ({ label: p.label, hours: Math.round((p.activeMinutes / 60) * 10) / 10 })),
    [scoped.series],
  );

  const tableProps = (userId: string) => ({
    userId,
    devices: all.devices,
    activeIds: all.idsByUser.get(userId) || new Set<string>(),
    deviceStats: all.deviceStats,
    lastErrors: all.lastErrors,
    names: all.names,
    now,
  });

  return (
    <MpShell>
      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap', mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <ChipFilter label="Date range" value={range} options={RANGE_OPTIONS} onChange={setRange} />
        </Box>
        {manager && (
          <FormControl size="small" sx={{ minWidth: 200, mb: 1.5 }}>
            <InputLabel>User</InputLabel>
            <Select label="User" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
              <MenuItem value="all">All users</MenuItem>
              {userOptions.map((u) => <MenuItem key={u.uid} value={u.uid}>{userName(u.uid)}</MenuItem>)}
            </Select>
          </FormControl>
        )}
        <Button
          size="small"
          startIcon={loading ? <CircularProgress size={14} /> : <Refresh />}
          onClick={() => setReloadTick((n) => n + 1)}
          disabled={loading}
          sx={{ mb: 1.5 }}
        >
          Refresh
        </Button>
      </Box>

      {data?.errors.map((e) => <Alert key={e} severity="warning" sx={{ mb: 2 }}>{e}</Alert>)}
      {data && data.events.length >= EVENT_LIMIT && (
        <Alert severity="info" sx={{ mb: 2 }}>Showing the most recent {EVENT_LIMIT.toLocaleString()} events; totals may be incomplete.</Alert>
      )}

      {!data ? (
        <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>
      ) : (
        <Box sx={{ opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
          {/* KPI tiles */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1.5, mb: 3 }}>
            <Kpi label="Listings prepared" value={String(t.prepared)} />
            <Kpi label="Posts marked" value={String(t.posted)} />
            <Kpi label="Failed posts" value={String(t.failed)} />
            <Kpi label="Success rate" value={formatPct(successRate(t))} hint="Posted ÷ (posted + failed)" />
            <Kpi label="Active time" value={`${formatHours(t.activeMinutes)} h`} hint="App in foreground" />
            <Kpi label="Phones online now" value={`${online} / ${scoped.devices.length}`} />
          </Box>

          {/* Activity chart */}
          <Section title="Daily activity" subtitle="Listings prepared, posts marked and failed posts per day">
            {hasActivity ? (
              <Box sx={{ width: '100%', height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={scoped.series} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={16} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={48}
                      label={{ value: 'Count', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="prepared" name="Prepared" stroke={RED} strokeWidth={2} dot={denseDots ? { r: 3 } : false} />
                    <Line type="monotone" dataKey="posted" name="Posted" stroke={BLUE} strokeWidth={2} dot={denseDots ? { r: 3 } : false} />
                    <Line type="monotone" dataKey="failed" name="Failed" stroke={GREY} strokeWidth={2} strokeDasharray="4 3" dot={denseDots ? { r: 3 } : false} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            ) : <Empty text="No listing activity in this range." />}
            <Typography variant="subtitle2" sx={{ mt: 2 }}>Active time per day</Typography>
            {hasActive ? (
              <Box sx={{ width: '100%', height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hoursSeries} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={16} />
                    <YAxis tick={{ fontSize: 12 }} width={48}
                      label={{ value: 'Hours', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
                    <Tooltip />
                    <Bar dataKey="hours" name="Active hours" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            ) : <Empty text="No active time recorded in this range." />}
          </Section>

          {/* Leaderboard (managers, whole team) */}
          {manager && !scopeUser && (
            <Section title="Leaderboard" subtitle="Ranked by posts marked in range. Click a row for per-phone detail.">
              {leaderboard.length === 0 ? <Empty text="No team activity in this range." /> : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 760 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox" />
                        <TableCell>#</TableCell>
                        <TableCell>User</TableCell>
                        <TableCell align="right">Phones</TableCell>
                        <TableCell align="right">Prepared</TableCell>
                        <TableCell align="right">Posted</TableCell>
                        <TableCell align="right">Failed</TableCell>
                        <TableCell align="right">Success</TableCell>
                        <TableCell align="right">Active h</TableCell>
                        <TableCell>Last seen</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {leaderboard.map((r, i) => {
                        const open = expanded === r.uid;
                        return (
                          <React.Fragment key={r.uid}>
                            <TableRow hover sx={{ cursor: 'pointer', '& > td': { borderBottom: open ? 'none' : undefined } }}
                              onClick={() => setExpanded(open ? null : r.uid)}>
                              <TableCell padding="checkbox">
                                <IconButton size="small" aria-label={open ? 'Collapse' : 'Expand'}>
                                  {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                                </IconButton>
                              </TableCell>
                              <TableCell>{i + 1}</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                              <TableCell align="right">{r.phones}</TableCell>
                              <TableCell align="right">{r.stats.prepared}</TableCell>
                              <TableCell align="right">{r.stats.posted}</TableCell>
                              <TableCell align="right">{r.stats.failed}</TableCell>
                              <TableCell align="right">{formatPct(successRate(r.stats))}</TableCell>
                              <TableCell align="right">{formatHours(r.stats.activeMinutes)}</TableCell>
                              <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.lastSeen ? timeAgo(r.lastSeen) : '—'}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell colSpan={10} sx={{ py: 0, px: 1 }}>
                                <Collapse in={open} timeout="auto" unmountOnExit>
                                  <Box sx={{ py: 1.5 }}><DeviceTable {...tableProps(r.uid)} /></Box>
                                </Collapse>
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </Section>
          )}

          {/* Per-phone drill-down for one user */}
          {scopeUser && (
            <Section title={scopeUser === uid ? 'My phones' : `${userName(scopeUser)}'s phones`}
              subtitle="Activity per phone in the selected range">
              <DeviceTable {...tableProps(scopeUser)} />
            </Section>
          )}

          {/* Recent failures */}
          <Section title="Recent failures" subtitle="Latest failed posts and app errors">
            {scoped.failures.length === 0 ? <Empty text="No failures in this range." /> : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 640 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>When</TableCell>
                      <TableCell>Type</TableCell>
                      {manager && <TableCell>User</TableCell>}
                      <TableCell>Device</TableCell>
                      <TableCell>Message</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {scoped.failures.map((e, i) => (
                      <TableRow key={e.id || `${e.ts}-${i}`}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }} title={new Date(e.ts).toLocaleString()}>{timeAgo(e.ts)}</TableCell>
                        <TableCell>
                          <Chip size="small" variant="outlined" color={e.type === 'post_failed' ? 'error' : 'warning'}
                            label={e.type === 'post_failed' ? 'Post failed' : 'Error'} />
                        </TableCell>
                        {manager && <TableCell>{userName(e.userId)}</TableCell>}
                        <TableCell>{deviceLabel(e.deviceId, all.names)}</TableCell>
                        <TableCell sx={{ wordBreak: 'break-word' }}>{e.message || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Section>
        </Box>
      )}
    </MpShell>
  );
};

export default MpAnalytics;
