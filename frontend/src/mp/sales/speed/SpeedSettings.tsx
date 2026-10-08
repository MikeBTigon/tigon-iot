// Track 1 (speed to lead) — settings tab "Leads & speed": speed alerts, round robin, daily list, Facebook-message leads.
import React, { useState } from 'react';
import {
  Alert, Box, Button, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { notify } from '../../../ui/notify';
import { saveSalesSection, useSalesSettings } from '../salesData';
import type { SalesSettings } from '../salesTypes';

const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;

const Section: React.FC<{ title: string; help: string; children: React.ReactNode }> = ({ title, help, children }) => (
  <Paper variant="outlined" sx={{ p: 2 }}>
    <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{help}</Typography>
    <Stack spacing={1.5}>{children}</Stack>
  </Paper>
);

/** "5, 15" → [5, 15] (whole minutes, 1–1440, sorted, no repeats). */
function parseMinutes(s: string): number[] {
  return [...new Set(s.split(/[\s,;]+/).map((x) => Math.round(Number(x))).filter((n) => n >= 1 && n <= 1440))].sort((a, b) => a - b);
}

function Form({ initial }: { initial: SalesSettings }) {
  const [speed, setSpeed] = useState(initial.speed);
  const [minutes, setMinutes] = useState(initial.speed.alertMinutes.join(', '));
  const [assignment, setAssignment] = useState(initial.assignment);
  const [dailyList, setDailyList] = useState(initial.dailyList);
  const [fbLeads, setFbLeads] = useState(initial.fbLeads);
  const [busy, setBusy] = useState(false);
  const marks = parseMinutes(minutes);

  const save = async () => {
    if (speed.enabled && !marks.length) {
      notify('Add at least one alert time in minutes, like 5, 15.', 'error');
      return;
    }
    setBusy(true);
    try {
      await saveSalesSection('speed', { ...speed, alertMinutes: marks.length ? marks : initial.speed.alertMinutes });
      await saveSalesSection('assignment', { ...assignment, claimMinutes: Math.min(120, Math.max(1, Math.round(assignment.claimMinutes) || 5)) });
      await saveSalesSection('dailyList', { ...dailyList, hour: Math.min(23, Math.max(0, Math.round(dailyList.hour))) });
      await saveSalesSection('fbLeads', fbLeads);
      notify('Saved', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }}>
      <Section title="Speed alerts" help="If nobody has called, texted or claimed a new lead, we remind the salesperson (and managers) after these minutes. No alerts during quiet hours at night.">
        <FormControlLabel control={<Switch checked={speed.enabled} onChange={(e) => setSpeed({ ...speed, enabled: e.target.checked })} />} label="Send speed alerts" />
        <TextField size="small" label="Alert after (minutes)" value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={!speed.enabled}
          helperText={marks.length ? `Alerts at ${marks.map((m) => `${m} min`).join(' and ')}` : 'Type minutes separated by commas, like 5, 15'}
          error={speed.enabled && !marks.length} />
        <FormControlLabel control={<Switch checked={speed.notifyManagers} disabled={!speed.enabled} onChange={(e) => setSpeed({ ...speed, notifyManagers: e.target.checked })} />}
          label="Also alert the store's managers" />
      </Section>

      <Section title="Share new leads (round robin)" help="Website, Facebook, missed-call and other automatic leads go to the next salesperson at that store, in turn. If they don't claim it in time, it goes to the next person.">
        <TextField select size="small" label="How new leads are given out" value={assignment.mode}
          onChange={(e) => setAssignment({ ...assignment, mode: e.target.value as SalesSettings['assignment']['mode'] })}>
          <MenuItem value="off">Off — leads keep the owner they came with</MenuItem>
          <MenuItem value="round_robin">Round robin — take turns at each store</MenuItem>
        </TextField>
        <TextField size="small" type="number" label="Minutes to claim a lead" value={assignment.claimMinutes} disabled={assignment.mode === 'off'}
          onChange={(e) => setAssignment({ ...assignment, claimMinutes: Number(e.target.value) })} slotProps={{ htmlInput: { min: 1, max: 120 } }}
          helperText="Not claimed in time? It moves to the next person." />
        <FormControlLabel control={<Switch checked={assignment.onlineOnly} disabled={assignment.mode === 'off'} onChange={(e) => setAssignment({ ...assignment, onlineOnly: e.target.checked })} />}
          label="Only people whose phone is online (used in the last 10 minutes)" />
        {assignment.mode === 'round_robin' && (
          <Alert severity="info">
            Each person's store comes from the Users page. Facebook messages stay with the phone that got them. If nobody at the store is online, the lead goes to the next person without a timer.
          </Alert>
        )}
      </Section>

      <Section title="Daily call list" help="Every morning each salesperson gets one message with today's list: new leads, follow-ups, to-dos and opened quotes.">
        <FormControlLabel control={<Switch checked={dailyList.enabled} onChange={(e) => setDailyList({ ...dailyList, enabled: e.target.checked })} />} label="Send the daily list" />
        <TextField select size="small" label="Send at (New York time)" value={dailyList.hour} disabled={!dailyList.enabled}
          onChange={(e) => setDailyList({ ...dailyList, hour: Number(e.target.value) })}>
          {Array.from({ length: 24 }, (_x, h) => <MenuItem key={h} value={h}>{hourLabel(h)}</MenuItem>)}
        </TextField>
      </Section>

      <Section title="Facebook messages become leads" help="When a buyer messages one of your Facebook accounts about a cart, the phone forwards it and we add a lead for that cart (one per buyer and cart).">
        <FormControlLabel control={<Switch checked={fbLeads.enabled} onChange={(e) => setFbLeads({ enabled: e.target.checked })} />} label="Make leads from Facebook messages" />
      </Section>

      <Box>
        <Button variant="contained" disabled={busy} onClick={save}>Save</Button>
      </Box>
    </Stack>
  );
}

const SpeedSettings: React.FC<object> = () => {
  const { settings, loaded } = useSalesSettings();
  if (!loaded) return <Typography color="text.secondary">Loading…</Typography>;
  return <Form initial={settings} />;
};

export default SpeedSettings;
