import { useEffect, useState } from 'react';
import {
  collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, MenuItem, Paper, Switch, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Add, Delete, Edit, PlayArrow } from '@mui/icons-material';
import { db, functions } from '../../config/firebase';
import { useMp } from '../MpDataContext';
import { COLLECTIONS, DEALERSHIPS } from '../constants';
import { timeAgo } from '../cartUtils';
import { writeAudit } from '../audit';
import type { Integration, IntegrationKind } from '../growthTypes';

interface RunResult {
  ok: boolean;
  summary: string;
}

const mpRunImport = httpsCallable<{ integrationId: string }, RunResult>(functions, 'mpRunImport');

const KINDS: Array<{ value: IntegrationKind; label: string; urlLabel: string; urlHelp: string }> = [
  { value: 'woocommerce', label: 'WooCommerce', urlLabel: 'Store URL', urlHelp: 'e.g. https://shop.example.com (REST API must be enabled)' },
  { value: 'shopify', label: 'Shopify', urlLabel: 'Shopify admin domain', urlHelp: 'e.g. your-store.myshopify.com' },
  { value: 'json-feed', label: 'JSON feed', urlLabel: 'Feed URL', urlHelp: 'https URL returning JSON with a list of items' },
  { value: 'csv-url', label: 'CSV URL', urlLabel: 'CSV URL', urlHelp: 'https URL of a CSV file (first row = headers), e.g. a published Google Sheet' },
];

/** Cart fields a feed/CSV mapping can target (matches mpCreate.ts FEED_FIELDS). */
const FEED_FIELDS = [
  'id', 'make', 'model', 'year', 'title', 'color', 'seatColor', 'passengers', 'price', 'location', 'condition',
  'serial', 'photos', 'description', 'category', 'inStock', 'fuel', 'batteryType', 'voltage',
];

interface Draft {
  id?: string;
  kind: IntegrationKind;
  name: string;
  baseUrl: string;
  enabled: boolean;
  locationId: string;
  mapping: Array<{ source: string; target: string }>;
  // Credentials (write-only).
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  headerName: string;
  headerValue: string;
}

const EMPTY: Draft = {
  kind: 'woocommerce', name: '', baseUrl: '', enabled: true, locationId: 'T0', mapping: [],
  consumerKey: '', consumerSecret: '', accessToken: '', headerName: '', headerValue: '',
};

type IntegrationRow = Integration & { credentialsSetAt?: number };

/** Import connectors: admins add/edit (credentials are write-only), managers view and run. */
export default function ConnectorsPanel() {
  const { profile } = useMp();
  const isAdmin = profile?.role === 'admin';
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [error, setError] = useState('');
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [secretSaved, setSecretSaved] = useState(false);
  const [removeCarts, setRemoveCarts] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        collection(db, COLLECTIONS.integrations),
        (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as IntegrationRow).sort((a, b) => a.name.localeCompare(b.name))),
        (e) => setError(e.message),
      ),
    [],
  );

  const run = async (id: string) => {
    setRunning((r) => ({ ...r, [id]: true }));
    setError('');
    try {
      const { data } = await mpRunImport({ integrationId: id });
      setResults((r) => ({ ...r, [id]: data }));
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const code = (err.code || '').replace(/^functions\//, '');
      setResults((r) => ({
        ...r,
        [id]: {
          ok: false,
          summary: code === 'not-found' || (code === 'internal' && /^internal$/i.test(err.message || ''))
            ? 'The import function is not deployed yet (mpRunImport).'
            : err.message || 'Import failed.',
        },
      }));
    } finally {
      setRunning((r) => ({ ...r, [id]: false }));
    }
  };

  const edit = (row?: IntegrationRow) => {
    setSecretSaved(false);
    setDraft(
      row
        ? {
            ...EMPTY, id: row.id, kind: row.kind, name: row.name, baseUrl: row.baseUrl, enabled: row.enabled, locationId: row.locationId,
            mapping: Object.entries(row.mapping || {}).map(([source, target]) => ({ source, target })),
          }
        : { ...EMPTY },
    );
  };

  const secretPayload = (d: Draft): Record<string, string> | null => {
    if (d.kind === 'woocommerce') {
      if (!d.consumerKey && !d.consumerSecret) return null;
      if (!d.consumerKey || !d.consumerSecret) throw new Error('Enter both the consumer key and the consumer secret.');
      return { consumerKey: d.consumerKey.trim(), consumerSecret: d.consumerSecret.trim() };
    }
    if (d.kind === 'shopify') return d.accessToken ? { accessToken: d.accessToken.trim() } : null;
    if (d.headerName || d.headerValue) {
      if (!/^[A-Za-z0-9-]+$/.test(d.headerName.trim()) || !d.headerValue) throw new Error('Header name (letters, digits, dashes) and value are both needed.');
      return { headerName: d.headerName.trim(), headerValue: d.headerValue };
    }
    return null;
  };

  const save = async () => {
    if (!draft || !profile) return;
    setSaving(true);
    setError('');
    try {
      if (!draft.name.trim() || !draft.baseUrl.trim()) throw new Error('Name and URL are required.');
      const secret = secretPayload(draft);
      const ref = draft.id ? doc(db, COLLECTIONS.integrations, draft.id) : doc(collection(db, COLLECTIONS.integrations));
      const mapping = Object.fromEntries(draft.mapping.filter((m) => m.source.trim() && m.target).map((m) => [m.source.trim(), m.target]));
      const data: Record<string, unknown> = {
        kind: draft.kind,
        name: draft.name.trim(),
        baseUrl: draft.baseUrl.trim(),
        enabled: draft.enabled,
        locationId: draft.locationId,
        mapping,
      };
      if (secret) data.credentialsSetAt = Date.now();
      if (draft.id) await updateDoc(ref, data);
      else await setDoc(ref, { ...data, createdAt: Date.now() });
      if (secret) {
        // Write-only: functions read this; the app never reads it back.
        await setDoc(doc(db, COLLECTIONS.integrationSecrets, ref.id), { ...secret, updatedAt: Date.now() });
        setSecretSaved(true);
      }
      await writeAudit(profile, draft.id ? 'import.connector_edit' : 'import.connector_add', ref.id, `${draft.kind} ${draft.name}`);
      setDraft({ ...draft, id: ref.id, consumerKey: '', consumerSecret: '', accessToken: '', headerName: '', headerValue: '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: IntegrationRow) => {
    if (!profile || !window.confirm(`Delete connector “${row.name}”?${removeCarts ? ' Its imported listings will be deleted too.' : ''}`)) return;
    setError('');
    try {
      if (removeCarts) {
        const snap = await getDocs(query(collection(db, COLLECTIONS.carts), where('source', '==', `import:${row.id}`)));
        for (let i = 0; i < snap.docs.length; i += 400) {
          const b = writeBatch(db);
          snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
          await b.commit();
        }
      }
      await deleteDoc(doc(db, COLLECTIONS.integrationSecrets, row.id));
      await deleteDoc(doc(db, COLLECTIONS.integrations, row.id));
      await writeAudit(profile, 'import.connector_delete', row.id, `${row.kind} ${row.name}${removeCarts ? ' + listings' : ''}`);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const kind = draft ? KINDS.find((k) => k.value === draft.kind)! : KINDS[0];
  const existing = draft?.id ? rows.find((r) => r.id === draft.id) : undefined;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
        <Typography color="text.secondary" sx={{ flexGrow: 1 }}>
          Pull listings from another store automatically (every 6 hours) or on demand.
        </Typography>
        {isAdmin && <Button variant="contained" startIcon={<Add />} onClick={() => edit()}>Add connector</Button>}
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {rows.length === 0 && (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No connectors yet.{isAdmin ? '' : ' Ask an admin to add one.'}</Typography>
        </Paper>
      )}
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {rows.map((r) => {
          const res = results[r.id];
          return (
            <Paper key={r.id} variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 600 }}>{r.name}</Typography>
                <Chip size="small" label={KINDS.find((k) => k.value === r.kind)?.label || r.kind} />
                <Chip size="small" variant="outlined" label={r.locationId || 'Other'} />
                {!r.enabled && <Chip size="small" color="warning" label="Paused" />}
                <Box sx={{ flexGrow: 1 }} />
                <Button
                  size="small"
                  variant="contained"
                  startIcon={running[r.id] ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
                  disabled={!!running[r.id]}
                  onClick={() => run(r.id)}
                >
                  {running[r.id] ? 'Running…' : 'Run now'}
                </Button>
                {isAdmin && <IconButton size="small" onClick={() => edit(r)} aria-label="Edit"><Edit fontSize="small" /></IconButton>}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>{r.baseUrl}</Typography>
              {r.lastRunAt ? (
                <Typography variant="body2" sx={{ mt: 0.5 }} color={/^Failed/.test(r.lastResult || '') ? 'error' : 'text.primary'}>
                  Last run {timeAgo(r.lastRunAt)}: {r.lastResult}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Never run.</Typography>
              )}
              {res && <Alert sx={{ mt: 1 }} severity={res.ok ? 'success' : 'error'}>{res.summary}</Alert>}
            </Paper>
          );
        })}
      </Box>

      <Dialog open={!!draft} onClose={() => setDraft(null)} fullWidth maxWidth="sm" fullScreen={phone}>
        <DialogTitle>{draft?.id ? 'Edit connector' : 'Add connector'}</DialogTitle>
        {draft && (
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
            <TextField select label="Type" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as IntegrationKind })} disabled={!!draft.id}>
              {KINDS.map((k) => <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>)}
            </TextField>
            <TextField label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Parts store" />
            <TextField label={kind.urlLabel} helperText={kind.urlHelp} value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} />
            <TextField select label="Default location" helperText="Used when an item has no store (T1, T2… values in the source win)." value={draft.locationId} onChange={(e) => setDraft({ ...draft, locationId: e.target.value })}>
              {DEALERSHIPS.map((d) => <MenuItem key={d.id} value={d.id}>{d.id} · {d.cityState || d.name}</MenuItem>)}
            </TextField>
            <FormControlLabel control={<Switch checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />} label="Run automatically every 6 hours" />

            {(draft.kind === 'json-feed' || draft.kind === 'csv-url') && (
              <Box>
                <Typography variant="subtitle2">Field mapping</Typography>
                <Typography variant="caption" color="text.secondary">
                  Source field (JSON key, dotted path like specs.color, or CSV header) → cart field. Unmapped fields are guessed from their names.
                </Typography>
                {draft.mapping.map((m, i) => (
                  <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 1, mt: 1 }}>
                    <TextField size="small" label="Source field" value={m.source} onChange={(e) => setDraft({ ...draft, mapping: draft.mapping.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)) })} />
                    <TextField size="small" select label="Cart field" value={m.target} onChange={(e) => setDraft({ ...draft, mapping: draft.mapping.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)) })}>
                      {FEED_FIELDS.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                    </TextField>
                    <IconButton onClick={() => setDraft({ ...draft, mapping: draft.mapping.filter((_, j) => j !== i) })}><Delete fontSize="small" /></IconButton>
                  </Box>
                ))}
                <Button size="small" startIcon={<Add />} sx={{ mt: 1 }} onClick={() => setDraft({ ...draft, mapping: [...draft.mapping, { source: '', target: 'make' }] })}>
                  Add mapping
                </Button>
              </Box>
            )}

            <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Credentials</Typography>
                {(secretSaved || existing?.credentialsSetAt) && (
                  <Chip size="small" color="success" label={secretSaved ? 'saved ✓' : `saved ✓ ${timeAgo(existing!.credentialsSetAt!)}`} />
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Stored securely and never shown again. Leave blank to keep the saved ones.
              </Typography>
              {draft.kind === 'woocommerce' && (
                <>
                  <TextField size="small" label="Consumer key (ck_…)" value={draft.consumerKey} onChange={(e) => setDraft({ ...draft, consumerKey: e.target.value })} autoComplete="off" />
                  <TextField size="small" label="Consumer secret (cs_…)" type="password" value={draft.consumerSecret} onChange={(e) => setDraft({ ...draft, consumerSecret: e.target.value })} autoComplete="new-password" />
                  <Typography variant="caption" color="text.secondary">WooCommerce → Settings → Advanced → REST API → Add key, permission “Read”.</Typography>
                </>
              )}
              {draft.kind === 'shopify' && (
                <>
                  <TextField size="small" label="Admin API access token (shpat_…)" type="password" value={draft.accessToken} onChange={(e) => setDraft({ ...draft, accessToken: e.target.value })} autoComplete="new-password" />
                  <Typography variant="caption" color="text.secondary">Shopify admin → Settings → Apps → Develop apps → create an app with the read_products scope → install → copy the Admin API token.</Typography>
                </>
              )}
              {(draft.kind === 'json-feed' || draft.kind === 'csv-url') && (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <TextField size="small" label="Header name (optional)" placeholder="Authorization" value={draft.headerName} onChange={(e) => setDraft({ ...draft, headerName: e.target.value })} autoComplete="off" />
                  <TextField size="small" label="Header value" type="password" value={draft.headerValue} onChange={(e) => setDraft({ ...draft, headerValue: e.target.value })} autoComplete="new-password" />
                </Box>
              )}
            </Paper>

            {draft.id && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Button color="error" startIcon={<Delete />} onClick={() => existing && remove(existing)}>Delete connector</Button>
                <FormControlLabel control={<Checkbox checked={removeCarts} onChange={(e) => setRemoveCarts(e.target.checked)} />} label="Also delete its imported listings" />
              </Box>
            )}
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Close</Button>
          <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
