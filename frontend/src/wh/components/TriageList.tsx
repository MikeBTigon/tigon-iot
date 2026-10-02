import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Checkbox, Chip, IconButton, List, ListItem, ListItemIcon, ListItemText, Tooltip, Typography } from '@mui/material';
import { DeleteOutline, ErrorOutline, InfoOutlined, OpenInNew, Restore, WarningAmber } from '@mui/icons-material';
import type { TriageItem } from '../triage';
import { ago } from './Wh1Hooks';

const ICON = {
  error: <ErrorOutline color="error" />,
  warning: <WarningAmber color="warning" />,
  info: <InfoOutlined color="info" />,
};

/** System notifications with a delete (or restore) button each; optional checkboxes for bulk actions. */
const TriageList: React.FC<{
  items: TriageItem[];
  now: number;
  busy?: boolean;
  onDelete: (items: TriageItem[]) => void;
  onRestore?: (items: TriageItem[]) => void;
  selected?: Set<string>;
  onSelect?: (id: string, on: boolean) => void;
  showArea?: boolean;
}> = ({ items, now, busy, onDelete, onRestore, selected, onSelect, showArea }) => (
  <List dense disablePadding>
    {items.map((i) => (
      <ListItem
        key={i.id}
        disableGutters
        divider
        sx={{ alignItems: 'flex-start', opacity: i.deleted ? 0.55 : 1 }}
        secondaryAction={
          <Box sx={{ display: 'flex' }}>
            {i.to && (
              <Tooltip title="Open">
                <IconButton size="small" component={RouterLink} to={i.to} aria-label="Open"><OpenInNew fontSize="small" /></IconButton>
              </Tooltip>
            )}
            {i.deleted ? (
              onRestore && (
                <Tooltip title="Bring back">
                  <IconButton size="small" disabled={busy} onClick={() => onRestore([i])} aria-label="Bring back"><Restore fontSize="small" /></IconButton>
                </Tooltip>
              )
            ) : (
              <Tooltip title="Delete">
                <IconButton size="small" color="error" disabled={busy} onClick={() => onDelete([i])} aria-label="Delete"><DeleteOutline fontSize="small" /></IconButton>
              </Tooltip>
            )}
          </Box>
        }
      >
        {onSelect && (
          <Checkbox
            size="small"
            sx={{ mt: -0.5, ml: -1 }}
            checked={!!selected?.has(i.id)}
            onChange={(e) => onSelect(i.id, e.target.checked)}
            slotProps={{ input: { 'aria-label': `Select ${i.title}` } }}
          />
        )}
        <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>{ICON[i.severity]}</ListItemIcon>
        <ListItemText
          sx={{ pr: i.to ? 9 : 5 }}
          primary={
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{i.title}</Typography>
              {showArea && <Chip size="small" label={i.area} variant="outlined" />}
              {i.deleted && <Chip size="small" label="Deleted" />}
            </Box>
          }
          secondary={
            <>
              <Typography component="span" variant="body2" color="text.primary" sx={{ display: 'block', wordBreak: 'break-word' }}>{i.text}</Typography>
              {i.at ? (
                <Typography component="span" variant="caption" color="text.secondary">
                  {new Date(i.at).toLocaleString()} · {ago(i.at, now)}
                </Typography>
              ) : null}
            </>
          }
        />
      </ListItem>
    ))}
  </List>
);

export default TriageList;
