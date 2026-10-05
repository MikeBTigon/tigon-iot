import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup,
  IconButton, InputAdornment, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, TextField, Tooltip, Typography,
} from '@mui/material';
import { Edit, Email, Search, Settings as SettingsIcon, WarningAmber } from '@mui/icons-material';
import DashboardLayout from '../components/Layout/DashboardLayout';
import { useMp } from '../mp/MpDataContext';
import { DEALERSHIP_BY_ID } from '../mp/constants';
import type { MpProfile } from '../mp/types';
import EditUserDialog from '../devices/EditUserDialog';
import { isOnline, lastSeenMs, seenLabel } from '../devices/deviceStatus';
import { fmtHours, hoursOn, hoursOver, periods, weekday } from '../devices/presence';
import type { PresenceSettings } from '../devices/presence';
import { appPhones, savePresenceSettings, sendPresenceReport, useAllDevices, useOnline, usePostings, usePresenceSettings } from '../devices/usePresence';
import { postsOver } from '../devices/postings';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type SortKey = 'name' | 'location' | 'phones' | 'today' | 'week' | 'month' | 'year' | 'low' | 'postsWeek' | 'postsMonth';

/** Everyone who signed in to TIGON IOT: their phones, online hours and alerts. Managers and admins. */
const Users: React.FC = () => {
  const navigate = useNavigate();
  const { profile, users } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const per = useMemo(() => periods(), []);
  const cfg = usePresenceSettings();
  const devices = useAllDevices();
  const online = useOnline(per.year[0]);
  const posts = usePostings();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [editing, setEditing] = useState<MpProfile | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<PresenceSettings>(cfg);

  const counts = (d: string) => cfg.days.includes(weekday(d));

  const rows = useMemo(() => {
    const m = online.data;
    return users.map((u) => {
      const phones = appPhones(devices, u.uid);
      const sum = (dates: string[]) => (m ? phones.reduce((s, p) => s + hoursOver(m, p.id, dates), 0) : 0);
      // Postings by this person from any device (phones + computer).
      const pm = posts.data;
      const postSum = (dates: string[]) => (pm ? Array.from(pm.keys()).filter((k) => k.startsWith(`${u.uid}|`)).reduce((s, k) => s + postsOver(pm, k, dates), 0) : 0);
      const low = m && counts(per.yesterday) ? phones.filter((p) => hoursOn(m, p.id, per.yesterday) < cfg.minHours) : [];
      return {
        u, phones, low,
        onlineNow: phones.filter((p) => isOnline(p)).length,
        lastSeen: Math.max(0, ...phones.map((p) => lastSeenMs(p))),
        today: sum([per.today]), week: sum(per.week), month: sum(per.month), year: sum(per.year),
        postsWeek: postSum(per.week), postsMonth: postSum(per.month),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- counts depends on cfg.days
  }, [users, devices, online.data, posts.data, per, cfg]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => !needle || `${r.u.name} ${r.u.email} ${DEALERSHIP_BY_ID[r.u.location || '']?.name || ''}`.toLowerCase().includes(needle));
    const val = (r: typeof rows[number]): string | number => {
      switch (sort.key) {
        case 'name': return r.u.name.toLowerCase();
        case 'location': return (DEALERSHIP_BY_ID[r.u.location || '']?.name || '~').toLowerCase();
        case 'phones': return r.phones.length;
        case 'low': return r.low.length;
        default: return r[sort.key];
      }
    };
    const dir = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, q, sort]);

  const lowPhones = rows.flatMap((r) => r.low.map((p) => ({ user: r.u, phone: p })));

  const head = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <TableCell align={align} sortDirection={sort.key === key ? sort.dir : false}>
      <TableSortLabel active={sort.key === key} direction={sort.key === key ? sort.dir : 'asc'}
        onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : s.key === key ? 'desc' : key === 'name' || key === 'location' ? 'asc' : 'desc' }))}>
        {label}
      </TableSortLabel>
    </TableCell>
  );

  const send = async (key: string, action: 'user' | 'allUsers' | 'overall', uid?: string) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await sendPresenceReport(action, uid);
      setMsg({ ok: true, text: `${r.sent} report email(s) sent to ${r.to}.` });
    } catch (e) {
      setMsg({ ok: false, text: (e instanceof Error ? e.message : String(e)).replace(/^FirebaseError:\s*/, '') });
    } finally {
      setBusy('');
    }
  };

  const saveSettings = async () => {
    setBusy('settings');
    try {
      await savePresenceSettings(draft);
      setSettingsOpen(false);
      setMsg({ ok: true, text: 'Saved.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy('');
    }
  };

  if (!isManager) {
    return <DashboardLayout><Alert severity="info">The Users page is for managers and admins.</Alert></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <Box sx={{ display: 'flex', alignItems: { sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1, mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" color="primary" sx={{ fontWeight: 600 }}>Users</Typography>
          <Typography variant="body2" color="text.secondary">
            Everyone who has signed in to TIGON IOT, their phones and how long each phone is online (goal: {cfg.minHours} h a day).
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button variant="contained" startIcon={busy === 'overall' ? <CircularProgress size={16} color="inherit" /> : <Email />} disabled={!!busy}
            onClick={() => send('overall', 'overall')}>Email all-phones report</Button>
          <Button variant="outlined" startIcon={busy === 'all' ? <CircularProgress size={16} /> : <Email />} disabled={!!busy}
            onClick={() => send('all', 'allUsers')}>Email every user's report</Button>
          <Tooltip title="Minimum hours and report address">
            <IconButton onClick={() => { setDraft(cfg); setSettingsOpen(true); }} aria-label="Settings"><SettingsIcon /></IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {online.error && <Alert severity="warning" sx={{ mb: 2 }}>Could not load online hours: {online.error}</Alert>}
      <Alert severity="info" sx={{ mb: 2 }}>
        Each person's report is emailed to <b>{cfg.reportTo}</b> every <b>Friday at 5 pm</b>. Phones under {cfg.minHours} h get an alert each morning
        (on the phone and in System Triage).
      </Alert>

      {lowPhones.length > 0 && (
        <Alert severity="warning" icon={<WarningAmber />} sx={{ mb: 2 }}>
          <b>{lowPhones.length} phone(s) were online less than {cfg.minHours} h yesterday:</b>{' '}
          {lowPhones.map(({ user, phone }) => (
            <Chip key={phone.id} size="small" sx={{ m: 0.25 }} onClick={() => navigate(`/users/${user.uid}`)}
              label={`${user.name}: ${phone.deviceNumber ? `#${phone.deviceNumber} ` : ''}${phone.deviceName} — ${fmtHours(online.data ? hoursOn(online.data, phone.id, per.yesterday) : 0)} h`} />
          ))}
        </Alert>
      )}

      <Paper sx={{ p: 2 }}>
        <TextField size="small" placeholder="Search name, email or location" value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 1, width: { xs: '100%', sm: 320 } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} />
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {head('name', 'Name')}{head('location', 'Location')}{head('phones', 'Phones')}
                {head('today', 'Today', 'right')}{head('week', 'This week', 'right')}{head('month', 'This month', 'right')}{head('year', 'This year', 'right')}
                {head('postsWeek', 'Posts this week', 'right')}{head('postsMonth', 'Posts this month', 'right')}
                {head('low', `Under ${cfg.minHours} h yesterday`)}<TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.u.uid} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/users/${r.u.uid}`)}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.u.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{r.u.email} · {r.u.role}</Typography>
                  </TableCell>
                  <TableCell>{DEALERSHIP_BY_ID[r.u.location || '']?.name || <Typography variant="caption" color="text.secondary">—</Typography>}</TableCell>
                  <TableCell>
                    {r.phones.length ? <>
                      {r.phones.length} {r.onlineNow > 0 && <Chip size="small" color="success" label={`${r.onlineNow} on now`} sx={{ ml: 0.5 }} />}
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{r.lastSeen ? `seen ${seenLabel({ lastSeen: r.lastSeen })}` : ''}</Typography>
                    </> : <Typography variant="caption" color="text.secondary">No phone</Typography>}
                  </TableCell>
                  {(['today', 'week', 'month', 'year'] as const).map((k) => (
                    <TableCell key={k} align="right">{online.data ? `${fmtHours(r[k])} h` : '…'}</TableCell>
                  ))}
                  <TableCell align="right">{posts.data ? r.postsWeek : '…'}</TableCell>
                  <TableCell align="right">{posts.data ? r.postsMonth : '…'}</TableCell>
                  <TableCell>
                    {!r.phones.length || !counts(per.yesterday) ? '—' : r.low.length ?
                      <Chip size="small" color="warning" label={`${r.low.length} of ${r.phones.length}`} /> :
                      <Chip size="small" color="success" variant="outlined" label="All OK" />}
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()} sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Edit name / location"><IconButton size="small" onClick={() => setEditing(r.u)} aria-label="Edit"><Edit fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title={`Email this person's report to ${cfg.reportTo}`}>
                      <span><IconButton size="small" disabled={!!busy} onClick={() => send(`u-${r.u.uid}`, 'user', r.u.uid)} aria-label="Email report">
                        {busy === `u-${r.u.uid}` ? <CircularProgress size={16} /> : <Email fontSize="small" />}
                      </IconButton></span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {!shown.length && <TableRow><TableCell colSpan={11}>No users match.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Hours are New York time and add up all of a person's phones. A phone counts as online while the TIGON IOT app is open or its
          background service checks in (every 5 minutes, also with the app closed).
        </Typography>
      </Paper>

      {editing && <EditUserDialog user={editing} onClose={() => setEditing(null)} />}

      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Online-time goal and reports</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField type="number" label="Minimum hours online per day" value={draft.minHours}
              onChange={(e) => setDraft({ ...draft, minHours: Number(e.target.value) })} slotProps={{ htmlInput: { min: 0.5, max: 24, step: 0.5 } }} />
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>Days that count</Typography>
              <FormGroup row>
                {DAYS.map((d, i) => (
                  <FormControlLabel key={d} label={d} control={<Checkbox size="small" checked={draft.days.includes(i)}
                    onChange={(e) => setDraft({ ...draft, days: e.target.checked ? [...draft.days, i] : draft.days.filter((x) => x !== i) })} />} />
                ))}
              </FormGroup>
            </Box>
            <TextField label="Send reports to" value={draft.reportTo} onChange={(e) => setDraft({ ...draft, reportTo: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={busy === 'settings' || !draft.days.length} onClick={saveSettings}>Save</Button>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
};

export default Users;
