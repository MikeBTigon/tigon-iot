import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { ArrowBack, Edit, Email, WarningAmber } from '@mui/icons-material';
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import DashboardLayout from '../components/Layout/DashboardLayout';
import { useMp } from '../mp/MpDataContext';
import { DEALERSHIP_BY_ID } from '../mp/constants';
import type { DeviceDoc } from '../mp/types';
import EditUserDialog from '../devices/EditUserDialog';
import TeamDevicesPanel from '../devices/TeamDevicesPanel';
import OnlineTimeline from '../devices/OnlineTimeline';
import { isOnline, seenLabel } from '../devices/deviceStatus';
import { addDays, dateRange, dayLabel, fmtHours, hoursOn, hoursOver, periods, todayNy, weekday } from '../devices/presence';
import { appPhones, sendPresenceReport, useAllDevices, useOnline, usePresenceSettings } from '../devices/usePresence';

const COLORS = ['#0e4671', '#b01e2f', '#2e7d32', '#ed6c02', '#7b1fa2', '#00838f', '#5d4037', '#455a64'];
const phoneName = (p: DeviceDoc) => `${p.deviceNumber ? `#${p.deviceNumber} ` : ''}${p.deviceName}`;
type ChartRange = 'week' | 'month' | 'year';

/** One person: details, phones (edit / reassign / revoke) and online-hours analytics per phone. */
const UserDetail: React.FC = () => {
  const { uid = '' } = useParams();
  const { profile, users } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const user = users.find((u) => u.uid === uid) || null;
  const per = useMemo(() => periods(), []);
  const cfg = usePresenceSettings();
  const devices = useAllDevices();
  const online = useOnline(per.year[0], uid);
  const phones = useMemo(() => appPhones(devices, uid).sort((a, b) => (a.deviceNumber || '').localeCompare(b.deviceNumber || '')), [devices, uid]);
  const [editing, setEditing] = useState(false);
  const [range, setRange] = useState<ChartRange>('month');
  const [tlMode, setTlMode] = useState<'day' | 'phone'>('day');
  const [tlDate, setTlDate] = useState(todayNy());
  const [tlPhone, setTlPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const m = online.data;
  const counts = (d: string) => cfg.days.includes(weekday(d));

  const chart = useMemo(() => {
    if (!m) return [];
    if (range === 'year') {
      // Average hours per counted day, per month.
      const months = Array.from(new Set(per.year.map((d) => d.slice(0, 7))));
      return months.map((mo) => {
        const days = per.year.filter((d) => d.startsWith(mo) && counts(d));
        const row: Record<string, string | number> = { label: new Date(`${mo}-15T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }) };
        for (const p of phones) row[p.id] = Number((hoursOver(m, p.id, days) / (days.length || 1)).toFixed(1));
        return row;
      });
    }
    const dates = range === 'week' ? per.last7 : per.last30;
    return dates.map((d) => {
      const row: Record<string, string | number> = { label: dayLabel(d, range === 'week' ? { weekday: 'short', day: 'numeric' } : { month: 'numeric', day: 'numeric' }) };
      for (const p of phones) row[p.id] = Number(hoursOn(m, p.id, d).toFixed(1));
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- counts depends on cfg.days
  }, [m, range, phones, per, cfg]);

  const timelineRows = useMemo(() => {
    if (!m) return [];
    if (tlMode === 'day') {
      return phones.map((p) => ({ key: p.id, label: phoneName(p), slots: m.get(p.id)?.get(tlDate), minHours: counts(tlDate) ? cfg.minHours : undefined }));
    }
    const p = phones.find((x) => x.id === tlPhone) || phones[0];
    if (!p) return [];
    return dateRange(addDays(tlDate, -6), tlDate).reverse().map((d) => ({
      key: d, label: dayLabel(d), slots: m.get(p.id)?.get(d), minHours: counts(d) ? cfg.minHours : undefined,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- counts depends on cfg.days
  }, [m, tlMode, tlDate, tlPhone, phones, cfg]);

  const low = m && counts(per.yesterday) ? phones.filter((p) => hoursOn(m, p.id, per.yesterday) < cfg.minHours) : [];

  const email = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await sendPresenceReport('user', uid);
      setMsg({ ok: true, text: `Report emailed to ${r.to}.` });
    } catch (e) {
      setMsg({ ok: false, text: (e instanceof Error ? e.message : String(e)).replace(/^FirebaseError:\s*/, '') });
    } finally {
      setBusy(false);
    }
  };

  if (!isManager) return <DashboardLayout><Alert severity="info">The Users page is for managers and admins.</Alert></DashboardLayout>;

  return (
    <DashboardLayout>
      <Button component={RouterLink} to="/users" startIcon={<ArrowBack />} sx={{ mb: 1 }}>All users</Button>
      {!user ? (
        users.length ? <Alert severity="warning">User not found.</Alert> : <CircularProgress />
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: { sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1, mb: 2 }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h5" color="primary" sx={{ fontWeight: 600 }}>{user.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {user.email} · {user.role}{user.location ? ` · ${DEALERSHIP_BY_ID[user.location]?.name || user.location}` : ''}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<Edit />} onClick={() => setEditing(true)}>Edit name / location</Button>
              <Button variant="contained" startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <Email />} disabled={busy} onClick={email}>
                Email report to {cfg.reportTo}
              </Button>
            </Stack>
          </Box>
          {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
          {online.error && <Alert severity="warning" sx={{ mb: 2 }}>Could not load online hours: {online.error}</Alert>}
          {low.length > 0 && (
            <Alert severity="warning" icon={<WarningAmber />} sx={{ mb: 2 }}>
              Yesterday {low.map((p) => `${phoneName(p)} (${fmtHours(m ? hoursOn(m, p.id, per.yesterday) : 0)} h)`).join(', ')}{' '}
              {low.length === 1 ? 'was' : 'were'} online less than the {cfg.minHours} h minimum.
            </Alert>
          )}

          {/* Per-phone numbers */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }, gap: 2, mb: 2 }}>
            {!phones.length && <Alert severity="info">No TIGON IOT phone is set up for {user.name} yet.</Alert>}
            {phones.map((p) => {
              const monthDays = per.month.filter(counts);
              const under = m ? monthDays.filter((d) => hoursOn(m, p.id, d) < cfg.minHours && d !== per.today).length : 0;
              const stat = (label: string, v: number, warn = false) => (
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Typography sx={{ fontWeight: 700, color: warn ? 'error.main' : 'text.primary' }}>{m ? `${fmtHours(v)} h` : '…'}</Typography>
                </Box>
              );
              return (
                <Paper key={p.id} variant="outlined" sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography sx={{ fontWeight: 700, flexGrow: 1 }}>{phoneName(p)}</Typography>
                    <Chip size="small" color={isOnline(p) ? 'success' : 'default'} label={isOnline(p) ? 'Online now' : `Seen ${seenLabel(p)}`} />
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                    {stat('Today', m ? hoursOn(m, p.id, per.today) : 0)}
                    {stat('Yesterday', m ? hoursOn(m, p.id, per.yesterday) : 0, !!m && counts(per.yesterday) && hoursOn(m, p.id, per.yesterday) < cfg.minHours)}
                    {stat('This week', m ? hoursOver(m, p.id, per.week) : 0)}
                    {stat('This month', m ? hoursOver(m, p.id, per.month) : 0)}
                    {stat('This year', m ? hoursOver(m, p.id, per.year) : 0)}
                    {stat('Avg / day (month)', m ? hoursOver(m, p.id, monthDays) / (monthDays.length || 1) : 0, !!m && hoursOver(m, p.id, monthDays) / (monthDays.length || 1) < cfg.minHours)}
                  </Box>
                  <Typography variant="caption" color={under ? 'error' : 'text.secondary'} sx={{ display: 'block', mt: 1 }}>
                    {under} day(s) under {cfg.minHours} h this month
                  </Typography>
                </Paper>
              );
            })}
          </Box>

          {/* Hours chart */}
          {phones.length > 0 && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                <Typography variant="h6" sx={{ flexGrow: 1, fontSize: 18 }}>
                  {range === 'year' ? 'Average hours online per day, by month' : 'Hours online per day'}
                </Typography>
                <ToggleButtonGroup size="small" exclusive value={range} onChange={(_e, v) => v && setRange(v)}>
                  <ToggleButton value="week">7 days</ToggleButton>
                  <ToggleButton value="month">30 days</ToggleButton>
                  <ToggleButton value="year">This year</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              {!m ? <CircularProgress size={24} /> : (
                <Box sx={{ height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={chart}>
                      <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" fontSize={11} />
                      <YAxis domain={[0, 24]} ticks={[0, 4, 8, 12, 16, 20, 24]} fontSize={11} unit=" h" width={44} />
                      <Tooltip formatter={(v) => `${v} h`} />
                      {phones.length > 1 && <Legend />}
                      <ReferenceLine y={cfg.minHours} stroke="#b01e2f" strokeDasharray="6 4" label={{ value: `${cfg.minHours} h goal`, fill: '#b01e2f', fontSize: 11, position: 'insideTopRight' }} />
                      {phones.map((p, i) => <Bar key={p.id} dataKey={p.id} name={phoneName(p)} fill={COLORS[i % COLORS.length]} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Paper>
          )}

          {/* 24-hour timeline */}
          {phones.length > 0 && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Typography variant="h6" sx={{ flexGrow: 1, fontSize: 18 }}>24-hour timeline (New York time)</Typography>
                <ToggleButtonGroup size="small" exclusive value={tlMode} onChange={(_e, v) => v && setTlMode(v)}>
                  <ToggleButton value="day">All phones, one day</ToggleButton>
                  <ToggleButton value="phone">One phone, 7 days</ToggleButton>
                </ToggleButtonGroup>
                {tlMode === 'phone' && (
                  <TextField select size="small" label="Phone" value={tlPhone || phones[0]?.id || ''} onChange={(e) => setTlPhone(e.target.value)} sx={{ minWidth: 180 }}>
                    {phones.map((p) => <MenuItem key={p.id} value={p.id}>{phoneName(p)}</MenuItem>)}
                  </TextField>
                )}
                <TextField size="small" type="date" label={tlMode === 'day' ? 'Day' : 'Ending on'} value={tlDate}
                  onChange={(e) => e.target.value && setTlDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: per.today } }} />
              </Box>
              {!m ? <CircularProgress size={24} /> : <OnlineTimeline rows={timelineRows} />}
              <Typography variant="caption" color="text.secondary">Green = online. Hover a bar to see the exact times. Hours in red are under the {cfg.minHours} h goal.</Typography>
            </Paper>
          )}

          <TeamDevicesPanel userId={uid} title={`${user.name}'s phones`} />
          {editing && <EditUserDialog user={user} onClose={() => setEditing(false)} />}
        </>
      )}
    </DashboardLayout>
  );
};

export default UserDetail;
