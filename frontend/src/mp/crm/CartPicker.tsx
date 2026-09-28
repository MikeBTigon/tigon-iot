import { useEffect } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { useMp } from '../MpDataContext';
import { cartTitle } from '../cartLogic';
import { formatPrice, matchesSearch } from '../cartUtils';
import type { MpCart } from '../types';

export interface CartChoice {
  id: string;
  title: string;
}

/** Search picker over the in-stock inventory. Keeps a linked cart that is no longer in stock. */
export default function CartPicker({ value, onChange, label = 'Cart' }: {
  value: CartChoice | null;
  onChange: (cart: CartChoice | null, full: MpCart | null) => void;
  label?: string;
}) {
  const { carts, ensureCartsLoaded, cartsLoading } = useMp();
  useEffect(() => ensureCartsLoaded(), [ensureCartsLoaded]);

  const options: CartChoice[] = carts.map((c) => ({ id: c.docId, title: `${cartTitle(c)} · ${formatPrice(c.price)} · ${c.serial || c.locationId}` }));
  if (value && !options.some((o) => o.id === value.id)) options.unshift(value);
  const byId = new Map(carts.map((c) => [c.docId, c]));

  return (
    <Autocomplete
      options={options}
      value={value}
      loading={cartsLoading}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      getOptionLabel={(o) => o.title}
      filterOptions={(opts, s) => {
        const q = s.inputValue.trim();
        if (!q) return opts.slice(0, 50);
        return opts
          .filter((o) => {
            const c = byId.get(o.id);
            return c ? matchesSearch(c, q) : o.title.toLowerCase().includes(q.toLowerCase());
          })
          .slice(0, 50);
      }}
      onChange={(_, v) => {
        const full = v ? byId.get(v.id) || null : null;
        onChange(v && full ? { id: v.id, title: cartTitle(full) } : v, full);
      }}
      renderInput={(params) => <TextField {...params} label={label} placeholder="Search make, model, color, serial…" />}
    />
  );
}
