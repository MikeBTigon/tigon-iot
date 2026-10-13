// Track 4 (inventory) — public page /similar/:cartId: "That cart sold — here are similar carts in stock".
// Data from mpSimilarApi (GET /api/similar/<cartId>). Each cart links to the public storefront cart page.
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, Card, CardActionArea, CardContent, Chip, CircularProgress, Typography } from '@mui/material';
import { DirectionsCar } from '@mui/icons-material';
import PublicShell from '../public/PublicShell';
import { money } from '../../../storefront/api';
import type { PublicCart } from '../../../storefront/api';
import i18n, { useT } from '../../../i18n';

interface SimilarResponse {
  sold: { title: string; location: string; locationId: string } | null;
  phone: string;
  similar: PublicCart[];
}

const ORIGIN = 'https://tigoniot.com';
const base = () => (typeof location !== 'undefined' && (location.origin === ORIGIN || location.hostname.endsWith('.web.app')) ? '' : ORIGIN);

const SimilarPublicPage: React.FC = () => {
  const t = useT();
  const { cartId = '' } = useParams();
  const [data, setData] = useState<SimilarResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetch(`${base()}/api/similar/${encodeURIComponent(cartId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as SimilarResponse;
      })
      .then((d) => {
        if (!live) return;
        setData(d);
        document.title = i18n.t('similar.docTitle');
      })
      .catch(() => live && setError('load'));
    return () => {
      live = false;
    };
  }, [cartId]);

  const subtitle = data?.sold
    ? data.sold.location
      ? t('similar.soldNear', { title: data.sold.title, location: data.sold.location })
      : t('similar.sold', { title: data.sold.title })
    : t('similar.inStock');

  return (
    <PublicShell title={t('similar.title')} subtitle={data ? subtitle : undefined} phone={data?.phone || '1-844-844-6638'}>
      {error && <Alert severity="info">{t('similar.loadError')}</Alert>}
      {!data && !error && <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress /></Box>}
      {data && !data.similar.length && <Alert severity="info">{t('similar.none')}</Alert>}
      {data && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' } }}>
          {data.similar.slice(0, 6).map((c) => (
            <Card key={c.id}>
              <CardActionArea href={`/s/tigon/${encodeURIComponent(c.id)}`}>
                {c.photos[0] ? (
                  <Box component="img" src={c.photos[0]} alt={c.title} loading="lazy"
                    sx={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block', bgcolor: 'grey.200' }} />
                ) : (
                  <Box sx={{ aspectRatio: '4 / 3', bgcolor: 'grey.200', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'grey.500' }}>
                    <DirectionsCar sx={{ fontSize: 64 }} />
                  </Box>
                )}
                <CardContent>
                  <Typography sx={{ fontWeight: 700, lineHeight: 1.25 }}>{[c.year, c.title].filter(Boolean).join(' ')}</Typography>
                  <Typography variant="h6" color="primary" sx={{ fontWeight: 800 }}>{money(c.price)}</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                    <Chip size="small" label={c.isUsed ? t('similar.used') : t('similar.new')} />
                    {c.location && <Chip size="small" variant="outlined" label={c.location} />}
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}
    </PublicShell>
  );
};

export default SimilarPublicPage;
