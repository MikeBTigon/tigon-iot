// Track 4 (inventory) — admin settings: price-drop alerts, aged inventory, sold cart → similar carts text.
import React, { useState } from 'react';
import { Box, Button, FormControlLabel, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import { notify } from '../../../ui/notify';
import { saveSalesSection, useSalesSettings } from '../salesData';
import type { SalesSettings } from '../salesTypes';

type Key = 'priceDrop' | 'aged' | 'soldSimilar';

const num = (v: string, min = 0) => Math.max(min, Number(v) || 0);

const InventorySettings: React.FC<object> = () => {
  const { settings, loaded } = useSalesSettings();
  // Unsaved edits per section, on top of the saved settings.
  const [draft, setDraft] = useState<Partial<Pick<SalesSettings, Key>>>({});
  const [saving, setSaving] = useState<Key | ''>('');

  const pd = draft.priceDrop || settings.priceDrop;
  const aged = draft.aged || settings.aged;
  const sold = draft.soldSimilar || settings.soldSimilar;

  const save = async <K extends Key>(key: K, value: SalesSettings[K]) => {
    setSaving(key);
    try {
      await saveSalesSection(key, value);
      setDraft((d) => ({ ...d, [key]: undefined }));
      notify('Saved.', 'success');
    } catch (e) {
      console.error(e);
      notify('Could not save. Only admins can change these settings.', 'error');
    } finally {
      setSaving('');
    }
  };

  if (!loaded) return <Typography color="text.secondary">Loading…</Typography>;

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">Price drop alerts</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          When a cart's price goes down in the DMS, we text the open leads who asked about it, make a to-do for leads
          without a phone, and remind whoever posted it on Facebook to update the price.
        </Typography>
        <FormControlLabel
          control={<Switch checked={pd.enabled} onChange={(e) => setDraft((d) => ({ ...d, priceDrop: { ...pd, enabled: e.target.checked } }))} />}
          label={pd.enabled ? 'On' : 'Off'}
        />
        <TextField
          label="Smallest drop that counts (%)" type="number" size="small" sx={{ display: 'block', my: 1 }}
          value={pd.minDropPct} slotProps={{ htmlInput: { min: 0, step: 0.5 } }}
          onChange={(e) => setDraft((d) => ({ ...d, priceDrop: { ...pd, minDropPct: num(e.target.value) } }))}
        />
        <TextField
          label="Text to the customer" fullWidth multiline minRows={2}
          value={pd.template}
          helperText="You can use {first} {cart} {price} {store} {salesperson} {link} (link = the cart's page)"
          onChange={(e) => setDraft((d) => ({ ...d, priceDrop: { ...pd, template: e.target.value } }))}
        />
        <Box sx={{ mt: 1 }}>
          <Button variant="contained" disabled={!draft.priceDrop || saving === 'priceDrop'} onClick={() => save('priceDrop', pd)}>Save</Button>
        </Box>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">Aged inventory</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Carts on the lot a long time get a flag, move to the top of "Suggested to post", and managers get a list every Monday.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            label="Aged after (days)" type="number" size="small" value={aged.flagDays}
            onChange={(e) => setDraft((d) => ({ ...d, aged: { ...aged, flagDays: num(e.target.value, 1) } }))}
          />
          <TextField
            label="Urgent after (days)" type="number" size="small" value={aged.urgentDays}
            onChange={(e) => setDraft((d) => ({ ...d, aged: { ...aged, urgentDays: num(e.target.value, 1) } }))}
          />
          <TextField
            label="Suggested price cut (%)" type="number" size="small" value={aged.suggestedCutPct}
            onChange={(e) => setDraft((d) => ({ ...d, aged: { ...aged, suggestedCutPct: Math.min(50, num(e.target.value)) } }))}
          />
        </Stack>
        <Box sx={{ mt: 1 }}>
          <Button variant="contained" disabled={!draft.aged || saving === 'aged'} onClick={() => save('aged', aged)}>Save</Button>
        </Box>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">Sold cart → similar carts</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          When a cart sells, open leads who asked about it get a text with a page of similar carts in stock.
          (Whoever posted it on Facebook is always told to mark it sold.)
        </Typography>
        <FormControlLabel
          control={<Switch checked={sold.enabled} onChange={(e) => setDraft((d) => ({ ...d, soldSimilar: { ...sold, enabled: e.target.checked } }))} />}
          label={sold.enabled ? 'On' : 'Off'}
        />
        <TextField
          label="Text to the customer" fullWidth multiline minRows={2} sx={{ mt: 1 }}
          value={sold.template}
          helperText="You can use {first} {cart} {store} {salesperson} {link} (link = the similar carts page)"
          onChange={(e) => setDraft((d) => ({ ...d, soldSimilar: { ...sold, template: e.target.value } }))}
        />
        <Box sx={{ mt: 1 }}>
          <Button variant="contained" disabled={!draft.soldSimilar || saving === 'soldSimilar'} onClick={() => save('soldSimilar', sold)}>Save</Button>
        </Box>
      </Paper>
    </Stack>
  );
};

export default InventorySettings;
