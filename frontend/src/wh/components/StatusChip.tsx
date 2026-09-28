import React from 'react';
import { Chip } from '@mui/material';
import type { ChipProps } from '@mui/material';

type Tone = 'green' | 'orange' | 'red' | 'grey' | 'purple' | 'blue';

const TONES: Record<string, { tone: Tone; label: string }> = {
  done: { tone: 'green', label: 'Done' },
  success: { tone: 'green', label: 'Success' },
  active: { tone: 'green', label: 'Active' },
  partial: { tone: 'orange', label: 'Partial' },
  retrying: { tone: 'orange', label: 'Retrying' },
  paused: { tone: 'grey', label: 'Paused' },
  failed: { tone: 'red', label: 'Failed' },
  dead: { tone: 'red', label: 'Dead letter' },
  spam: { tone: 'grey', label: 'Spam' },
  skipped: { tone: 'grey', label: 'Skipped' },
  duplicate: { tone: 'purple', label: 'Duplicate' },
  queued: { tone: 'blue', label: 'Queued' },
  processing: { tone: 'blue', label: 'Processing' },
};

const SX: Record<Tone, ChipProps['sx']> = {
  green: { bgcolor: '#2e7d32', color: '#fff' },
  orange: { bgcolor: '#ed6c02', color: '#fff' },
  red: { bgcolor: '#d32f2f', color: '#fff' },
  grey: { bgcolor: '#757575', color: '#fff' },
  purple: { bgcolor: '#7b1fa2', color: '#fff' },
  blue: { bgcolor: '#1565c0', color: '#fff' },
};

/** Colored status chip for submissions, step runs, websites and webhooks. */
const StatusChip: React.FC<{ status?: string; label?: string; size?: 'small' | 'medium' }> = ({ status, label, size = 'small' }) => {
  const t = TONES[status || ''] || { tone: 'grey' as Tone, label: status || '—' };
  return <Chip size={size} label={label || t.label} sx={{ ...(SX[t.tone] as object), fontWeight: 600 }} />;
};

export default StatusChip;
