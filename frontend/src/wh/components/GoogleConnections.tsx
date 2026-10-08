import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  IconButton, Link, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { CheckCircle, ContentCopy, Google, ErrorOutline, Link as LinkIcon, LinkOff, OpenInNew, Search, Sync } from '@mui/icons-material';
import { callWh, patchWh, useWhDoc } from '../data';
import { WH } from '../types';
import type { WhSettings } from '../types';
import { shareSheetsWithRobot, sheetIdsIn } from '../googleShare';
import { ago, errText, useDomains, useGlobal, useNow } from './Wh1Hooks';

/** The Google account TIGON IOT's servers act as. Sharing with it never expires (no password, no sign-in token). */
const SERVICE_ACCOUNT = '470095494000-compute@developer.gserviceaccount.com';
const GA_ACK = 'I acknowledge that I have the necessary privacy disclosures and rights from my end users for the collection and processing of their data, including the association of such data with the visitation information Google Analytics collects from my site and/or app property.';

interface SheetsStatus { id: string; lastError?: string; lastErrorAt?: number; pendingRows?: number; deadRows?: number; lastFlushAt?: number; lastFlushRows?: number }
interface SheetCheck { spreadsheetId: string; usedBy: string[]; ok: boolean; title?: string; problem?: string }
interface CheckResult { checkedAt: number; apiProblem: string; sheets: SheetCheck[]; revived: number; allOk: boolean }
interface GoogleStatus { id: string; sheetsCheck?: CheckResult }
interface Stream { account: string; propertyId: string; property: string; streamId: string; stream: string; measurementId: string; uri: string; matchDomainId: string }

const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

const CopyEmail: React.FC = () => {
  const [done, setDone] = useState(false);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
      <Typography sx={{ fontFamily: 'monospace', fontSize: 14, wordBreak: 'break-all' }}>{SERVICE_ACCOUNT}</Typography>
      <Button size="small" variant="outlined" startIcon={<ContentCopy />}
        onClick={() => { void navigator.clipboard.writeText(SERVICE_ACCOUNT).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); }); }}>
        {done ? 'Copied' : 'Copy'}
      </Button>
    </Box>
  );
};

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
    <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: 'primary.main', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>{n}</Box>
    <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>{children}</Box>
  </Box>
);

/** Settings → Google: Google Sheets (lead rows) and Google Analytics 4 (one property per website). */
const GoogleConnections: React.FC = () => {
  const now = useNow();
  const global = useGlobal();
  const { rows: domains } = useDomains();
  const sheets = useWhDoc<SheetsStatus>(WH.settings, 'sheets_status');
  const gstatus = useWhDoc<GoogleStatus>(WH.settings, 'google_status');
  const [sheetDraft, setSheetDraft] = useState<{ sheetId: string; sheetTab: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [streams, setStreams] = useState<Stream[] | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [ack, setAck] = useState<{ domainId: string; stream: Stream } | null>(null);
  const [ackOk, setAckOk] = useState(false);
  const [manual, setManual] = useState<{ domainId: string; label: string; measurementId: string; apiSecret: string } | null>(null);

  const lastCheck = check || gstatus?.sheetsCheck || null;
  const sheetView = sheetDraft || { sheetId: global?.sheetId || '', sheetTab: global?.sheetTab || '' };

  const run = async <T,>(key: string, fn: () => Promise<T>, ok?: (r: T) => string) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      if (ok) setMsg({ ok: true, text: ok(r) });
      return r;
    } catch (e) {
      setMsg({ ok: false, text: errText(e).replace(/^FirebaseError:\s*/, '') });
      return undefined;
    } finally {
      setBusy('');
    }
  };

  const checkSheets = () => run('check', async () => {
    const r = await callWh<CheckResult>('whGoogle', { action: 'check' });
    setCheck(r);
    return r;
  }, (r) => (r.allOk ?
    `Connected — every sheet works.${r.revived ? ` ${r.revived} earlier row(s) will be written within a minute.` : ''}` :
    'Some sheets need attention — see the list below.'));

  const saveSheet = () => run('saveSheet', async () => {
    await patchWh(WH.settings, 'global', { sheetId: sheetView.sheetId.trim(), sheetTab: sheetView.sheetTab.trim() || 'Leads' });
    setSheetDraft(null);
    const r = await callWh<CheckResult>('whGoogle', { action: 'check' });
    setCheck(r);
    return r;
  }, (r) => (r.allOk ? 'Saved and connected. New leads go to this sheet.' : 'Saved. The sheet is not reachable yet — see below.'));

  // Sheets the robot can't reach: failing ones from the last check, the one named in the last error, and the main sheet.
  const sheetsToShare = useMemo(() => {
    const ids = new Set<string>();
    for (const s of lastCheck?.sheets || []) if (!s.ok) ids.add(s.spreadsheetId);
    for (const id of sheetIdsIn(sheets?.lastError)) ids.add(id);
    const main = (global?.sheetId || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] || (/^[a-zA-Z0-9_-]{20,}$/.test(global?.sheetId || '') ? global?.sheetId : '');
    if (main && !(lastCheck?.sheets || []).some((s) => s.ok && s.spreadsheetId === main)) ids.add(main);
    return Array.from(ids);
  }, [lastCheck, sheets?.lastError, global?.sheetId]);

  // The Google popup must open straight from the click, so this signs in first and checks afterwards.
  const shareForMe = () => run('share', async () => {
    const r = await shareSheetsWithRobot(sheetsToShare);
    const c = await callWh<CheckResult>('whGoogle', { action: 'check' }).catch(() => null);
    if (c) setCheck(c);
    if (r.failed.length) throw new Error(r.failed.map((f) => `${f.id.slice(0, 10)}…: ${f.error}`).join(' · '));
    return { r, c };
  }, ({ r, c }) => (c?.allOk ?
    `Shared ${r.shared.length} sheet(s) as ${r.account} — connected.${c.revived ? ` ${c.revived} waiting row(s) will be written within a minute.` : ''}` :
    `Shared ${r.shared.length} sheet(s) as ${r.account}. Google can take a minute to apply it — press Check & connect if anything still shows a problem.`));

  // ---- Google Analytics ----
  const rowsGa = useMemo(() => {
    const list: Array<{ domainId: string; label: string; url?: string; s?: WhSettings }> = [{ domainId: '', label: 'All websites (default)', s: global || undefined }];
    for (const d of (domains || []).slice().sort((a, b) => a.name.localeCompare(b.name))) list.push({ domainId: d.id, label: d.name, url: d.url, s: d.settings });
    return list;
  }, [domains, global]);

  const findStreams = () => run('find', async () => {
    const r = await callWh<{ streams: Stream[]; apiProblem: string }>('whGoogle', { action: 'gaList' });
    setStreams(r.streams);
    const p: Record<string, string> = {};
    for (const s of r.streams) if (s.matchDomainId && !p[s.matchDomainId]) p[s.matchDomainId] = `${s.propertyId}/${s.streamId}`;
    setPick((old) => ({ ...p, ...old }));
    if (r.apiProblem) throw new Error(r.apiProblem);
    return r;
  }, (r) => (r.streams.length ?
    `Found ${r.streams.length} website stream(s). Websites whose address matches were picked for you — check them and press Connect.` :
    `No Analytics properties found. Add ${SERVICE_ACCOUNT} to your Analytics account (step 1), wait a minute, then try again.`));

  const connect = (domainId: string, stream: Stream, acknowledge = false) => run(`ga-${domainId}`, async () => {
    try {
      return await callWh<{ measurementId: string; problem: string }>('whGoogle', {
        action: 'gaConnect', domainId, propertyId: stream.propertyId, streamId: stream.streamId, acknowledge,
      });
    } catch (e) {
      if (errText(e).includes('NEEDS_ACK')) { setAck({ domainId, stream }); setAckOk(false); }
      throw e;
    }
  }, (r) => (r.problem ? `Connected to ${r.measurementId}, but Google says: ${r.problem}` : `Connected to ${r.measurementId}. Leads are now sent to Google Analytics as "generate_lead".`));

  const disconnect = (domainId: string) => run(`ga-${domainId}`, () => callWh('whGoogle', { action: 'gaDisconnect', domainId }), () => 'Disconnected.');

  const saveManual = () => manual && run('manual', async () => {
    const r = await callWh<{ measurementId: string; problem: string }>('whGoogle', {
      action: 'gaManual', domainId: manual.domainId, measurementId: manual.measurementId, apiSecret: manual.apiSecret,
    });
    setManual(null);
    return r;
  }, (r) => (r.problem ? `Saved ${r.measurementId}, but Google says: ${r.problem}` : `Saved ${r.measurementId}.`));

  const healthy = sheets && !sheets.lastError && !(sheets.deadRows || 0);

  return (
    <Stack spacing={2}>
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>How TIGON IOT connects to Google</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          TIGON IOT has its own Google robot account. You share a sheet or an Analytics account with it once — that's the whole connection.
          There is no password or sign-in that can expire, so it doesn't disconnect when someone changes a password or leaves.
          If Google ever refuses (a sheet was un-shared, the API was switched off), TIGON IOT keeps the rows, switches the API back on by itself
          and retries every hour until they go through.
        </Typography>
        <CopyEmail />
      </Paper>

      {/* ---------------- Google Sheets ---------------- */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 700, flexGrow: 1 }}>Google Sheets — leads sheet</Typography>
          {sheets === undefined ? <CircularProgress size={18} /> : healthy ?
            <Chip color="success" icon={<CheckCircle />} label={sheets?.lastFlushAt ? `Working · last write ${ago(sheets.lastFlushAt, now)}` : 'Working'} /> :
            <Chip color="error" icon={<ErrorOutline />} label="Needs attention" />}
        </Box>
        <Step n={1}>
          <Typography variant="body2" sx={{ mb: 1 }}>Paste the link of your leads Google Sheet (every website writes here unless a website has its own).</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <TextField size="small" fullWidth label="Google Sheet link" placeholder="https://docs.google.com/spreadsheets/d/…/edit"
              value={sheetView.sheetId} onChange={(e) => setSheetDraft({ ...sheetView, sheetId: e.target.value })} />
            <TextField size="small" label="Tab name" placeholder="Leads" sx={{ minWidth: 160 }}
              value={sheetView.sheetTab} onChange={(e) => setSheetDraft({ ...sheetView, sheetTab: e.target.value })} />
            <Button variant="contained" onClick={saveSheet} disabled={!!busy || !sheetDraft}>{busy === 'saveSheet' ? 'Saving…' : 'Save'}</Button>
          </Stack>
        </Step>
        <Step n={2}>
          <Typography variant="body2">
            Open the sheet{sheetView.sheetId ? <> (<Link href={sheetView.sheetId.startsWith('http') ? sheetView.sheetId : sheetUrl(sheetView.sheetId)} target="_blank" rel="noreferrer">open it</Link>)</> : ''},
            click <b>Share</b>, paste the robot address above, choose <b>Editor</b>, untick "Notify people" and click <b>Share</b>.
            Do the same for any other sheet a website or flow uses.
          </Typography>
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary">Or let TIGON IOT do it:</Typography>
            <Button variant={sheetsToShare.length ? 'contained' : 'outlined'} size="small" disabled={!!busy || !sheetsToShare.length} onClick={shareForMe}
              startIcon={busy === 'share' ? <CircularProgress size={16} color="inherit" /> : <Google />}>
              Share it for me{sheetsToShare.length > 1 ? ` (${sheetsToShare.length} sheets)` : ''}
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Sign in with the Google account that owns the sheet. It adds the robot as an Editor once — nothing is saved and nothing can expire.
          </Typography>
        </Step>
        <Step n={3}>
          <Button variant="contained" startIcon={busy === 'check' ? <CircularProgress size={16} color="inherit" /> : <Sync />} onClick={checkSheets} disabled={!!busy}>
            Check &amp; connect
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Switches on the Google Sheets API if needed, tests every sheet in use and re-sends rows that failed before.
          </Typography>
        </Step>

        {sheets && (sheets.lastError || (sheets.deadRows || 0) > 0 || (sheets.pendingRows || 0) > 0) && (
          <Alert severity={sheets.lastError || sheets.deadRows ? 'warning' : 'info'} sx={{ mb: 1.5 }}>
            {(sheets.pendingRows || 0) > 0 && <>{sheets.pendingRows} row(s) waiting to be written. </>}
            {(sheets.deadRows || 0) > 0 && <>{sheets.deadRows} row(s) are being retried every hour. </>}
            {sheets.lastError && <>Last problem{sheets.lastErrorAt ? ` (${ago(sheets.lastErrorAt, now)})` : ''}: {sheets.lastError}</>}
          </Alert>
        )}

        {lastCheck && (
          <>
            <Typography variant="caption" color="text.secondary">Last check {ago(lastCheck.checkedAt, now)}</Typography>
            {lastCheck.apiProblem && <Alert severity="error" sx={{ my: 1 }}>{lastCheck.apiProblem}</Alert>}
            {!lastCheck.sheets.length ? (
              <Typography variant="body2" color="text.secondary">No sheets are set up yet — do step 1.</Typography>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow><TableCell>Sheet</TableCell><TableCell>Used by</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                  <TableBody>
                    {lastCheck.sheets.map((s) => (
                      <TableRow key={s.spreadsheetId}>
                        <TableCell>
                          <Link href={sheetUrl(s.spreadsheetId)} target="_blank" rel="noreferrer">{s.title || s.spreadsheetId}</Link>
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{s.usedBy.join(', ')}</TableCell>
                        <TableCell>
                          {s.ok ? <Chip size="small" color="success" icon={<CheckCircle />} label="Connected" /> :
                            <Typography variant="body2" color="error">{s.problem}</Typography>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </>
        )}
      </Paper>

      {/* ---------------- Google Analytics ---------------- */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 700, mb: 1.5 }}>Google Analytics 4 — one property per website</Typography>
        <Step n={1}>
          <Typography variant="body2">
            In <Link href="https://analytics.google.com/analytics/web/#/admin" target="_blank" rel="noreferrer">Google Analytics → Admin</Link>{' '}
            → <b>Account access management</b> → <b>+ Add users</b>: paste the robot address, role <b>Editor</b>, untick "Notify", <b>Add</b>.
            Do this once for <b>each</b> Analytics account you use — all of its properties then show up here.
          </Typography>
        </Step>
        <Step n={2}>
          <Button variant="contained" startIcon={busy === 'find' ? <CircularProgress size={16} color="inherit" /> : <Search />} onClick={findStreams} disabled={!!busy}>
            Find my Analytics properties
          </Button>
        </Step>
        <Step n={3}>
          <Typography variant="body2">Pick the property for each website and press <b>Connect</b>. TIGON IOT creates the key it needs by itself.</Typography>
        </Step>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow><TableCell>Website</TableCell><TableCell>Connected to</TableCell><TableCell sx={{ minWidth: 260 }}>Analytics property / stream</TableCell><TableCell /></TableRow>
            </TableHead>
            <TableBody>
              {rowsGa.map((r) => {
                const connected = r.s?.ga4MeasurementId;
                const chosen = streams?.find((s) => `${s.propertyId}/${s.streamId}` === pick[r.domainId]);
                return (
                  <TableRow key={r.domainId || 'global'}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.label}</Typography>
                      {r.url && <Typography variant="caption" color="text.secondary">{r.url}</Typography>}
                    </TableCell>
                    <TableCell>
                      {connected ? (
                        <>
                          <Chip size="small" color="success" icon={<CheckCircle />} label={r.s?.ga4MeasurementId} />
                          {r.s?.ga4Property && r.s.ga4Property !== connected && <Typography variant="caption" sx={{ display: 'block' }}>{r.s.ga4Property}</Typography>}
                        </>
                      ) : <Typography variant="body2" color="text.secondary">{r.domainId ? 'Uses the default' : 'Not connected'}</Typography>}
                    </TableCell>
                    <TableCell>
                      {streams ? (
                        <TextField select size="small" fullWidth value={pick[r.domainId] || ''} onChange={(e) => setPick({ ...pick, [r.domainId]: e.target.value })}
                          label="Choose">
                          <MenuItem value="">—</MenuItem>
                          {streams.map((s) => (
                            <MenuItem key={`${s.propertyId}/${s.streamId}`} value={`${s.propertyId}/${s.streamId}`}>
                              {s.property} · {s.stream} ({s.measurementId}){s.uri ? ` — ${s.uri}` : ''}{s.account ? ` · ${s.account}` : ''}
                            </MenuItem>
                          ))}
                        </TextField>
                      ) : <Typography variant="caption" color="text.secondary">Press "Find my Analytics properties"</Typography>}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Button size="small" variant="contained" startIcon={busy === `ga-${r.domainId}` ? <CircularProgress size={14} color="inherit" /> : <LinkIcon />}
                        disabled={!!busy || !chosen} onClick={() => chosen && connect(r.domainId, chosen)}>Connect</Button>
                      <Tooltip title="Paste a Measurement ID and API secret instead">
                        <Button size="small" onClick={() => setManual({ domainId: r.domainId, label: r.label, measurementId: r.s?.ga4MeasurementId || '', apiSecret: '' })}>By hand</Button>
                      </Tooltip>
                      {connected && (
                        <Tooltip title="Disconnect">
                          <IconButton size="small" color="error" disabled={!!busy} onClick={() => disconnect(r.domainId)} aria-label="Disconnect"><LinkOff fontSize="small" /></IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Each lead is sent as a "generate_lead" event to the website's property (or the default). The key never expires; if a
          property is deleted or access is removed, press Connect again.
        </Typography>
      </Paper>

      <Dialog open={!!ack} onClose={() => setAck(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Google's data-collection terms</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Before a key can be created for <b>{ack?.stream.property}</b>, Google asks the property owner to confirm this once:
          </Typography>
          <Alert severity="info" icon={false} sx={{ mb: 1 }}>{GA_ACK}</Alert>
          <FormControlLabel control={<Checkbox checked={ackOk} onChange={(e) => setAckOk(e.target.checked)} />} label="I agree" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAck(null)}>Cancel</Button>
          <Button variant="contained" disabled={!ackOk} onClick={() => { const a = ack; setAck(null); if (a) void connect(a.domainId, a.stream, true); }}>Agree &amp; connect</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!manual} onClose={() => setManual(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Connect {manual?.label} by hand</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            In Google Analytics: Admin → <b>Data streams</b> → click the website's stream. Copy the <b>Measurement ID</b> (G-…). Then open
            <b> Measurement Protocol API secrets</b> → <b>Create</b> → name it "TIGON IOT" → copy the <b>Secret value</b>.{' '}
            <Link href="https://analytics.google.com/analytics/web/#/admin" target="_blank" rel="noreferrer">Open Analytics <OpenInNew sx={{ fontSize: 14, verticalAlign: 'middle' }} /></Link>
          </Typography>
          <Stack spacing={2}>
            <TextField size="small" label="Measurement ID" placeholder="G-XXXXXXXXXX" value={manual?.measurementId || ''}
              onChange={(e) => manual && setManual({ ...manual, measurementId: e.target.value })} />
            <TextField size="small" label="API secret value" value={manual?.apiSecret || ''}
              onChange={(e) => manual && setManual({ ...manual, apiSecret: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManual(null)}>Cancel</Button>
          <Button variant="contained" disabled={!!busy || !manual?.measurementId || !manual?.apiSecret} onClick={() => void saveManual()}>
            {busy === 'manual' ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default GoogleConnections;
