import React, { useMemo, useState } from 'react';
import { Box, Button, Checkbox, Chip, FormControlLabel, Paper, Typography, Alert } from '@mui/material';
import { useMp } from '../MpDataContext';
import { groupAccounts, timeAgo } from '../cartUtils';
import type { MpCart } from '../types';

/** Multi-select checklist of Facebook accounts; "Done" commits all changes at once. */
const PostedOnTracker: React.FC<{ cart: MpCart }> = ({ cart }) => {
  const { accounts, isAdmin, setPostedAccounts, userName } = useMp();
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const grouped = useMemo(() => groupAccounts(accounts), [accounts]);
  const dirty = Object.keys(pending).length > 0;

  const isChecked = (id: string) => (id in pending ? pending[id] : !!cart.postedAccounts[id]);
  const toggle = (id: string) => {
    const want = !isChecked(id);
    setPending((p) => {
      const next = { ...p };
      if (want === !!cart.postedAccounts[id]) delete next[id];
      else next[id] = want;
      return next;
    });
  };

  const commit = async () => {
    setSaving(true);
    setError('');
    try {
      const add = Object.keys(pending).filter((id) => pending[id]);
      const remove = Object.keys(pending).filter((id) => !pending[id]);
      await setPostedAccounts(cart, add, remove);
      setPending({});
    } catch (e) {
      console.error(e);
      setError('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const count = Object.keys(cart.postedAccounts).length;
  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h6" color="primary">Posted on ({count})</Typography>
        {isAdmin && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            {dirty && <Button size="small" onClick={() => setPending({})} disabled={saving}>Cancel</Button>}
            <Button size="small" variant="contained" disabled={!dirty || saving} onClick={commit}>
              {saving ? 'Saving…' : `Done${dirty ? ` (${Object.keys(pending).length})` : ''}`}
            </Button>
          </Box>
        )}
      </Box>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {!accounts.length && <Typography color="text.secondary">No accounts yet — add them on the Accounts tab.</Typography>}
      {grouped.map(([group, list]) => (
        <Box key={group} sx={{ mb: 1.5 }}>
          <Typography variant="overline" color="text.secondary">{group}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {list.map((a) => {
              const entry = cart.postedAccounts[a.id];
              return (
                <FormControlLabel
                  key={a.id}
                  disabled={!isAdmin}
                  control={<Checkbox size="small" checked={isChecked(a.id)} onChange={() => toggle(a.id)} />}
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: a.id in pending ? 700 : 400 }}>{a.name}</Typography>
                      {entry && !(a.id in pending) && (
                        <Typography variant="caption" color="text.secondary">{userName(entry.by)} · {timeAgo(entry.ts)}</Typography>
                      )}
                    </Box>
                  }
                />
              );
            })}
          </Box>
        </Box>
      ))}
      {!isAdmin && <Chip size="small" label="View only — sales role" />}
    </Paper>
  );
};

export default PostedOnTracker;
