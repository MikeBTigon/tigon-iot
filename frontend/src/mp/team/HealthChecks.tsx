// Automatic checks the server runs every 15 minutes (mpHealth → mp_meta/health): texting phones, inventory sync,
// backups, Google Sheets, website form backlog, and whether the website answers.
import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Alert, Box, Chip, Paper, Typography } from '@mui/material';
import { db } from '../../config/firebase';
import { timeAgo } from '../cartUtils';

interface Check { key: string; ok: boolean; detail?: string; at?: number }
interface Health { checks?: Check[]; ok?: boolean; updatedAt?: number }

const LABELS: Record<string, string> = {
  textingPhone: 'Texting phones', texting: 'Texting phones', dms: 'Inventory sync (DMS)', sync: 'Inventory sync (DMS)',
  backup: 'Nightly backup', sheets: 'Google Sheets', whBacklog: 'Website forms', uptime: 'Website online',
};
const label = (k: string) => LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

const HealthChecks: React.FC = () => {
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  useEffect(() => onSnapshot(doc(db, 'mp_meta', 'health'), (s) => setHealth(s.exists() ? (s.data() as Health) : null), () => setHealth(null)), []);
  if (health === undefined) return null;
  if (!health?.checks?.length) {
    return <Alert severity="info" sx={{ mb: 2 }}>Automatic checks start within 15 minutes of the next update going live.</Alert>;
  }
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography sx={{ fontWeight: 700, flexGrow: 1 }}>Automatic checks</Typography>
        {health.updatedAt ? <Typography variant="caption" color="text.secondary">checked {timeAgo(health.updatedAt)}</Typography> : null}
      </Box>
      {health.checks.map((c) => (
        <Box key={c.key} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}>
          <Chip size="small" color={c.ok ? 'success' : 'error'} label={c.ok ? 'OK' : 'Problem'} sx={{ minWidth: 72 }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{label(c.key)}</Typography>
            {c.detail && <Typography variant="caption" color="text.secondary">{c.detail}</Typography>}
          </Box>
        </Box>
      ))}
    </Paper>
  );
};

export default HealthChecks;
