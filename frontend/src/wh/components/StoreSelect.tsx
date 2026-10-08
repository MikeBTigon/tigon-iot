import React from 'react';
import { MenuItem, TextField } from '@mui/material';
import { DEALERSHIPS } from '../../mp/constants';

/** Which store's salespeople get this website's leads (used by lead assignment). */
const StoreSelect: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <TextField select label="Store for these leads" value={value} onChange={(e) => onChange(e.target.value)}
    helperText="Leads from this website go to this store's salespeople. Leave on 'No store' to keep the lead owner from settings.">
    <MenuItem value="">No store</MenuItem>
    {DEALERSHIPS.filter((d) => d.id !== 'T0').map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
  </TextField>
);

export default StoreSelect;
