import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Divider, FormControlLabel, InputAdornment, MenuItem, Paper,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { Calculate, ExpandLess, ExpandMore, PictureAsPdf, RestartAlt } from '@mui/icons-material';
import MpShell from '../components/MpShell';
import { DEALERSHIPS } from '../constants';
import {
  BRANDS, LENDER_LABEL, TIERS, brandLabel, buildResults, computeOtd, customerSheetRows, deliveryFee, estimateDriveMinutes, fmtDuration,
  prepFeeFor, rateLabel, taxRateFor, termsFor,
} from '../finance/financeCalc';
import type { Brand, Condition, EvoModel, Quote } from '../finance/financeCalc';
import { findPlace, loadZips, suggestPlaces } from '../finance/zipLookup';
import type { Place } from '../finance/zipLookup';
import { downloadCustomerSheet } from '../finance/financePdf';
import { notify } from '../../ui/notify';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const num = (s: string) => {
  const v = parseFloat(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(v) ? v : 0;
};
/** "109", "1:49", "1h 49m", "1 hr 49 min", "2h" → minutes. */
function parseMinutes(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/);
  if (m && (m[1] || m[2])) return Math.round(Number(m[1] || 0) * 60 + Number(m[2] || 0));
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const STORES = DEALERSHIPS.filter((d) => /\b\d{5}\b/.test(d.address)).map((d) => ({ id: d.id, name: d.name, zip: (d.address.match(/\b(\d{5})\b(?!.*\b\d{5}\b)/) || [])[1] || '' }));
const TAX_PRESETS: Array<{ id: string; label: string; rate: number }> = [
  { id: 'pa-phl', label: 'Pennsylvania, Philadelphia County — 8%', rate: 0.08 },
  { id: 'pa-alg', label: 'Pennsylvania, Allegheny County — 7%', rate: 0.07 },
  { id: 'pa', label: 'Pennsylvania, other counties — 6%', rate: 0.06 },
  { id: 'nj', label: 'New Jersey — 6.625%', rate: 0.06625 },
  { id: 'de', label: 'Delaware — 0%', rate: 0 },
  { id: 'md', label: 'Maryland — 6%', rate: 0.06 },
];

/** Cart pricing & financing calculator (MP Assistant → Sell → Financing). */
const MpFinance: React.FC = () => {
  const [params] = useSearchParams();
  const initBrand = (BRANDS.find((b) => b.id === params.get('brand'))?.id || 'evolution') as Brand;
  const [brand, setBrand] = useState<Brand>(initBrand);
  const [cartTitle] = useState(params.get('title') || '');
  const [price, setPrice] = useState(params.get('price') || '');
  const [condition, setCondition] = useState<Condition>((params.get('condition') as Condition) || (initBrand === 'other' ? 'used' : 'new'));
  const [evoModel, setEvoModel] = useState<EvoModel>('other');
  const [accessories, setAccessories] = useState('');
  const [prepOverride, setPrepOverride] = useState<string | null>(null);
  const [mode, setMode] = useState<'pickup' | 'delivery'>('pickup');
  const [storeId, setStoreId] = useState(STORES.find((s) => s.id === 'T1')?.id || STORES[0]?.id || 'other');
  const [otherZip, setOtherZip] = useState('');
  const [dest, setDest] = useState('');
  const [driveOverride, setDriveOverride] = useState('');
  const [feeOverride, setFeeOverride] = useState('');
  const [military, setMilitary] = useState(false);
  const [taxManual, setTaxManual] = useState<string | null>(null);
  const [down, setDown] = useState('');
  const [termFilter, setTermFilter] = useState<number | 'all'>('all');
  const [showTiers, setShowTiers] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [zipsReady, setZipsReady] = useState(false);
  const [zipError, setZipError] = useState('');
  const [busyPdf, setBusyPdf] = useState(false);

  useEffect(() => {
    loadZips().then(() => setZipsReady(true)).catch((e) => setZipError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Brand change → default condition (Used for "Other brands & used"); condition/model change → prep fee back to the rule.
  const pickBrand = (b: Brand) => { setBrand(b); setCondition(b === 'other' ? 'used' : 'new'); setPrepOverride(null); setTermFilter('all'); };
  const ruleprep = prepFeeFor(condition, brand, evoModel);
  const prepFee = prepOverride === null ? ruleprep : num(prepOverride);

  // Locations
  const store = STORES.find((s) => s.id === storeId);
  const storeZip = storeId === 'other' ? otherZip.trim() : store?.zip || '';
  const storePlace: Place | null = zipsReady && /^\d{5}$/.test(storeZip) ? findPlace(storeZip) : null;
  const destPlace: Place | null = zipsReady && mode === 'delivery' ? findPlace(dest) : null;
  const suggestions = useMemo(() => (zipsReady ? suggestPlaces(dest) : []), [zipsReady, dest]);

  // Drive time + delivery fee
  const estimate = mode === 'delivery' && storePlace && destPlace ? estimateDriveMinutes(storePlace, destPlace) : null;
  const typedDrive = parseMinutes(driveOverride);
  const driveMinutes = mode === 'delivery' ? (typedDrive ?? estimate) : null;
  const fee = deliveryFee(driveMinutes);
  const delivery = mode === 'delivery' ? (feeOverride.trim() ? num(feeOverride) : fee.fee) : 0;
  // A new store or destination drops the typed drive time / fee.
  const locKey = `${mode}|${storeZip}|${destPlace?.label || ''}`;
  useEffect(() => { setDriveOverride(''); setFeeOverride(''); setTaxManual(null); }, [locKey]);

  // Tax: store for pickup, destination for delivery
  const taxPlace = mode === 'pickup' ? storePlace : destPlace;
  const autoRate = taxPlace ? taxRateFor(taxPlace.state, taxPlace.county) : null;
  const taxRate = taxManual !== null ? num(taxManual) / 100 : autoRate ?? 0;
  const taxMissing = taxManual === null && autoRate === null && !!taxPlace;

  const otd = computeOtd({
    cartPrice: num(price), accessories: num(accessories), prepFee, deliveryFee: delivery, military, taxRate, downPayment: num(down),
  });
  const canFinance = num(price) > 0 && otd.loanAmount > 0;
  const results = useMemo(() => buildResults(brand, Math.max(otd.loanAmount, 0), condition, termFilter), [brand, otd.loanAmount, condition, termFilter]);
  const terms = termsFor(brand);

  const pdf = async () => {
    setBusyPdf(true);
    try {
      const name = await downloadCustomerSheet({
        brand: brandLabel(brand), otd, downPayment: num(down), cartPrice: num(price), accessories: num(accessories), prepFee,
        deliveryFee: delivery, rows: customerSheetRows(results), showRoadrunner: !!results.roadrunner, cartTitle: cartTitle || undefined,
      });
      notify(`Customer sheet ready: ${name}`, 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusyPdf(false);
    }
  };

  // ---- result rows ----
  const Row: React.FC<{ q: Quote; label?: React.ReactNode }> = ({ q, label }) => {
    const id = q.option.id;
    const isOpen = open === id;
    const off = !!q.unavailable;
    return (
      <Box sx={{ borderBottom: 1, borderColor: 'divider', opacity: off ? 0.5 : 1 }}>
        <Box onClick={() => !off && setOpen(isOpen ? null : id)}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, px: 1, cursor: off ? 'default' : 'pointer', '&:hover': off ? undefined : { bgcolor: 'action.hover' } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{label || rateLabel(q.option)} · {q.option.term} mo</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
              {q.option.tiers && <Chip size="small" variant="outlined" label={`Tiers ${q.option.tiers}`} />}
              {q.option.feePct > 0 && <Chip size="small" variant="outlined" label={`${+(q.option.feePct * 100).toFixed(2)}% program fee`} />}
              {q.option.note && <Chip size="small" variant="outlined" label={q.option.note} />}
              {off && <Chip size="small" color="default" label={q.unavailable} />}
            </Box>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ fontWeight: 800, color: 'primary.main' }}>{off ? '—' : `${money(q.payment)}/mo`}</Typography>
            {!off && <Typography variant="caption" color="text.secondary">Total {money(q.totalOfPayments)}</Typography>}
          </Box>
          {!off && (isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />)}
        </Box>
        <Collapse in={isOpen} unmountOnExit>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(5, 1fr)' }, gap: 1, px: 1, pb: 1.5 }}>
            {([['Program fee', q.programFee], ['Origination fee', q.option.orig], ['Amount financed', q.amountFinanced], ['Total of payments', q.totalOfPayments], ['Total fees & interest', q.totalFeesAndInterest]] as Array<[string, number]>).map(([l, v]) => (
              <Box key={l}><Typography variant="caption" color="text.secondary">{l}</Typography><Typography variant="body2" sx={{ fontWeight: 600 }}>{money(v)}</Typography></Box>
            ))}
          </Box>
        </Collapse>
      </Box>
    );
  };
  const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <Paper variant="outlined" sx={{ mb: 2 }}>
      <Typography sx={{ fontWeight: 700, px: 1.5, py: 1, bgcolor: 'action.hover' }}>{title}</Typography>
      {children}
    </Paper>
  );
  const tierA = results.grid.filter((q) => q.option.tier === 'A');
  const gridQuote = (t: string, term: number) => results.grid.find((q) => q.option.tier === t && q.option.term === term);
  const openGrid = results.grid.find((q) => q.option.id === open && q.option.tier !== 'A');

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Calculate color="primary" />
        <Typography variant="h5" color="primary" sx={{ fontWeight: 700, flexGrow: 1 }}>Financing calculator</Typography>
        <Button variant="contained" startIcon={busyPdf ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdf />} disabled={!canFinance || busyPdf} onClick={pdf}>
          Customer sheet (PDF)
        </Button>
      </Box>
      {cartTitle && <Alert severity="info" sx={{ mb: 2 }}>{cartTitle}</Alert>}
      {zipError && <Alert severity="warning" sx={{ mb: 2 }}>Could not load the ZIP code table ({zipError}). Type the drive time and tax rate by hand.</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '420px 1fr' }, gap: 2, alignItems: 'start' }}>
        {/* ---------------- Inputs ---------------- */}
        <Paper sx={{ p: 2 }}>
          <Typography sx={{ fontWeight: 700, mb: 1.5 }}>Out-the-door price</Typography>
          <Stack spacing={1.75}>
            <TextField select size="small" label="Brand" value={brand} onChange={(e) => pickBrand(e.target.value as Brand)}>
              {BRANDS.map((b) => <MenuItem key={b.id} value={b.id}>{b.label}</MenuItem>)}
            </TextField>
            <TextField size="small" label="Cart price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal"
              slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }} />
            <ToggleButtonGroup size="small" exclusive fullWidth value={condition} onChange={(_e, v) => { if (v) { setCondition(v); setPrepOverride(null); } }}>
              <ToggleButton value="new">New</ToggleButton>
              <ToggleButton value="used">Used</ToggleButton>
            </ToggleButtonGroup>
            {brand === 'evolution' && condition === 'new' && (
              <TextField select size="small" label="Evolution model" value={evoModel} onChange={(e) => { setEvoModel(e.target.value as EvoModel); setPrepOverride(null); }}>
                <MenuItem value="other">Other Evolution</MenuItem>
                <MenuItem value="dmax">XT4, XT6, GT4, GT6</MenuItem>
              </TextField>
            )}
            <TextField size="small" label="Accessories & add-ons" value={accessories} onChange={(e) => setAccessories(e.target.value)} inputMode="decimal"
              slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }} />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" fullWidth label="Dealer prep fee" value={prepOverride ?? String(ruleprep)} onChange={(e) => setPrepOverride(e.target.value)} inputMode="decimal"
                helperText={prepOverride !== null ? `Rule: ${money(ruleprep)}` : condition === 'used' ? 'Used carts: $0' : brand === 'evolution' && evoModel === 'dmax' ? 'D-Max models: $975' : 'New carts: $600'}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }} />
              {prepOverride !== null && <Button size="small" startIcon={<RestartAlt />} onClick={() => setPrepOverride(null)}>Reset</Button>}
            </Box>

            <Divider />
            <ToggleButtonGroup size="small" exclusive fullWidth value={mode} onChange={(_e, v) => v && setMode(v)}>
              <ToggleButton value="pickup">Pickup</ToggleButton>
              <ToggleButton value="delivery">Delivery</ToggleButton>
            </ToggleButtonGroup>
            <TextField select size="small" label={mode === 'pickup' ? 'Pickup store' : 'Delivering store'} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {STORES.map((s) => <MenuItem key={s.id} value={s.id}>{s.name} {s.zip}</MenuItem>)}
              <MenuItem value="other">Other store (type ZIP)</MenuItem>
            </TextField>
            {storeId === 'other' && <TextField size="small" label="Store ZIP" value={otherZip} onChange={(e) => setOtherZip(e.target.value)} inputMode="numeric" />}
            {mode === 'delivery' && (
              <>
                <Autocomplete freeSolo size="small" options={suggestions.map((s) => s.label)} inputValue={dest} filterOptions={(x) => x}
                  onInputChange={(_e, v) => setDest(v)}
                  renderInput={(p) => (
                    <TextField {...p} label="Destination (ZIP or City, ST)"
                      helperText={!zipsReady ? 'Loading ZIP codes…' : destPlace ? `${destPlace.label}${destPlace.county ? ` · ${destPlace.county}` : ''}` : dest.trim() ? 'Not found — type a 5-digit ZIP or "City, ST"' : ' '} />
                  )} />
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <TextField size="small" fullWidth label="Drive time" value={driveOverride} placeholder={estimate ? fmtDuration(estimate) : 'e.g. 1:45'}
                    onChange={(e) => setDriveOverride(e.target.value)}
                    helperText={typedDrive !== null ? 'Using the time you entered' : estimate ? `Estimated ${fmtDuration(estimate)} — check Google Maps for long or rural trips` : 'Pick a destination, or type the Google Maps time'} />
                  {typedDrive !== null && estimate !== null && <Button size="small" sx={{ mt: 0.5, whiteSpace: 'nowrap' }} onClick={() => setDriveOverride('')}>Use estimate</Button>}
                </Box>
                <TextField size="small" label="Delivery fee" value={feeOverride || String(fee.fee)} onChange={(e) => setFeeOverride(e.target.value)} inputMode="decimal"
                  helperText={feeOverride ? `Calculated: ${money(fee.fee)}` : fee.explain || ' '}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }} />
              </>
            )}
            <FormControlLabel control={<Checkbox checked={military} onChange={(e) => setMilitary(e.target.checked)} />} label="Military discount (−$200)" />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField size="small" label="Sales tax %" sx={{ width: 140 }} value={taxManual ?? (autoRate === null ? '' : String(+(autoRate * 100).toFixed(3)))}
                onChange={(e) => setTaxManual(e.target.value)} inputMode="decimal" error={taxMissing} />
              <TextField select size="small" fullWidth label="Tax location" value=""
                onChange={(e) => { const p = TAX_PRESETS.find((x) => x.id === e.target.value); if (p) setTaxManual(String(+(p.rate * 100).toFixed(3))); }}
                helperText={taxManual !== null ? 'Set by hand' : taxPlace ? `${taxPlace.county ? `${taxPlace.county}, ` : ''}${taxPlace.state}${taxMissing ? ' — enter the rate' : ''}` : ' '}>
                {TAX_PRESETS.map((p) => <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>)}
              </TextField>
            </Box>
            <TextField size="small" label="Down payment" value={down} onChange={(e) => setDown(e.target.value)} inputMode="decimal"
              slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }} />
          </Stack>

          <Table size="small" sx={{ mt: 2 }}>
            <TableBody>
              {([
                ['Cart price', num(price)], ['Accessories', num(accessories)], ['Dealer prep fee', prepFee], ['Delivery', delivery],
                ...(military ? [['Military discount', -200]] : []), ['Taxable amount', otd.taxable], [`Sales tax (${+(taxRate * 100).toFixed(3)}%)`, otd.salesTax],
              ] as Array<[string, number]>).map(([l, v]) => (
                <TableRow key={l}><TableCell sx={{ border: 0, py: 0.25 }}>{l}</TableCell><TableCell align="right" sx={{ border: 0, py: 0.25 }}>{money(v)}</TableCell></TableRow>
              ))}
              <TableRow><TableCell sx={{ fontWeight: 800 }}>Out-the-door price</TableCell><TableCell align="right" sx={{ fontWeight: 800 }}>{money(otd.otd)}</TableCell></TableRow>
              {num(down) > 0 && <TableRow><TableCell sx={{ border: 0, py: 0.25 }}>Down payment</TableCell><TableCell align="right" sx={{ border: 0, py: 0.25 }}>−{money(num(down))}</TableCell></TableRow>}
              <TableRow><TableCell sx={{ fontWeight: 800, color: 'primary.main' }}>Loan amount</TableCell><TableCell align="right" sx={{ fontWeight: 800, color: 'primary.main' }}>{money(Math.max(otd.loanAmount, 0))}</TableCell></TableRow>
            </TableBody>
          </Table>
        </Paper>

        {/* ---------------- Results ---------------- */}
        <Box>
          {!num(price) ? (
            <Alert severity="info">Enter the cart price to see every financing option for {brandLabel(brand)}.</Alert>
          ) : !canFinance ? (
            <Alert severity="success">The down payment covers the out-the-door price — nothing to finance.</Alert>
          ) : (
            <>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
                <Typography variant="body2" color="text.secondary">Term:</Typography>
                <Box sx={{ overflowX: 'auto', maxWidth: '100%' }}>
                  <ToggleButtonGroup size="small" exclusive value={termFilter} onChange={(_e, v) => v !== null && setTermFilter(v)} sx={{ '& .MuiToggleButton-root': { whiteSpace: 'nowrap' } }}>
                    <ToggleButton value="all">All</ToggleButton>
                    {terms.map((t) => <ToggleButton key={t} value={t}>{t} mo</ToggleButton>)}
                  </ToggleButtonGroup>
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
                {([['Lowest monthly payment', results.lowestPayment, 'payment'], ['Lowest total fees & interest', results.lowestCost, 'cost']] as Array<[string, Quote | undefined, string]>).map(([title, q, k]) => (
                  <Paper key={k} variant="outlined" sx={{ p: 2, borderColor: 'primary.main' }}>
                    <Typography variant="body2" color="text.secondary">{title}</Typography>
                    {q ? <>
                      <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main' }}>{k === 'payment' ? `${money(q.payment)}/mo` : money(q.totalFeesAndInterest)}</Typography>
                      <Typography variant="body2">{LENDER_LABEL[q.option.lender]} · {rateLabel(q.option)} · {q.option.term} mo{q.option.tier ? ` · Tier ${q.option.tier}` : ''}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {k === 'payment' ? `Fees & interest ${money(q.totalFeesAndInterest)}` : `${money(q.payment)}/mo`} · total {money(q.totalOfPayments)}
                      </Typography>
                    </> : <Typography>—</Typography>}
                  </Paper>
                ))}
              </Box>

              {(results.promos.length > 0 || results.grid.length > 0) && (
                <Group title="Sheffield Financial">
                  {results.promos.map((q) => <Row key={q.option.id} q={q} />)}
                  {tierA.map((q) => <Row key={q.option.id} q={q} label={`Standard rate ${rateLabel(q.option)} (Tier A)`} />)}
                  {results.grid.length > 0 && (
                    <Box sx={{ p: 1 }}>
                      <Button size="small" onClick={() => setShowTiers((v) => !v)} endIcon={showTiers ? <ExpandLess /> : <ExpandMore />}>
                        {showTiers ? 'Hide Tiers B to E' : 'Show Tiers B to E'}
                      </Button>
                      <Collapse in={showTiers}>
                        <Box sx={{ overflowX: 'auto' }}>
                          <Table size="small">
                            <TableHead><TableRow><TableCell>Tier</TableCell>{Array.from(new Set(results.grid.map((q) => q.option.term))).map((t) => <TableCell key={t} align="right">{t} mo</TableCell>)}</TableRow></TableHead>
                            <TableBody>
                              {TIERS.filter((t) => t !== 'A').map((t) => (
                                <TableRow key={t}>
                                  <TableCell sx={{ fontWeight: 700 }}>{t}</TableCell>
                                  {Array.from(new Set(results.grid.map((q) => q.option.term))).map((term) => {
                                    const q = gridQuote(t, term);
                                    return (
                                      <TableCell key={term} align="right" onClick={() => q && setOpen(open === q.option.id ? null : q.option.id)}
                                        sx={{ cursor: 'pointer', bgcolor: q && open === q.option.id ? 'action.selected' : undefined }}>
                                        {q ? <><b>{money(q.payment)}</b><br /><Typography variant="caption" color="text.secondary">{rateLabel(q.option)}</Typography></> : '—'}
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          {openGrid && (
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              Tier {openGrid.option.tier} · {rateLabel(openGrid.option)} · {openGrid.option.term} mo — amount financed {money(openGrid.amountFinanced)} (origination {money(openGrid.option.orig)}),
                              total of payments {money(openGrid.totalOfPayments)}, fees & interest {money(openGrid.totalFeesAndInterest)}.
                            </Typography>
                          )}
                        </Box>
                      </Collapse>
                    </Box>
                  )}
                </Group>
              )}
              {results.dealerDirect.length > 0 && <Group title="Dealer Direct">{results.dealerDirect.map((q) => <Row key={q.option.id} q={q} />)}</Group>}
              {results.noFrills.length > 0 && <Group title="Dealer Direct No Frills">{results.noFrills.map((q) => <Row key={q.option.id} q={q} />)}</Group>}
              {results.dll.length > 0 && <Group title="DLL Financing (any year cart)">{results.dll.map((q) => <Row key={q.option.id} q={q} />)}</Group>}
              {results.roadrunner && <Alert severity="info" icon={false} sx={{ mb: 2 }}><b>Building credit?</b> {results.roadrunner}</Alert>}
              <Typography variant="caption" color="text.secondary">
                Estimates only — the lender sets the final rate after a credit review. Tap any option for the program fee, origination fee and totals.
              </Typography>
            </>
          )}
        </Box>
      </Box>
    </MpShell>
  );
};

export default MpFinance;
