import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { collection, doc, writeBatch } from 'firebase/firestore';
import {
  Alert, Box, Button, Chip, LinearProgress, MenuItem, Paper, Tab, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { Download, UploadFile } from '@mui/icons-material';
import { db } from '../../config/firebase';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { COLLECTIONS, DEALERSHIPS } from '../constants';
import { formatPrice } from '../cartUtils';
import { writeAudit } from '../audit';
import ConnectorsPanel from './ConnectorsPanel';
import {
  CSV_FIELDS, CSV_TEMPLATE, cartDocFields, formFromCsvRow, guessMapping, newCartFields, type CsvField,
} from './listingModel';

const BATCH = 400;

/** Bulk import (managers): CSV upload with column mapping, and connectors to other stores. */
export default function MpImport() {
  const { profile, reloadCarts } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [tab, setTab] = useState<'csv' | 'connectors'>('csv');

  return (
    <MpShell>
      <Typography variant="h5" sx={{ mb: 1 }}>Import</Typography>
      {!isManager ? (
        <Alert severity="info">Importing listings is for managers and admins. Ask your manager, or add one cart with <b>New listing</b>.</Alert>
      ) : (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab value="csv" label="CSV upload" />
            <Tab value="connectors" label="Connectors" />
          </Tabs>
          {tab === 'csv' ? <CsvImport onDone={reloadCarts} /> : <ConnectorsPanel />}
        </>
      )}
    </MpShell>
  );
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tigon-listings-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function CsvImport({ onDone }: { onDone: () => void }) {
  const { profile } = useMp();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<Partial<Record<CsvField, string>>>({});
  const [defaultLoc, setDefaultLoc] = useState('T0');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number[] } | null>(null);

  const parse = (file: File | undefined) => {
    if (!file) return;
    setError('');
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const fields = (res.meta.fields || []).filter(Boolean);
        if (!fields.length || !res.data.length) {
          setError('That file has no header row or no data rows.');
          return;
        }
        setFileName(file.name);
        setHeaders(fields);
        setRows(res.data);
        setMapping(guessMapping(fields));
        if (res.errors.length) setError(`${res.errors.length} row(s) could not be read cleanly (${res.errors[0].message}). They may be skipped.`);
      },
      error: (e) => setError(e.message),
    });
  };

  const parsed = useMemo(
    () => rows.map((r) => formFromCsvRow(r, mapping, DEALERSHIPS, defaultLoc)),
    [rows, mapping, defaultLoc],
  );
  const valid = parsed.filter(Boolean).length;

  const runImport = async () => {
    if (!profile) return;
    setError('');
    setResult(null);
    setProgress(0);
    const skipped: number[] = [];
    let created = 0;
    try {
      const todo = parsed.map((p, i) => ({ p, row: i + 2 })).filter(({ p, row }) => (p ? true : (skipped.push(row), false)));
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = writeBatch(db);
        for (const { p } of todo.slice(i, i + BATCH)) {
          if (!p) continue;
          const ref = doc(collection(db, COLLECTIONS.carts));
          batch.set(ref, { ...cartDocFields(p.form, ref.id, p.photos), ...newCartFields(profile.uid) });
        }
        await batch.commit();
        created += Math.min(BATCH, todo.length - i);
        setProgress(Math.round((created / todo.length) * 100));
      }
      await writeAudit(profile, 'import.csv', fileName, `${created} created, ${skipped.length} skipped`);
      setResult({ created, skipped });
      onDone();
    } catch (e) {
      setError(`Stopped after ${created} listings: ${e instanceof Error ? e.message : String(e)}`);
      setResult({ created, skipped });
    } finally {
      setProgress(null);
    }
  };

  const mappedCols = CSV_FIELDS.filter((f) => mapping[f.key]);

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Button variant="contained" startIcon={<UploadFile />} onClick={() => fileRef.current?.click()}>
          {fileName ? 'Choose another CSV' : 'Choose CSV file'}
        </Button>
        <Button startIcon={<Download />} onClick={downloadTemplate}>Download CSV template</Button>
        <input ref={fileRef} hidden type="file" accept=".csv,text/csv" onChange={(e) => { parse(e.target.files?.[0]); e.target.value = ''; }} />
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        One row per cart. Rows need make, model and price. Photos: one column with image URLs separated by commas, spaces or “|”.
      </Typography>
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {headers.length > 0 && (
        <>
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{fileName} · {rows.length} rows — match your columns</Typography>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
              {CSV_FIELDS.map((f) => (
                <TextField
                  key={f.key}
                  select
                  size="small"
                  label={f.label}
                  value={mapping[f.key] || ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}
                >
                  <MenuItem value=""><i>— none —</i></MenuItem>
                  {headers.map((h) => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                </TextField>
              ))}
              <TextField select size="small" label="Default location" value={defaultLoc} onChange={(e) => setDefaultLoc(e.target.value)} helperText="When the row has none">
                {DEALERSHIPS.map((d) => <MenuItem key={d.id} value={d.id}>{d.id} · {d.cityState || d.name}</MenuItem>)}
              </TextField>
            </Box>
          </Paper>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Preview (first 20 rows)</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxWidth: '100%' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Row</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Cart</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Condition</TableCell>
                  <TableCell>Photos</TableCell>
                  {mappedCols.some((c) => c.key === 'description') && <TableCell>Description</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {parsed.slice(0, 20).map((p, i) => (
                  <TableRow key={i} sx={p ? undefined : { opacity: 0.55 }}>
                    <TableCell>{i + 2}</TableCell>
                    <TableCell>{p ? <Chip size="small" color="success" label="OK" /> : <Chip size="small" label="Skip" />}</TableCell>
                    <TableCell>{p ? [p.form.year, p.form.make, p.form.model].filter(Boolean).join(' ') : [rows[i][mapping.make || ''], rows[i][mapping.model || '']].filter(Boolean).join(' ') || '—'}</TableCell>
                    <TableCell>{p ? formatPrice(Number(p.form.price)) : rows[i][mapping.price || ''] || '—'}</TableCell>
                    <TableCell>{p?.form.locationId || ''}</TableCell>
                    <TableCell>{p ? (p.form.isUsed ? 'Used' : 'New') : ''}</TableCell>
                    <TableCell>{p?.photos.length ?? ''}</TableCell>
                    {mappedCols.some((c) => c.key === 'description') && (
                      <TableCell sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.form.description}</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {progress !== null && <LinearProgress variant="determinate" value={progress} sx={{ mb: 2, height: 8, borderRadius: 4 }} />}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
            <Button variant="contained" size="large" disabled={!valid || progress !== null} onClick={runImport}>
              Import {valid} row{valid === 1 ? '' : 's'}
            </Button>
            {rows.length - valid > 0 && <Typography color="text.secondary">{rows.length - valid} row(s) will be skipped (missing make, model or price).</Typography>}
          </Box>
        </>
      )}

      {result && (
        <Alert severity={result.created ? 'success' : 'warning'}>
          Created {result.created} listing{result.created === 1 ? '' : 's'}.
          {result.skipped.length > 0 && ` Skipped ${result.skipped.length} (rows ${result.skipped.slice(0, 15).join(', ')}${result.skipped.length > 15 ? '…' : ''}).`}
        </Alert>
      )}
    </Box>
  );
}
