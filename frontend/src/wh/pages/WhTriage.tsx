import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  FormControlLabel, Paper, Switch, Typography,
} from '@mui/material';
import { DeleteOutline, DeleteSweep } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import TriageList from '../components/TriageList';
import { errText, useNow } from '../components/Wh1Hooks';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { deleteTriage, restoreTriage, useSystemTriage } from '../triage';
import type { TriageItem, TriageSeverity } from '../triage';

const SEVERITIES: Array<{ value: TriageSeverity | ''; label: string }> = [
  { value: '', label: 'All' }, { value: 'error', label: 'Errors' }, { value: 'warning', label: 'Warnings' },
];

/** System Triage: every system notification (websites, Google Sheets, flows, phones, posting, DMS sync) with delete. */
const WhTriage: React.FC = () => {
  const { profile } = useMp();
  const now = useNow();
  const { items, loading, alertsError } = useSystemTriage(now);
  const [area, setArea] = useState('');
  const [severity, setSeverity] = useState<TriageSeverity | ''>('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<TriageItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const open = useMemo(() => items.filter((i) => !i.deleted), [items]);
  const areas = useMemo(() => {
    const m = new Map<string, number>();
    open.forEach((i) => m.set(i.area, (m.get(i.area) || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [open]);
  const shown = useMemo(
    () => items.filter((i) => (showDeleted || !i.deleted) && (!area || i.area === area) && (!severity || i.severity === severity)),
    [items, showDeleted, area, severity],
  );
  const deletable = shown.filter((i) => !i.deleted);
  const picked = deletable.filter((i) => selected.has(i.id));
  const allPicked = deletable.length > 0 && picked.length === deletable.length;

  const select = (id: string, on: boolean) => {
    const s = new Set(selected);
    if (on) s.add(id); else s.delete(id);
    setSelected(s);
  };

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      setSelected(new Set());
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = (list: TriageItem[]) => run(async () => {
    await deleteTriage(list, profile?.uid || '');
    await writeAudit(profile, 'triage_delete', `${list.length} notification(s)`, list.slice(0, 20).map((i) => i.title).join(', '));
  }, `${list.length} notification(s) deleted.`);

  const doRestore = (list: TriageItem[]) => run(() => restoreTriage(list, profile?.uid || ''), 'Brought back.');

  // One notification deletes right away; several ask first.
  const askDelete = (list: TriageItem[]) => (list.length === 1 ? doDelete(list) : setConfirm(list));

  const hasAlerts = (confirm || []).some((i) => i.source === 'alert');

  return (
    <WhShell title="System Triage" subtitle="Every system notification in one place — fix it, then delete it">
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {alertsError && <Alert severity="warning" sx={{ mb: 2 }}>Could not load the phone/posting alerts: {alertsError}</Alert>}
      {loading ? (
        <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box>
      ) : (
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
            <Chip label={`All areas (${open.length})`} color={!area ? 'primary' : 'default'} onClick={() => setArea('')} />
            {areas.map(([a, n]) => <Chip key={a} label={`${a} (${n})`} color={area === a ? 'primary' : 'default'} onClick={() => setArea(a)} />)}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
            {SEVERITIES.map((s) => (
              <Chip key={s.value} size="small" variant={severity === s.value ? 'filled' : 'outlined'} label={s.label} onClick={() => setSeverity(s.value)} />
            ))}
            <FormControlLabel
              sx={{ ml: 1 }}
              control={<Switch size="small" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />}
              label={<Typography variant="body2">Show deleted</Typography>}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', py: 1, borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={allPicked}
                  indeterminate={picked.length > 0 && !allPicked}
                  disabled={!deletable.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(deletable.map((i) => i.id)) : new Set())}
                />
              }
              label={<Typography variant="body2">{picked.length ? `${picked.length} selected` : 'Select all'}</Typography>}
            />
            <Box sx={{ flexGrow: 1 }} />
            <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutline />} disabled={busy || !picked.length} onClick={() => askDelete(picked)}>
              Delete selected
            </Button>
            <Button size="small" color="error" variant="contained" startIcon={<DeleteSweep />} disabled={busy || !deletable.length} onClick={() => setConfirm(deletable)}>
              Delete all{area || severity ? ' shown' : ''}
            </Button>
          </Box>
          {!shown.length ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
              {open.length ? 'Nothing matches these filters.' : 'All good — no system notifications.'}
            </Typography>
          ) : (
            <TriageList
              items={shown}
              now={now}
              busy={busy}
              onDelete={askDelete}
              onRestore={doRestore}
              selected={selected}
              onSelect={select}
              showArea
            />
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Website, Google Sheets and flow problems come back if they change (a new error, more failed rows, more failed steps). Phone, posting and DMS alerts are removed for good.
          </Typography>
        </Paper>
      )}
      <Dialog open={!!confirm} onClose={() => setConfirm(null)}>
        <DialogTitle>Delete {confirm?.length} notification(s)?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            They disappear from System Triage and "Needs attention" for everyone.
            {hasAlerts ? ' Phone, posting and DMS alerts cannot be brought back.' : ' You can bring them back with "Show deleted".'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => { const c = confirm || []; setConfirm(null); void doDelete(c); }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </WhShell>
  );
};

export default WhTriage;
