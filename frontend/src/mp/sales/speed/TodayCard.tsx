// Track 1 (speed to lead) — Dashboard → This Device (top): today's counts + the first 5 people to call.
import React, { useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { Today } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useMp } from '../../MpDataContext';
import { useNow } from '../../crm/crmData';
import LeadDialog from '../../crm/LeadDialog';
import { useSalesSettings } from '../salesData';
import { useToday, type TodaySection } from './speedData';
import { TodayRowItem } from './TodayRows';

const ORDER: TodaySection[] = ['new', 'appts', 'followup', 'tasks', 'quotes'];
const SHORT: Record<TodaySection, [string, string]> = {
  new: ['new lead', 'new leads'], followup: ['follow-up', 'follow-ups'], tasks: ['to-do', 'to-dos'],
  quotes: ['quote opened', 'quotes opened'], appts: ['appointment', 'appointments'],
};

const TodayCard: React.FC<object> = () => {
  const { profile } = useMp();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const { settings } = useSalesSettings();
  const { list, leads, loaded } = useToday(profile?.uid, profile?.location || '', now);
  const [openId, setOpenId] = useState('');
  if (!profile || !loaded) return null;
  const top = ORDER.flatMap((s) => list.rows[s]).slice(0, 5);
  const open = leads.find((l) => l.id === openId) || null;

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Today color="primary" />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Who to call today</Typography>
          <Button size="small" variant="contained" onClick={() => navigate('/mp/today')}>Open Today</Button>
        </Box>
        {list.total === 0 ? (
          <Typography color="text.secondary">All caught up — nothing due today.</Typography>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
              {ORDER.filter((s) => list.counts[s]).map((s) => (
                <Chip key={s} size="small" color={s === 'new' ? 'error' : 'primary'}
                  label={`${list.counts[s]} ${SHORT[s][list.counts[s] === 1 ? 0 : 1]}`} />
              ))}
            </Box>
            <Stack spacing={1}>
              {top.map((r) => <TodayRowItem key={r.key} row={r} now={now} marks={settings.speed.alertMinutes} onOpenLead={setOpenId} compact />)}
            </Stack>
            {list.total > top.length && (
              <Button size="small" sx={{ mt: 1 }} onClick={() => navigate('/mp/today')}>See all {list.total}</Button>
            )}
          </>
        )}
      </CardContent>
      <LeadDialog open={!!open} lead={open} onClose={() => setOpenId('')} />
    </Card>
  );
};

export default TodayCard;
