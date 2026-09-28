import { Box, Chip, Typography } from '@mui/material';

import type { ChipOption } from '../filterUtils';

interface Props<T extends string> {
  label: string;
  value: T;
  options: ChipOption<T>[];
  onChange: (v: T) => void;
}

/** Single-select chip row; the first option is conventionally "Any". */
export default function ChipFilter<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{label}</Typography>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {options.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            size="small"
            color={o.value === value ? 'primary' : 'default'}
            variant={o.value === value ? 'filled' : 'outlined'}
            onClick={() => onChange(o.value)}
          />
        ))}
      </Box>
    </Box>
  );
}
