import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { SLOTS_PER_DAY, SLOTS_PER_HOUR, SLOT_MIN, fmtHours, hoursOf } from './presence';

export interface TimelineRow { key: string; label: React.ReactNode; slots?: Record<string, unknown>; minHours?: number }

const time = (slot: number) => {
  const m = slot * SLOT_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Online/offline runs of one day as [start, end, on] slot ranges (fewer DOM nodes than 288 cells). */
function runs(slots: Record<string, unknown> | undefined) {
  const out: Array<[number, number, boolean]> = [];
  let start = 0;
  let cur = !!slots?.['0'];
  for (let i = 1; i <= SLOTS_PER_DAY; i++) {
    const on = i < SLOTS_PER_DAY && !!slots?.[String(i)];
    if (i === SLOTS_PER_DAY || on !== cur) {
      out.push([start, i, cur]);
      start = i;
      cur = on;
    }
  }
  return out;
}

/** 24-hour timeline (midnight → midnight, New York time): green = phone online. One row per phone or per day. */
const OnlineTimeline: React.FC<{ rows: TimelineRow[] }> = ({ rows }) => (
  <Box sx={{ overflowX: 'auto' }}>
    <Box sx={{ minWidth: 640 }}>
      <Box sx={{ display: 'flex', ml: '170px', mr: '64px', position: 'relative', height: 18 }}>
        {Array.from({ length: 25 }, (_, h) => (
          <Typography key={h} variant="caption" color="text.secondary"
            sx={{ position: 'absolute', left: `${(h / 24) * 100}%`, transform: 'translateX(-50%)', fontSize: 10, display: h % 2 ? { xs: 'none', md: 'block' } : 'block' }}>
            {String(h % 24).padStart(2, '0')}
          </Typography>
        ))}
      </Box>
      {rows.map((r) => {
        const h = hoursOf(r.slots);
        const low = r.minHours !== undefined && h < r.minHours;
        return (
          <Box key={r.key} sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
            <Box sx={{ width: 170, pr: 1, flexShrink: 0, overflow: 'hidden' }}>
              <Typography variant="body2" noWrap>{r.label}</Typography>
            </Box>
            <Box sx={{ flex: 1, display: 'flex', height: 22, borderRadius: 1, overflow: 'hidden', bgcolor: 'action.hover', position: 'relative' }}>
              {runs(r.slots).map(([a, b, on]) => (
                <Tooltip key={a} title={`${time(a)}–${time(b)} ${on ? 'online' : 'offline'}`}>
                  <Box sx={{ width: `${((b - a) / SLOTS_PER_DAY) * 100}%`, bgcolor: on ? 'success.main' : 'transparent' }} />
                </Tooltip>
              ))}
              {Array.from({ length: 23 }, (_, i) => (
                <Box key={i} sx={{ position: 'absolute', left: `${((i + 1) * SLOTS_PER_HOUR / SLOTS_PER_DAY) * 100}%`, top: 0, bottom: 0, borderLeft: '1px solid', borderColor: 'divider', pointerEvents: 'none' }} />
              ))}
            </Box>
            <Typography variant="body2" sx={{ width: 64, textAlign: 'right', fontWeight: 600, color: low ? 'error.main' : 'text.primary' }}>
              {fmtHours(h)} h
            </Typography>
          </Box>
        );
      })}
    </Box>
  </Box>
);

export default OnlineTimeline;
