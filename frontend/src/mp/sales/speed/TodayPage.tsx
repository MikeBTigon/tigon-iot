// Track 1 (speed to lead) — /mp/today: who to call today (new leads, follow-ups, to-dos, opened quotes, appointments).
import React, { useState } from 'react';
import { Alert, Box, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import MpShell from '../../components/MpShell';
import { useMp } from '../../MpDataContext';
import { isManager, useNow } from '../../crm/crmData';
import LeadDialog from '../../crm/LeadDialog';
import { useSalesSettings } from '../salesData';
import { SECTION_LABEL, useToday, type TodaySection } from './speedData';
import { TodayRowItem } from './TodayRows';

const ORDER: TodaySection[] = ['new', 'appts', 'followup', 'tasks', 'quotes'];

const EMPTY: Record<TodaySection, string> = {
  new: 'Every new lead has been answered.',
  followup: 'No follow-ups due.',
  tasks: 'No to-dos due.',
  quotes: 'No opened quotes waiting.',
  appts: 'No appointments today.',
};

const TodayPage: React.FC = () => {
  const { profile, users } = useMp();
  const manager = isManager(profile);
  const [person, setPerson] = useState('');
  const uid = (manager && person) || profile?.uid || '';
  const personProfile = users.find((u) => u.uid === uid) || (uid === profile?.uid ? profile : undefined);
  const now = useNow(30_000);
  const { settings } = useSalesSettings();
  const { list, leads, loaded, error } = useToday(uid || undefined, personProfile?.location || '', now);
  const [openId, setOpenId] = useState('');
  const open = leads.find((l) => l.id === openId) || null;
  const me = uid === profile?.uid;

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h5" color="primary" sx={{ fontWeight: 700, flexGrow: 1 }}>Today</Typography>
        {manager && (
          <TextField select size="small" label="Person" value={uid} onChange={(e) => setPerson(e.target.value)} sx={{ minWidth: 200 }}>
            {users.map((u) => <MenuItem key={u.uid} value={u.uid}>{u.name || u.email}{u.uid === profile?.uid ? ' (you)' : ''}</MenuItem>)}
          </TextField>
        )}
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {me ? 'Who to call today' : `${personProfile?.name || 'Their'} list for today`} — {new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.
        {' '}Answer new leads first: the faster you reply, the more you sell.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loaded && list.total === 0 && <Alert severity="success" sx={{ mb: 2 }}>All caught up — nothing due today. Nice work!</Alert>}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {ORDER.map((s) => (
          <Chip key={s} label={`${SECTION_LABEL[s].split(' — ')[0]}: ${list.counts[s]}`}
            color={s === 'new' && list.counts.new ? 'error' : list.counts[s] ? 'primary' : 'default'}
            variant={list.counts[s] ? 'filled' : 'outlined'}
            onClick={() => document.getElementById(`today-${s}`)?.scrollIntoView({ behavior: 'smooth' })} />
        ))}
      </Box>

      <Stack spacing={3}>
        {ORDER.map((s) => (
          <Box key={s} id={`today-${s}`}>
            <Typography variant="h6" sx={{ mb: 1 }}>{SECTION_LABEL[s]} ({list.counts[s]})</Typography>
            <Stack spacing={1}>
              {list.rows[s].map((r) => (
                <TodayRowItem key={r.key} row={r} now={now} marks={settings.speed.alertMinutes} onOpenLead={setOpenId} />
              ))}
              {!list.rows[s].length && loaded && <Typography variant="body2" color="text.secondary">{EMPTY[s]}</Typography>}
            </Stack>
          </Box>
        ))}
      </Stack>

      <LeadDialog open={!!open} lead={open} onClose={() => setOpenId('')} />
    </MpShell>
  );
};

export default TodayPage;
