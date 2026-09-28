import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert, Box, Card, CardActionArea, CardContent, Chip, CircularProgress, InputAdornment, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { DirectionsCar, Search } from '@mui/icons-material';
import StorefrontHeader from './StorefrontHeader';
import { fetchStorefront, money, type PublicCart, type StorefrontResponse } from './api';

type Sort = 'featured' | 'price-asc' | 'price-desc';

/** Public storefront grid at /s/:slug (no sign-in). */
const StorefrontPage: React.FC = () => {
  const { slug = 'tigon' } = useParams();
  const [data, setData] = useState<StorefrontResponse | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [cond, setCond] = useState<'all' | 'new' | 'used'>('all');
  const [power, setPower] = useState<'all' | 'electric' | 'gas'>('all');
  const [sort, setSort] = useState<Sort>('featured');

  useEffect(() => {
    let live = true;
    fetchStorefront(slug)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError('');
        document.title = `${d.storefront.title} — Golf carts for sale`;
      })
      .catch((e) => live && setError(e.message === 'not_found' ? 'This storefront doesn\'t exist or isn\'t published.' : 'Could not load carts. Please try again.'));
    return () => {
      live = false;
    };
  }, [slug]);

  const carts = useMemo(() => {
    if (!data) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = data.carts.filter((c) => {
      if (cond !== 'all' && c.isUsed !== (cond === 'used')) return false;
      if (power !== 'all' && c.isElectric !== (power === 'electric')) return false;
      const hay = `${c.year} ${c.title} ${c.location} ${c.passengers} passenger ${c.lifted ? 'lifted' : ''} ${c.streetLegal ? 'street legal lsv' : ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    if (sort === 'price-asc') return [...list].sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
    if (sort === 'price-desc') return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [data, q, cond, power, sort]);

  const sf = data?.storefront || null;
  const showCond = !sf || (sf.showNew && sf.showUsed);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      <StorefrontHeader storefront={sf} slug={slug} />
      <Box component="main" sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: 2 }}>
        {error && <Alert severity="warning">{error}</Alert>}
        {!data && !error && <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress /></Box>}
        {data && (
          <>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
              <TextField
                size="small"
                placeholder="Search make, model, color…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                sx={{ flex: '1 1 220px', bgcolor: '#fff' }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
              />
              {showCond && (
                <ToggleButtonGroup size="small" exclusive value={cond} onChange={(_, v) => v && setCond(v)} sx={{ bgcolor: '#fff' }}>
                  <ToggleButton value="all">All</ToggleButton>
                  <ToggleButton value="new">New</ToggleButton>
                  <ToggleButton value="used">Used</ToggleButton>
                </ToggleButtonGroup>
              )}
              <ToggleButtonGroup size="small" exclusive value={power} onChange={(_, v) => v && setPower(v)} sx={{ bgcolor: '#fff' }}>
                <ToggleButton value="all">Any</ToggleButton>
                <ToggleButton value="electric">Electric</ToggleButton>
                <ToggleButton value="gas">Gas</ToggleButton>
              </ToggleButtonGroup>
              <TextField select size="small" value={sort} onChange={(e) => setSort(e.target.value as Sort)} sx={{ bgcolor: '#fff', minWidth: 170 }}>
                <MenuItem value="featured">Featured</MenuItem>
                <MenuItem value="price-asc">Price: low to high</MenuItem>
                <MenuItem value="price-desc">Price: high to low</MenuItem>
              </TextField>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{carts.length} cart{carts.length === 1 ? '' : 's'} available</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 2 }}>
              {carts.map((c) => <PublicCartCard key={c.id} cart={c} slug={slug} />)}
            </Box>
            {carts.length === 0 && <Alert severity="info">No carts match — try a different search or call us.</Alert>}
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 4, textAlign: 'center' }}>
              Prices and availability change quickly — call or text to confirm. © TIGON Golf Carts
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
};

const PublicCartCard: React.FC<{ cart: PublicCart; slug: string }> = ({ cart, slug }) => (
  <Card sx={{ display: 'flex', flexDirection: 'column' }}>
    <CardActionArea component={RouterLink} to={`/s/${slug}/${encodeURIComponent(cart.id)}`} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
      {cart.photos[0] ? (
        <Box component="img" src={cart.photos[0]} alt={cart.title} loading="lazy" sx={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block', bgcolor: 'grey.200' }} />
      ) : (
        <Box sx={{ aspectRatio: '4 / 3', bgcolor: 'grey.200', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'grey.500' }}><DirectionsCar sx={{ fontSize: 56 }} /></Box>
      )}
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
          <Typography fontWeight={700} sx={{ lineHeight: 1.25 }}>{cart.year} {cart.title}</Typography>
          <Typography fontWeight={900} color="primary" sx={{ whiteSpace: 'nowrap' }}>{money(cart.price)}</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">{cart.location}</Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
          <Chip size="small" label={cart.isUsed ? 'Used' : 'New'} color={cart.isUsed ? 'default' : 'secondary'} />
          <Chip size="small" label={cart.isElectric ? 'Electric' : 'Gas'} variant="outlined" />
          {cart.passengers > 0 && <Chip size="small" label={`${cart.passengers} seats`} variant="outlined" />}
          {cart.lifted && <Chip size="small" label="Lifted" variant="outlined" />}
          {cart.streetLegal && <Chip size="small" label="Street legal" variant="outlined" />}
        </Box>
      </CardContent>
    </CardActionArea>
  </Card>
);

export default StorefrontPage;
