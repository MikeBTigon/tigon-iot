// Track 3 — admin settings: pre-qualification lenders, quote links, trade-in values, booking hours and texts.
import React, { useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, FormControlLabel, IconButton, InputAdornment, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { notify } from '../../../ui/notify';
import { saveSalesSection, useSalesSettings } from '../salesData';
import { DEFAULT_SALES_SETTINGS } from '../salesDefaults';
import type { DayHours, SalesSettings, WeekDay } from '../salesTypes';

const WEEK: Array<[WeekDay, string]> = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const n = (s: string, min: number, max: number, fallback: number) => {
  const v = Number(String(s).replace(/[$,%\s]/g, ''));
  return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback;
};

function useSaver<K extends keyof SalesSettings>(key: K) {
  const [busy, setBusy] = useState(false);
  const save = async (value: SalesSettings[K]) => {
    setBusy(true);
    try {
      await saveSalesSection(key, value);
      notify('Saved', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

const Section: React.FC<{ title: string; help: string; enabled?: boolean; onEnabled?: (v: boolean) => void; children: React.ReactNode; onSave: () => void; busy: boolean }> = ({
  title, help, enabled, onEnabled, children, onSave, busy,
}) => (
  <Card variant="outlined">
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>{title}</Typography>
        {onEnabled && <FormControlLabel control={<Switch checked={!!enabled} onChange={(e) => onEnabled(e.target.checked)} />} label={enabled ? 'On' : 'Off'} />}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{help}</Typography>
      <Stack spacing={2}>{children}</Stack>
      <Button variant="contained" sx={{ mt: 2 }} onClick={onSave} disabled={busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>Save</Button>
    </CardContent>
  </Card>
);

const PrequalSection: React.FC<{ initial: SalesSettings['prequal'] }> = ({ initial }) => {
  const [v, setV] = useState(initial);
  const { busy, save } = useSaver('prequal');
  const setLender = (i: number, patch: Partial<SalesSettings['prequal']['lenders'][number]>) =>
    setV({ ...v, lenders: v.lenders.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const bad = v.lenders.some((l) => l.url && !/^https:\/\//i.test(l.url));
  return (
    <Section title="Pre-qualification" busy={busy} enabled={v.enabled} onEnabled={(e) => setV({ ...v, enabled: e })}
      help="Customers fill a short form, then see these lenders. Paste each lender's soft-pull (pre-qualify) link. Lenders without a link show 'Ask your salesperson'."
      onSave={() => (bad ? notify('Links must start with https://', 'error') : save({ ...v, lenders: v.lenders.filter((l) => l.name.trim()).map((l) => ({ name: l.name.trim(), url: l.url.trim(), ...(l.note?.trim() ? { note: l.note.trim() } : {}) })) }))}>
      <TextField label="Intro text" value={v.intro} onChange={(e) => setV({ ...v, intro: e.target.value })} multiline minRows={2} />
      {v.lenders.map((l, i) => (
        <Box key={i} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr auto', sm: '1fr 2fr 2fr auto' }, gap: 1, alignItems: 'center' }}>
          <TextField size="small" label="Lender" value={l.name} onChange={(e) => setLender(i, { name: e.target.value })} />
          <TextField size="small" label="Soft-pull link (https://…)" value={l.url} onChange={(e) => setLender(i, { url: e.target.value })} error={!!l.url && !/^https:\/\//i.test(l.url)} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, order: { xs: 3, sm: 0 } }} />
          <TextField size="small" label="Note (optional)" value={l.note || ''} onChange={(e) => setLender(i, { note: e.target.value })} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, order: { xs: 4, sm: 0 } }} />
          <IconButton aria-label="Remove lender" onClick={() => setV({ ...v, lenders: v.lenders.filter((_l, j) => j !== i) })}><Delete /></IconButton>
        </Box>
      ))}
      <Box><Button startIcon={<Add />} onClick={() => setV({ ...v, lenders: [...v.lenders, { name: '', url: '' }] })}>Add lender</Button></Box>
    </Section>
  );
};

const QuotesSection: React.FC<{ initial: SalesSettings['quotes'] }> = ({ initial }) => {
  const [v, setV] = useState(initial);
  const [days, setDays] = useState(String(initial.expireDays));
  const { busy, save } = useSaver('quotes');
  return (
    <Section title="Quote links" busy={busy} enabled={v.enabled} onEnabled={(e) => setV({ ...v, enabled: e })}
      help='"Send quote" in the Financing calculator texts the customer a page with the price and payments. The salesperson gets a notification when they open it.'
      onSave={() => save({ ...v, expireDays: Math.round(n(days, 1, 365, 30)) })}>
      <TextField size="small" label="Quote good for" value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" sx={{ maxWidth: 200 }}
        slotProps={{ input: { endAdornment: <InputAdornment position="end">days</InputAdornment> } }} />
    </Section>
  );
};

const CONDITIONS: Array<[keyof SalesSettings['tradeIn']['conditionFactor'], string]> = [['excellent', 'Excellent'], ['good', 'Good'], ['fair', 'Fair'], ['poor', 'Needs work']];

const TradeSection: React.FC<{ initial: SalesSettings['tradeIn'] }> = ({ initial }) => {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [rows, setRows] = useState<Array<{ brand: string; value: string }>>(() => Object.entries(initial.baseValues).map(([brand, value]) => ({ brand, value: String(value) })));
  const [drop, setDrop] = useState(String(initial.yearlyDropPct));
  const [range, setRange] = useState(String(initial.rangePct));
  const [factors, setFactors] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial.conditionFactor).map(([k, f]) => [k, String(f)])));
  const { busy, save } = useSaver('tradeIn');
  const submit = () => {
    const baseValues: Record<string, number> = {};
    for (const r of rows) if (r.brand.trim()) baseValues[r.brand.trim().toLowerCase()] = Math.round(n(r.value, 0, 100000, 0));
    if (!baseValues._default) baseValues._default = DEFAULT_SALES_SETTINGS.tradeIn.baseValues._default;
    const d = DEFAULT_SALES_SETTINGS.tradeIn.conditionFactor;
    void save({
      enabled, baseValues, yearlyDropPct: n(drop, 0, 60, 12), rangePct: n(range, 0, 50, 12),
      conditionFactor: { excellent: n(factors.excellent, 0, 3, d.excellent), good: n(factors.good, 0, 3, d.good), fair: n(factors.fair, 0, 3, d.fair), poor: n(factors.poor, 0, 3, d.poor) },
    });
  };
  return (
    <Section title="Trade-in estimates" busy={busy} enabled={enabled} onEnabled={setEnabled} onSave={submit}
      help="Estimate = brand value (1-year-old cart, good condition) × (1 − yearly drop) for each extra year × condition. Lifted +$400, electric batteries over 5 years old −$800, never under $500. Customers see a range.">
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Value of a 1-year-old cart, by brand</Typography>
        <Stack spacing={1}>
          {rows.map((r, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" label="Brand" value={r.brand === '_default' ? 'Any other brand' : r.brand} disabled={r.brand === '_default'} sx={{ flex: 1 }}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, brand: e.target.value } : x)))} />
              <TextField size="small" label="Value" value={r.value} inputMode="numeric" sx={{ width: 140 }}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }} />
              <IconButton aria-label="Remove brand" disabled={r.brand === '_default'} onClick={() => setRows(rows.filter((_x, j) => j !== i))}><Delete /></IconButton>
            </Box>
          ))}
        </Stack>
        <Button startIcon={<Add />} sx={{ mt: 1 }} onClick={() => setRows([...rows, { brand: '', value: '' }])}>Add brand</Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField size="small" label="Value drop per year" value={drop} onChange={(e) => setDrop(e.target.value)} sx={{ width: 180 }}
          slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }} />
        <TextField size="small" label="Range shown (±)" value={range} onChange={(e) => setRange(e.target.value)} sx={{ width: 180 }}
          slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }} />
      </Box>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Condition (1 = full value, 0.8 = 80%)</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {CONDITIONS.map(([k, l]) => (
            <TextField key={k} size="small" label={l} value={factors[k] ?? ''} onChange={(e) => setFactors({ ...factors, [k]: e.target.value })} sx={{ width: 120 }} inputMode="decimal" />
          ))}
        </Box>
      </Box>
    </Section>
  );
};

const BookingSection: React.FC<{ initial: SalesSettings['booking'] }> = ({ initial }) => {
  const [v, setV] = useState(initial);
  const [slot, setSlot] = useState(String(initial.slotMinutes));
  const [per, setPer] = useState(String(initial.perSlot));
  const { busy, save } = useSaver('booking');
  const setDay = (d: WeekDay, h: DayHours) => setV({ ...v, hours: { ...v.hours, [d]: h } });
  const bad = WEEK.some(([d]) => v.hours[d] && v.hours[d]!.open >= v.hours[d]!.close);
  return (
    <Section title="Test-drive booking" busy={busy} enabled={v.enabled} onEnabled={(e) => setV({ ...v, enabled: e })}
      help="Customers pick a time at tigoniot.com/book. They get a reminder text the day before (10 AM) and 2 hours before. No-shows get a text to pick a new time."
      onSave={() => (bad ? notify('Closing time must be after opening time.', 'error') : save({ ...v, slotMinutes: Math.round(n(slot, 10, 240, 30)), perSlot: Math.round(n(per, 1, 20, 2)) }))}>
      <Stack spacing={1}>
        {WEEK.map(([d, label]) => {
          const h = v.hours[d];
          return (
            <Box key={d} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography sx={{ width: 96, fontWeight: 600 }}>{label}</Typography>
              <FormControlLabel sx={{ width: 110 }} control={<Switch checked={!!h} onChange={(e) => setDay(d, e.target.checked ? { open: '09:00', close: '18:00' } : null)} />} label={h ? 'Open' : 'Closed'} />
              {h && <>
                <TextField size="small" type="time" label="Opens" value={h.open} onChange={(e) => setDay(d, { ...h, open: e.target.value })} sx={{ width: 130 }} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField size="small" type="time" label="Closes" value={h.close} onChange={(e) => setDay(d, { ...h, close: e.target.value })} sx={{ width: 130 }} error={h.open >= h.close} slotProps={{ inputLabel: { shrink: true } }} />
              </>}
            </Box>
          );
        })}
      </Stack>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField size="small" label="Each slot" value={slot} onChange={(e) => setSlot(e.target.value)} sx={{ width: 160 }} inputMode="numeric"
          slotProps={{ input: { endAdornment: <InputAdornment position="end">minutes</InputAdornment> } }} />
        <TextField size="small" label="Bookings per slot (per store)" value={per} onChange={(e) => setPer(e.target.value)} sx={{ width: 220 }} inputMode="numeric" />
      </Box>
      <TextField label="Reminder text" value={v.reminderTemplate} onChange={(e) => setV({ ...v, reminderTemplate: e.target.value })} multiline minRows={2}
        helperText="{first} {store} {when} {address} {storePhone} {salesperson} {cart}" />
      <TextField label="No-show text" value={v.noShowTemplate} onChange={(e) => setV({ ...v, noShowTemplate: e.target.value })} multiline minRows={2}
        helperText="{link} = the booking page. Also {first} {store} {storePhone}" />
    </Section>
  );
};

const ClosingSettings: React.FC<object> = () => {
  const { settings, loaded } = useSalesSettings();
  if (!loaded) return <CircularProgress />;
  return (
    <Stack spacing={2}>
      <Alert severity="info">Customer pages: tigoniot.com/prequal, /trade, /book and /q/… (quotes). Text them from any lead with one tap.</Alert>
      <PrequalSection initial={settings.prequal} />
      <QuotesSection initial={settings.quotes} />
      <TradeSection initial={settings.tradeIn} />
      <BookingSection initial={settings.booking} />
    </Stack>
  );
};

export default ClosingSettings;
