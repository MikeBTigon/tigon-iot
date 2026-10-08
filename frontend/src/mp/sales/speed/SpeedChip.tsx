// Track 1 (speed to lead) — the response timer chip: "Waiting 12 min" (amber/red) or "Answered in 4 min" (green).
import React from 'react';
import { Chip } from '@mui/material';
import { CheckCircle, Timer } from '@mui/icons-material';
import { speedState, type SpeedLead } from './speedUtil';

const SpeedChip: React.FC<{ lead: Partial<SpeedLead>; now: number; marks?: number[]; showAnswered?: boolean }> = ({
  lead, now, marks, showAnswered = true,
}) => {
  const s = speedState(lead, now, marks);
  if (!s) return null;
  if (s.kind === 'answered') {
    if (!showAnswered) return null;
    return <Chip size="small" color="success" variant="outlined" icon={<CheckCircle />} label={s.label} />;
  }
  const color = s.level === 'late' ? 'error' : s.level === 'warn' ? 'warning' : 'info';
  return <Chip size="small" color={color} icon={<Timer />} label={s.label} />;
};

export default SpeedChip;
