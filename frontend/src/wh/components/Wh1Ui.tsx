import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Chip, Paper, Typography } from '@mui/material';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export const CHART_BLUE = '#0e4671';

/** KPI tile. */
export const Kpi: React.FC<{ label: string; value: React.ReactNode; hint?: string; to?: string; tone?: 'error' | 'warning' | 'success' }> = ({ label, value, hint, to, tone }) => {
  const body = (
    <Paper variant="outlined" sx={{ p: 2, height: '100%', '&:hover': to ? { borderColor: 'primary.main' } : undefined }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, color: tone ? `${tone}.main` : 'text.primary', lineHeight: 1.3 }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
  return to ? <Box component={RouterLink} to={to} sx={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{body}</Box> : body;
};

/** Titled panel. */
export const Panel: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <Paper sx={{ p: 2, minWidth: 0 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
      <Typography variant="h6" sx={{ flexGrow: 1, fontSize: 18 }}>{title}</Typography>
      {action}
    </Box>
    {children}
  </Paper>
);

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export const RangeChips: React.FC<{ value: number; onChange: (d: number) => void }> = ({ value, onChange }) => (
  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
    {RANGES.map((r) => (
      <Chip key={r.days} label={r.label} color={value === r.days ? 'primary' : 'default'} variant={value === r.days ? 'filled' : 'outlined'} onClick={() => onChange(r.days)} />
    ))}
  </Box>
);

/** Leads per day bar chart. */
export const DayBars: React.FC<{ data: Array<{ label: string; count: number }>; height?: number }> = ({ data, height = 220 }) => (
  <Box sx={{ width: '100%', height }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={12} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={48} />
        <Tooltip />
        <Bar dataKey="count" name="Leads" fill={CHART_BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  </Box>
);

/** Horizontal "top N" list with proportional bars. */
export const TopList: React.FC<{ rows: Array<{ key: string; label: React.ReactNode; count: number; to?: string }>; empty: string }> = ({ rows, empty }) => {
  if (!rows.length) return <Typography variant="body2" color="text.secondary">{empty}</Typography>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {rows.map((r) => (
        <Box key={r.key}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
              {r.to ? <RouterLink to={r.to}>{r.label}</RouterLink> : r.label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{r.count}</Typography>
          </Box>
          <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover' }}>
            <Box sx={{ height: 6, borderRadius: 3, bgcolor: CHART_BLUE, width: `${(r.count / max) * 100}%` }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
};
