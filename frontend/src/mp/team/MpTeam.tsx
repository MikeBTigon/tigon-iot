import React, { useEffect, useMemo, useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, IconButton,
  InputLabel, LinearProgress, MenuItem, Paper, Select, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import {
  ChevronLeft, ChevronRight, ContentCopy, EmojiEvents, Flag, LocalFireDepartment, Lock, PersonAdd, PhotoCamera,
  PostAdd, Sell, Share, Store, WbSunny,
} from '@mui/icons-material';
import { db } from '../../config/firebase';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { COLLECTIONS } from '../constants';
import { writeAudit } from '../audit';
import type { MpEvent, MpProfile } from '../types';
import type { Goal, Lead } from '../growthTypes';
import { BADGES, badgeStats } from './badges';
import type { BadgeIcon } from './badges';
import { goalId, periodKey, periodLabel, periodRange, shiftKey } from './periods';
import type { Period } from './periods';
import {
  emptyScores, loadGoals, loadTeamEvents, loadTeamLeads, loadUserEvents, loadUserLeads, pct, scoresByUser,
} from './teamData';
import type { Scores } from './teamData';

const METRICS: Array<{ key: keyof Scores; label: string }> = [
  { key: 'posts', label: 'Posts' },
  { key: 'leads', label: 'Leads' },
  { key: 'sales', label: 'Sales' },
];

const MEDALS = ['#d4af37', '#a7a7ad', '#a97142'];

const BADGE_ICONS: Record<BadgeIcon, React.ReactElement> = {
  post: <PostAdd />, fire: <LocalFireDepartment />, lead: <PersonAdd />, sale: <Sell />, share: <Share />,
  sun: <WbSunny />, store: <Store />, photo: <PhotoCamera />, trophy: <EmojiEvents />,
};

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** One labelled progress bar: "Posts 7 / 10". */
const ProgressRow: React.FC<{ label: string; value: number; target: number; compact?: boolean }> = ({ label, value, target, compact }) => {
  const p = pct(value, target);
  return (
    <Box sx={{ mb: compact ? 0 : 1.5, minWidth: compact ? 90 : undefined }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
        {!compact && <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>}
        <Typography variant="body2" color="text.secondary">{value}{target ? ` / ${target}` : ''}</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={p}
        color={target && value >= target ? 'success' : 'primary'}
        sx={{ height: compact ? 6 : 10, borderRadius: 5 }}
      />
    </Box>
  );
};

/** Managers: set per-person targets for a period, with "copy last period". */
const GoalsDialog: React.FC<{
  open: boolean; period: Period; pkey: string; users: MpProfile[]; goals: Goal[]; actor: MpProfile;
  onClose: (saved?: boolean) => void;
}> = ({ open, period, pkey, users, goals, actor, onClose }) => {
  const [form, setForm] = useState<Record<string, Scores>>(() =>
    Object.fromEntries(users.map((u) => {
      const g = goals.find((x) => x.userId === u.uid);
      return [u.uid, g ? { posts: g.posts, leads: g.leads, sales: g.sales } : emptyScores()];
    })),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const prevKey = shiftKey(period, pkey, -1);

  const copyLast = async () => {
    setBusy(true);
    setMsg('');
    try {
      const prev = await loadGoals(prevKey);
      const mine = prev.filter((g) => g.period === period);
      if (!mine.length) setMsg(`No goals were set for ${periodLabel(period, prevKey)}.`);
      setForm((f) => {
        const next = { ...f };
        for (const g of mine) if (next[g.userId]) next[g.userId] = { posts: g.posts, leads: g.leads, sales: g.sales };
        return next;
      });
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      const batch = writeBatch(db);
      let n = 0;
      for (const u of users) {
        const s = form[u.uid] || emptyScores();
        const had = goals.some((g) => g.userId === u.uid);
        if (!had && !s.posts && !s.leads && !s.sales) continue;
        const goal: Omit<Goal, 'id'> = {
          userId: u.uid, period, periodKey: pkey, posts: s.posts, leads: s.leads, sales: s.sales, setBy: actor.uid, updatedAt: Date.now(),
        };
        batch.set(doc(db, COLLECTIONS.goals, goalId(u.uid, pkey)), goal);
        n++;
      }
      await batch.commit();
      await writeAudit(actor, 'goals.set', pkey, `${n} people`);
      onClose(true);
    } catch (e) {
      setMsg(errText(e));
      setBusy(false);
    }
  };

  const setVal = (uid: string, key: keyof Scores, v: string) =>
    setForm((f) => ({ ...f, [uid]: { ...(f[uid] || emptyScores()), [key]: Math.max(0, Math.round(Number(v) || 0)) } }));

  return (
    <Dialog open={open} onClose={() => onClose()} fullWidth maxWidth="md">
      <DialogTitle>Goals · {periodLabel(period, pkey)}</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Button startIcon={<ContentCopy />} onClick={copyLast} disabled={busy} sx={{ mb: 1 }}>
          Copy last {period === 'week' ? "week's" : "month's"} goals
        </Button>
        {msg && <Alert severity="info" sx={{ mb: 1 }}>{msg}</Alert>}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Person</TableCell>
                {METRICS.map((m) => <TableCell key={m.key} align="center">{m.label}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.uid}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{u.name || u.email}</TableCell>
                  {METRICS.map((m) => (
                    <TableCell key={m.key} align="center">
                      <TextField
                        type="number"
                        size="small"
                        value={form[u.uid]?.[m.key] ?? 0}
                        onChange={(e) => setVal(u.uid, m.key, e.target.value)}
                        slotProps={{ htmlInput: { min: 0, style: { width: 56, textAlign: 'center' } } }}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save goals'}</Button>
      </DialogActions>
    </Dialog>
  );
};

interface PersonData {
  uid: string;
  events: MpEvent[];
  leads: Lead[];
}

/** Goals & badges: personal progress for everyone; team table, goal setting and leaderboard for managers. */
const MpTeam: React.FC = () => {
  const { profile, users, carts, userName, userKeys } = useMp();
  const uid = profile?.uid || '';
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [now] = useState(() => Date.now());
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const pkey = shiftKey(period, periodKey(period, now), offset);
  const range = useMemo(() => periodRange(period, pkey), [period, pkey]);

  const [error, setError] = useState('');
  const [mine, setMine] = useState<PersonData | null>(null);
  const [team, setTeam] = useState<{ key: string; events: MpEvent[]; leads: Lead[] } | null>(null);
  const [goals, setGoals] = useState<{ key: string; list: Goal[] } | null>(null);
  const [goalsVersion, setGoalsVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [badgeUser, setBadgeUser] = useState('');
  const [other, setOther] = useState<PersonData | null>(null);

  // My own all-time events + leads (progress + badges).
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    Promise.all([loadUserEvents(uid), loadUserLeads(uid)])
      .then(([events, leads]) => alive && setMine({ uid, events, leads }))
      .catch((e) => alive && setError(errText(e)));
    return () => { alive = false; };
  }, [uid]);

  // Managers: the whole team's activity for the selected period.
  useEffect(() => {
    if (!isManager) return;
    let alive = true;
    Promise.all([loadTeamEvents(range.start, range.end), loadTeamLeads(range.start)])
      .then(([events, leads]) => alive && setTeam({ key: pkey, events, leads }))
      .catch((e) => alive && setError(errText(e)));
    return () => { alive = false; };
  }, [isManager, pkey, range.start, range.end]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    loadGoals(pkey)
      .then((list) => alive && setGoals({ key: pkey, list: list.filter((g) => g.period === period) }))
      .catch((e) => alive && setError(errText(e)));
    return () => { alive = false; };
  }, [uid, pkey, period, goalsVersion]);

  // Managers can look at a teammate's badges.
  const viewUid = isManager && badgeUser ? badgeUser : uid;
  useEffect(() => {
    if (!viewUid || viewUid === uid) return;
    let alive = true;
    Promise.all([loadUserEvents(viewUid), loadUserLeads(viewUid)])
      .then(([events, leads]) => alive && setOther({ uid: viewUid, events, leads }))
      .catch((e) => alive && setError(errText(e)));
    return () => { alive = false; };
  }, [viewUid, uid]);

  const goalList = goals?.key === pkey ? goals.list : [];
  const goalOf = (u: string) => goalList.find((g) => g.userId === u);

  const myScores = useMemo(
    () => (mine ? scoresByUser(mine.events, mine.leads, range.start, range.end).get(uid) : undefined) || emptyScores(),
    [mine, range, uid],
  );
  const teamScores = useMemo(
    () => (team?.key === pkey ? scoresByUser(team.events, team.leads, range.start, range.end) : null),
    [team, pkey, range],
  );
  const teamRows = useMemo(
    () =>
      users
        .map((u) => ({ user: u, scores: teamScores?.get(u.uid) || emptyScores(), goal: goalOf(u.uid) }))
        .sort((a, b) => b.scores.posts - a.scores.posts || (a.user.name || '').localeCompare(b.user.name || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, teamScores, goalList],
  );

  const myStats = useMemo(
    () => (mine ? badgeStats(uid, userKeys, mine.events, mine.leads, carts, now) : null),
    [mine, uid, userKeys, carts, now],
  );
  const otherStats = useMemo(() => {
    if (!other || other.uid !== viewUid || viewUid === uid) return null;
    const keys = [other.uid, users.find((x) => x.uid === other.uid)?.legacyId].filter(Boolean) as string[];
    return badgeStats(other.uid, keys, other.events, other.leads, carts, now);
  }, [other, viewUid, uid, users, carts, now]);
  const stats = viewUid === uid ? myStats : otherStats;

  const myGoal = goalOf(uid);

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Goals & badges</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={period}
          onChange={(_, v: Period | null) => { if (v) { setPeriod(v); setOffset(0); } }}
        >
          <ToggleButton value="week">Week</ToggleButton>
          <ToggleButton value="month">Month</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton size="small" onClick={() => setOffset((o) => o - 1)}><ChevronLeft /></IconButton>
          <Typography variant="body2" sx={{ minWidth: 120, textAlign: 'center' }}>{periodLabel(period, pkey)}</Typography>
          <IconButton size="small" onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0}><ChevronRight /></IconButton>
        </Box>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2 }}>
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Flag color="primary" />
            <Typography variant="h6" sx={{ flexGrow: 1 }}>My progress</Typography>
            {!myGoal && <Chip size="small" label="No goal set" />}
          </Box>
          {!mine ? <CircularProgress size={24} /> : METRICS.map((m) => (
            <ProgressRow key={m.key} label={m.label} value={myScores[m.key]} target={myGoal?.[m.key] || 0} />
          ))}
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <LocalFireDepartment sx={{ color: '#d84315' }} />
            <Typography variant="h6">Posting streak</Typography>
          </Box>
          {!myStats ? <CircularProgress size={24} /> : (
            <>
              <Typography variant="h3" sx={{ fontWeight: 700, color: myStats.streak ? '#d84315' : 'text.disabled' }}>
                {myStats.streak} day{myStats.streak === 1 ? '' : 's'}
              </Typography>
              <Typography color="text.secondary">
                Best: {myStats.bestStreak} day{myStats.bestStreak === 1 ? '' : 's'} · Post at least once a day to keep it going.
              </Typography>
            </>
          )}
        </Paper>
      </Box>

      {isManager && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>Team progress</Typography>
            <Button variant="contained" startIcon={<Flag />} onClick={() => setEditing(true)} disabled={!goals || goals.key !== pkey}>
              Set goals
            </Button>
          </Box>
          {!teamScores ? <CircularProgress size={24} /> : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Person</TableCell>
                    {METRICS.map((m) => <TableCell key={m.key}>{m.label}</TableCell>)}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {teamRows.map(({ user, scores, goal }) => (
                    <TableRow key={user.uid}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{user.name || user.email}</TableCell>
                      {METRICS.map((m) => (
                        <TableCell key={m.key} sx={{ minWidth: 100 }}>
                          <ProgressRow compact label={m.label} value={scores[m.key]} target={goal?.[m.key] || 0} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Paper>
      )}

      {isManager && teamScores && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Leaderboard · {periodLabel(period, pkey)}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            {METRICS.map((m) => {
              const ranked = [...teamScores.entries()]
                .filter(([, s]) => s[m.key] > 0)
                .sort((a, b) => b[1][m.key] - a[1][m.key])
                .slice(0, 10);
              return (
                <Box key={m.key}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>{m.label}</Typography>
                  {!ranked.length && <Typography variant="body2" color="text.secondary">No {m.label.toLowerCase()} yet.</Typography>}
                  {ranked.map(([u, s], i) => (
                    <Box key={u} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
                      {i < 3
                        ? <EmojiEvents sx={{ color: MEDALS[i] }} fontSize="small" />
                        : <Typography variant="body2" color="text.secondary" sx={{ width: 20, textAlign: 'center' }}>{i + 1}</Typography>}
                      <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: i < 3 ? 600 : 400 }}>{userName(u)}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{s[m.key]}</Typography>
                    </Box>
                  ))}
                </Box>
              );
            })}
          </Box>
        </Paper>
      )}

      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <EmojiEvents sx={{ color: MEDALS[0] }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Badges</Typography>
          {isManager && (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Person</InputLabel>
              <Select label="Person" value={badgeUser || uid} onChange={(e) => setBadgeUser(e.target.value === uid ? '' : e.target.value)}>
                {users.map((u) => <MenuItem key={u.uid} value={u.uid}>{u.name || u.email}{u.uid === uid ? ' (me)' : ''}</MenuItem>)}
              </Select>
            </FormControl>
          )}
        </Box>
        {!stats ? <CircularProgress size={24} /> : (
          <>
            {viewUid !== uid && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Streak: {stats.streak} days (best {stats.bestStreak})
              </Typography>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1.5 }}>
              {BADGES.map((b) => {
                const earned = b.earned(stats);
                const prog = b.progress?.(stats);
                return (
                  <Tooltip key={b.id} title={earned ? `Earned — ${b.how}` : b.how}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 1.5, textAlign: 'center', opacity: earned ? 1 : 0.6,
                        borderColor: earned ? b.color : 'divider', bgcolor: earned ? `${b.color}14` : 'action.hover',
                      }}
                    >
                      <Box sx={{ color: earned ? b.color : 'text.disabled', '& svg': { fontSize: 36 } }}>
                        {earned ? BADGE_ICONS[b.icon] : <Lock />}
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{b.label}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {earned ? 'Earned' : b.how}
                      </Typography>
                      {!earned && prog && (
                        <LinearProgress variant="determinate" value={pct(Math.min(prog[0], prog[1]), prog[1])} sx={{ mt: 0.5, height: 4, borderRadius: 2 }} />
                      )}
                    </Paper>
                  </Tooltip>
                );
              })}
            </Box>
          </>
        )}
      </Paper>

      {editing && profile && goals && (
        <GoalsDialog
          open
          period={period}
          pkey={pkey}
          users={users}
          goals={goalList}
          actor={profile}
          onClose={(saved) => { setEditing(false); if (saved) setGoalsVersion((v) => v + 1); }}
        />
      )}
    </MpShell>
  );
};

export default MpTeam;
