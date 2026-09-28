import React, { useMemo, useState } from 'react';
import { Box, Button, Collapse, InputAdornment, Paper, Slider, TextField, Typography } from '@mui/material';
import { ExpandLess, ExpandMore, Search } from '@mui/icons-material';
import MpShell from '../components/MpShell';
import CartGrid from '../components/CartGrid';
import ChipFilter from '../components/ChipFilter';
import { TRI, dynamicOptions, triMatch, type Tri } from '../filterUtils';
import { useMp } from '../MpDataContext';
import { formatPrice, masterSort, matchesSearch, workingPhotos } from '../cartUtils';
import { isLithium } from '../cartLogic';
import { LOCATION_ORDER, locationName } from '../constants';

const PRICE_PRESETS = [
  { label: 'Any', range: null },
  { label: 'Under $5k', range: [0, 5000] },
  { label: '$5k–$8k', range: [5000, 8000] },
  { label: '$8k–$12k', range: [8000, 12000] },
  { label: '$12k+', range: [12000, Infinity] },
] as const;

interface Filters {
  q: string;
  price: [number, number] | null;
  make: string;
  model: string;
  condition: 'any' | 'used' | 'new';
  power: 'any' | 'electric' | 'gas';
  passengers: 'any' | '2' | '4' | '6';
  location: string;
  lifted: Tri;
  streetLegal: Tri;
  battery: 'any' | 'lithium' | 'lead';
  color: string;
  roof: Tri;
  sound: Tri;
  hitch: Tri;
  drive: string;
  tire: string;
  photos: Tri;
}

const DEFAULTS: Filters = {
  q: '', price: null, make: 'any', model: 'any', condition: 'any', power: 'any', passengers: 'any', location: 'any',
  lifted: 'any', streetLegal: 'any', battery: 'any', color: 'any', roof: 'any', sound: 'any', hitch: 'any',
  drive: 'any', tire: 'any', photos: 'any',
};

const MpFind: React.FC = () => {
  const { carts, brokenPhotos } = useMp();
  const [f, setF] = useState<Filters>(DEFAULTS);
  const [more, setMore] = useState(false);
  const set = <K extends keyof Filters>(k: K) => (v: Filters[K]) => setF((p) => ({ ...p, [k]: v }));

  const live = useMemo(() => carts.filter((c) => !c.flaggedDelete), [carts]);
  const maxPrice = useMemo(() => Math.max(1000, ...live.map((c) => c.price)), [live]);
  const makeOpts = useMemo(() => dynamicOptions(live.map((c) => c.make)), [live]);
  const modelOpts = useMemo(
    () => dynamicOptions(live.filter((c) => f.make === 'any' || c.make.toLowerCase() === f.make).map((c) => c.model)),
    [live, f.make],
  );
  const colorOpts = useMemo(() => dynamicOptions(live.map((c) => c.color)), [live]);
  const driveOpts = useMemo(() => dynamicOptions(live.map((c) => c.driveTrain)), [live]);
  const tireOpts = useMemo(() => dynamicOptions(live.map((c) => c.tireType)), [live]);
  const locOpts = useMemo(() => {
    const present = new Set(live.map((c) => c.locationId));
    return [{ value: 'any', label: 'Any' }, ...LOCATION_ORDER.filter((l) => present.has(l)).map((l) => ({ value: l, label: `${l} ${locationName(l) !== l ? locationName(l) : ''}`.trim() }))];
  }, [live]);

  const results = useMemo(() => {
    const eq = (sel: string, v: string) => sel === 'any' || v.trim().toLowerCase() === sel;
    return masterSort(
      live.filter((c) => {
        if (f.price && (c.price < f.price[0] || c.price > f.price[1])) return false;
        if (!eq(f.make, c.make) || !eq(f.model, c.model)) return false;
        if (f.condition !== 'any' && (f.condition === 'used') !== c.isUsed) return false;
        if (f.power !== 'any' && (f.power === 'electric') !== c.isElectric) return false;
        if (f.passengers !== 'any') {
          const want = parseInt(f.passengers, 10);
          if (want === 6 ? c.passengers < 6 : c.passengers !== want) return false;
        }
        if (f.location !== 'any' && c.locationId !== f.location) return false;
        if (!triMatch(f.lifted, c.isLifted) || !triMatch(f.streetLegal, c.isStreetLegal)) return false;
        if (f.battery !== 'any' && (!c.isElectric || (f.battery === 'lithium') !== isLithium(c.batteryType))) return false;
        if (!eq(f.color, c.color) || !eq(f.drive, c.driveTrain) || !eq(f.tire, c.tireType)) return false;
        if (!triMatch(f.roof, c.hasExtendedTop) || !triMatch(f.sound, c.hasSoundSystem) || !triMatch(f.hitch, c.hasHitch)) return false;
        if (!triMatch(f.photos, workingPhotos(c, brokenPhotos).length > 0)) return false;
        return matchesSearch(c, f.q);
      }),
      brokenPhotos,
    );
  }, [live, f, brokenPhotos]);

  const presetLabel = PRICE_PRESETS.find((p) => (p.range === null ? f.price === null : f.price && p.range[0] === f.price[0] && p.range[1] === f.price[1]))?.label || '';

  return (
    <MpShell>
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search make, model, color, serial number, location…"
          value={f.q}
          onChange={(e) => set('q')(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
          sx={{ mb: 2 }}
        />
        <ChipFilter
          label="Price"
          value={presetLabel || 'custom'}
          options={[...PRICE_PRESETS.map((p) => ({ value: p.label, label: p.label })), ...(presetLabel ? [] : [{ value: 'custom', label: 'Custom' }])]}
          onChange={(v) => set('price')((PRICE_PRESETS.find((p) => p.label === v)?.range as [number, number] | null) ?? null)}
        />
        <Box sx={{ px: 1, mb: 1.5, maxWidth: 480 }}>
          <Slider
            value={f.price ? [f.price[0], Math.min(f.price[1], maxPrice)] : [0, maxPrice]}
            min={0}
            max={maxPrice}
            step={250}
            onChange={(_, v) => set('price')(v as [number, number])}
            valueLabelDisplay="auto"
            valueLabelFormat={formatPrice}
          />
        </Box>
        <ChipFilter label="Brand" value={f.make} options={makeOpts} onChange={(v) => setF((p) => ({ ...p, make: v, model: 'any' }))} />
        {f.make !== 'any' && <ChipFilter label="Model" value={f.model} options={modelOpts} onChange={set('model')} />}
        <ChipFilter label="Condition" value={f.condition} options={[{ value: 'any', label: 'Any' }, { value: 'used', label: 'Used' }, { value: 'new', label: 'New' }]} onChange={set('condition')} />
        <ChipFilter label="Power" value={f.power} options={[{ value: 'any', label: 'Any' }, { value: 'electric', label: 'Electric' }, { value: 'gas', label: 'Gas' }]} onChange={set('power')} />
        <ChipFilter label="Passengers" value={f.passengers} options={[{ value: 'any', label: 'Any' }, { value: '2', label: '2' }, { value: '4', label: '4' }, { value: '6', label: '6+' }]} onChange={set('passengers')} />
        <ChipFilter label="Location" value={f.location} options={locOpts} onChange={set('location')} />

        <Button size="small" onClick={() => setMore((m) => !m)} endIcon={more ? <ExpandLess /> : <ExpandMore />}>
          More filters
        </Button>
        <Collapse in={more}>
          <Box sx={{ pt: 1.5 }}>
            <ChipFilter label="Lifted" value={f.lifted} options={[...TRI]} onChange={set('lifted')} />
            <ChipFilter label="Street legal" value={f.streetLegal} options={[...TRI]} onChange={set('streetLegal')} />
            <ChipFilter label="Battery type" value={f.battery} options={[{ value: 'any', label: 'Any' }, { value: 'lithium', label: 'Lithium' }, { value: 'lead', label: 'Lead acid' }]} onChange={set('battery')} />
            <ChipFilter label="Cart color" value={f.color} options={colorOpts} onChange={set('color')} />
            <ChipFilter label="Extended roof" value={f.roof} options={[...TRI]} onChange={set('roof')} />
            <ChipFilter label="Sound system" value={f.sound} options={[...TRI]} onChange={set('sound')} />
            <ChipFilter label="Hitch" value={f.hitch} options={[...TRI]} onChange={set('hitch')} />
            <ChipFilter label="Drivetrain" value={f.drive} options={driveOpts} onChange={set('drive')} />
            <ChipFilter label="Tire type" value={f.tire} options={tireOpts} onChange={set('tire')} />
            <ChipFilter label="Has photos" value={f.photos} options={[...TRI]} onChange={set('photos')} />
          </Box>
        </Collapse>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
          <Typography variant="body2" color="text.secondary">{results.length} match{results.length === 1 ? '' : 'es'}</Typography>
          <Button size="small" color="secondary" onClick={() => setF(DEFAULTS)}>Clear all filters</Button>
        </Box>
      </Paper>
      <CartGrid carts={results} />
    </MpShell>
  );
};

export default MpFind;
