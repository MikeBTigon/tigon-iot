import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, IconButton, InputLabel,
  MenuItem, Paper, Select, TextField, Typography,
} from '@mui/material';
import { Add, Delete, DragIndicator, Edit } from '@mui/icons-material';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { ACCOUNT_GROUPS, LEGACY_USERS } from '../constants';
import { importLegacyData } from '../legacyImport';
import { timeAgo } from '../cartUtils';
import type { MpAccount, MpRole } from '../types';

type Draft = Omit<MpAccount, 'id'> & { id?: string };

const MpAccounts: React.FC = () => {
  const { accounts, saveAccount, deleteAccount, users, setUserRole, userName, carts, deleteCarts, reloadCarts, seedAccounts, profile, syncStatus, syncNow } = useMp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const names = [...new Set([...ACCOUNT_GROUPS, ...accounts.map((a) => a.group || 'Other')])];
    return names.map((g) => [g, accounts.filter((a) => (a.group || 'Other') === g)] as const);
  }, [accounts]);

  const ownerOptions = useMemo(() => {
    const opts = users.map((u) => ({ value: u.uid, label: u.name || u.email }));
    for (const l of LEGACY_USERS) if (!users.some((u) => u.legacyId === l.id)) opts.push({ value: l.id, label: `${l.name} (legacy)` });
    return opts;
  }, [users]);

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(true);
    setError('');
    setStatus(label);
    try {
      const msg = await fn();
      setStatus(msg || 'Done.');
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (group: string) => {
    const a = accounts.find((x) => x.id === dragId);
    setDragId(null);
    setOverGroup(null);
    if (a && a.group !== group) run(`Moving ${a.name} to ${group}…`, () => saveAccount({ ...a, group }).then(() => `Moved ${a.name} to ${group}.`));
  };

  const deleteFlagged = carts.filter((c) => c.flaggedDelete);

  return (
    <MpShell adminOnly>
      {status && <Alert severity="info" sx={{ mb: 2 }}>{status}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Facebook accounts ({accounts.length})</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDraft({ name: '', group: 'Other', owner: '' })}>Add account</Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Drag an account onto another location to move it.</Typography>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', mb: 4 }}>
        {groups.map(([g, list]) => (
          <Paper
            key={g}
            onDragOver={(e) => { e.preventDefault(); setOverGroup(g); }}
            onDragLeave={() => setOverGroup((o) => (o === g ? null : o))}
            onDrop={() => onDrop(g)}
            sx={{ p: 1.5, outline: overGroup === g ? '2px dashed' : 'none', outlineColor: 'primary.main', minHeight: 80 }}
          >
            <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>{g} ({list.length})</Typography>
            {list.map((a) => (
              <Box
                key={a.id}
                draggable
                onDragStart={() => setDragId(a.id)}
                onDragEnd={() => { setDragId(null); setOverGroup(null); }}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25, opacity: dragId === a.id ? 0.4 : 1, cursor: 'grab' }}
              >
                <DragIndicator fontSize="small" sx={{ color: 'grey.400' }} />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap>{a.name}</Typography>
                  {a.owner && <Typography variant="caption" color="text.secondary">{userName(a.owner)}</Typography>}
                </Box>
                <IconButton size="small" onClick={() => setDraft({ ...a })} aria-label="Edit"><Edit fontSize="small" /></IconButton>
                <IconButton
                  size="small"
                  aria-label="Delete"
                  onClick={() => window.confirm(`Delete account "${a.name}"? Posting history on carts is kept.`) && run('Deleting…', () => deleteAccount(a.id).then(() => `Deleted ${a.name}.`))}
                >
                  <Delete fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Paper>
        ))}
      </Box>

      <Typography variant="h5" gutterBottom>Team</Typography>
      <Paper sx={{ p: 2, mb: 4 }}>
        {users.map((u) => (
          <Box key={u.uid} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, flexWrap: 'wrap' }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography sx={{ fontWeight: 600 }}>{u.name}</Typography>
              <Typography variant="caption" color="text.secondary">{u.email}{u.legacyId ? ` · legacy: ${u.legacyId}` : ''}</Typography>
            </Box>
            <Select
              size="small"
              value={u.role}
              disabled={u.uid === profile?.uid}
              onChange={(e) => run('Updating role…', () => setUserRole(u.uid, e.target.value as MpRole).then(() => `${u.name} is now ${e.target.value}.`))}
            >
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="sales">Sales</MenuItem>
            </Select>
          </Box>
        ))}
      </Paper>

      <Typography variant="h5" gutterBottom>Maintenance</Typography>
      <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() =>
              run('Syncing active inventory from the DMS (production)… this can take a minute.', async () => {
                const r = await syncNow();
                return `DMS sync done: ${r.inStock} in stock, ${r.written} updated, ${r.removedSold} sold removed.${r.warning ? ' ' + r.warning : ''}`;
              })
            }
          >
            Sync from DMS now
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Inventory syncs automatically every hour from the DMS API (active, in-stock carts only; sold carts are removed).
            {syncStatus?.finishedAt && (
              <>
                {' '}Last run {timeAgo(syncStatus.finishedAt)} ({syncStatus.trigger?.startsWith('manual') ? 'manual' : 'scheduled'}):{' '}
                {syncStatus.ok
                  ? `${syncStatus.inStock} in stock, ${syncStatus.written} updated, ${syncStatus.removedSold} removed.`
                  : `failed — ${syncStatus.error}`}
                {syncStatus.warning ? ` ${syncStatus.warning}` : ''}
              </>
            )}
          </Typography>
        </Box>
        <Box>
          <Button
            variant="outlined"
            color="error"
            disabled={busy || deleteFlagged.length === 0}
            onClick={() =>
              window.confirm(`Remove ${deleteFlagged.length} cart(s) with "delete" in their data?`) &&
              run('Removing…', () => deleteCarts(deleteFlagged.map((c) => c.docId)).then(() => `Removed ${deleteFlagged.length} 'delete' carts.`))
            }
          >
            Scan & remove 'delete' carts
          </Button>
          <Chip size="small" label={`${deleteFlagged.length} found`} sx={{ ml: 1 }} />
        </Box>
        <Box>
          <Button
            variant="outlined"
            disabled={busy}
            onClick={() =>
              window.confirm('Copy all carts, accounts and posting history from the old tigon-marketplace site into TIGON IOT? Safe to re-run.') &&
              run('Importing…', async () => {
                const msg = await importLegacyData(setStatus);
                reloadCarts();
                return msg;
              })
            }
          >
            Import from legacy MP Assistant
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            One-time migration from tigon-marketplace.web.app. Existing carts are merged, not duplicated.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" disabled={busy} onClick={() => run('Seeding…', () => seedAccounts().then(() => 'Default accounts restored.'))}>
            Restore default accounts
          </Button>
          <Button variant="outlined" disabled={busy} onClick={() => { reloadCarts(); setStatus('Reloading inventory…'); }}>
            Reload inventory
          </Button>
        </Box>
      </Paper>

      <Dialog open={!!draft} onClose={() => setDraft(null)} fullWidth maxWidth="xs">
        <DialogTitle>{draft?.id ? 'Edit account' : 'Add account'}</DialogTitle>
        {draft && (
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
            <TextField label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
            <FormControl>
              <InputLabel>Location</InputLabel>
              <Select label="Location" value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })}>
                {groups.map(([g]) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl>
              <InputLabel>Owner</InputLabel>
              <Select label="Owner" value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })}>
                <MenuItem value="">Unassigned</MenuItem>
                {ownerOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!draft?.name.trim()}
            onClick={() => {
              const d = draft!;
              setDraft(null);
              run('Saving…', () => saveAccount({ ...d, name: d.name.trim() }).then(() => `Saved ${d.name.trim()}.`));
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </MpShell>
  );
};

export default MpAccounts;
