import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Snackbar, Typography } from '@mui/material';
import { ArrowBack, Call, CheckCircle, Directions, DirectionsCar, IosShare, Sms } from '@mui/icons-material';
import { DEALERSHIP_BY_ID } from '../mp/constants';
import StorefrontHeader from './StorefrontHeader';
import { fetchStorefrontCart, money, smsHref, telHref, type StorefrontCartResponse } from './api';

/** Public cart page at /s/:slug/:cartId (no sign-in). */
const StorefrontCartPage: React.FC = () => {
  const { slug = 'tigon', cartId = '' } = useParams();
  const [data, setData] = useState<StorefrontCartResponse | null>(null);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState(0);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let live = true;
    fetchStorefrontCart(slug, cartId)
      .then((d) => {
        if (!live) return;
        setData(d);
        setPhoto(0);
        document.title = `${d.cart.year} ${d.cart.title} — ${money(d.cart.price)} | TIGON Golf Carts`;
      })
      .catch((e) => live && setError(e.message === 'not_found' ? 'This cart has sold or is no longer available.' : 'Could not load this cart. Please try again.'));
    return () => {
      live = false;
    };
  }, [slug, cartId]);

  const cart = data?.cart;
  const store = cart ? data?.dealership || DEALERSHIP_BY_ID[cart.locationId] : undefined;
  const phone = data?.storefront.phone || store?.phone || DEALERSHIP_BY_ID.T0.phone;
  const pageUrl = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : '';
  const name = cart ? `${cart.year} ${cart.title}`.trim() : '';

  const share = async () => {
    const text = cart ? `${name} — ${money(cart.price)}` : '';
    try {
      if (navigator.share) {
        await navigator.share({ title: name, text, url: pageUrl });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${pageUrl}`);
      setToast('Link copied');
    } catch {
      /* cancelled */
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      <StorefrontHeader storefront={data?.storefront || null} slug={slug} textBody={cart ? `Hi! Is the ${name} (${money(cart.price)}) still available? ${pageUrl}` : undefined} />
      <Box component="main" sx={{ maxWidth: 1100, mx: 'auto', px: 2, py: 2 }}>
        <Button component={RouterLink} to={`/s/${slug}`} startIcon={<ArrowBack />} sx={{ mb: 1 }}>All carts</Button>
        {error && <Alert severity="info">{error} <RouterLink to={`/s/${slug}`}>See other carts</RouterLink></Alert>}
        {!data && !error && <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress /></Box>}
        {cart && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' }, gap: 2, alignItems: 'start' }}>
            <Box>
              {cart.photos.length ? (
                <>
                  <Box component="img" src={cart.photos[photo]} alt={name} sx={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block', borderRadius: 1, bgcolor: 'grey.200' }} />
                  {cart.photos.length > 1 && (
                    <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', mt: 1, pb: 0.5 }}>
                      {cart.photos.map((p, i) => (
                        <Box key={p} component="img" src={p} alt="" loading="lazy" onClick={() => setPhoto(i)}
                          sx={{ width: 84, height: 63, objectFit: 'cover', borderRadius: 0.5, cursor: 'pointer', flexShrink: 0, outline: i === photo ? '3px solid #af1f31' : 'none' }} />
                      ))}
                    </Box>
                  )}
                </>
              ) : (
                <Box sx={{ aspectRatio: '4 / 3', bgcolor: 'grey.200', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'grey.500', borderRadius: 1 }}>
                  <DirectionsCar sx={{ fontSize: 96 }} />
                </Box>
              )}
            </Box>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h5" component="h1" fontWeight={800}>{name}</Typography>
              <Typography variant="h4" color="primary" fontWeight={900} sx={{ my: 1 }}>{money(cart.price)}</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
                <Chip size="small" label={cart.isUsed ? 'Used' : 'New'} color={cart.isUsed ? 'default' : 'secondary'} />
                <Chip size="small" label={cart.isElectric ? 'Electric' : 'Gas'} variant="outlined" />
                <Chip size="small" label={cart.location} variant="outlined" />
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
                <Button variant="contained" size="large" startIcon={<Call />} href={telHref(phone)}>Call</Button>
                <Button variant="contained" color="secondary" size="large" startIcon={<Sms />}
                  href={smsHref(phone, `Hi! Is the ${name} (${money(cart.price)}) still available? ${pageUrl}`)}>
                  Text
                </Button>
                {store?.maps && (
                  <Button variant="outlined" startIcon={<Directions />} href={store.maps} target="_blank" rel="noopener">Directions</Button>
                )}
                <Button variant="outlined" startIcon={<IosShare />} onClick={share}>Share</Button>
              </Box>
              <Typography variant="body2" sx={{ mb: 2 }}>{cart.description}</Typography>
              <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {cart.features.map((f) => (
                  <Box component="li" key={f} sx={{ display: 'flex', gap: 1, alignItems: 'center', py: 0.25 }}>
                    <CheckCircle fontSize="small" color="success" /> <Typography variant="body2">{f}</Typography>
                  </Box>
                ))}
              </Box>
              {store && (
                <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                  <Typography fontWeight={700}>TIGON Golf Carts {store.cityState}</Typography>
                  {store.address && store.address !== 'National' && <Typography variant="body2">{store.address}</Typography>}
                  <Typography variant="body2">{phone}</Typography>
                </Box>
              )}
            </Paper>
          </Box>
        )}
      </Box>
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
};

export default StorefrontCartPage;
