// Insights — "What should I post today?" card: AI picks 5 aged / least-posted carts to post today.
// Renders nothing when AI help is off. Can go on MP Home or the live board.
import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Link, Stack, Typography } from '@mui/material';
import { AutoAwesome } from '@mui/icons-material';
import { useMp } from '../MpDataContext';
import { postedAccountCount } from '../cartUtils';
import { storeName } from '../sales/closing/closingUtils';
import type { MpCart } from '../types';
import { aiPostPicks, useAiEnabled } from './insightsApi';

const DAY = 86_400_000;
const title = (c: MpCart) => [c.year, c.make, c.model, c.color].filter(Boolean).join(' ') || `Cart ${c.serial || c.docId}`;

/** Up to 40 carts worth considering: in stock longest, posted least, with photos. */
function postCandidates(carts: MpCart[], now = Date.now()): MpCart[] {
  return carts
    .filter((c) => !c.soldLocally && !c.doNotPost && !c.flaggedDelete && c.inStock !== false && c.photos.length > 0)
    .sort((a, b) => postedAccountCount(a) - postedAccountCount(b) || (a.stockedAt || now) - (b.stockedAt || now))
    .slice(0, 40);
}

const AiPostPicks: React.FC<{ storeId?: string }> = ({ storeId }) => {
  const ai = useAiEnabled();
  const { carts } = useMp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picks, setPicks] = useState<Array<{ id: string; reason: string }> | null>(null);
  if (!ai) return null;
  const byId = new Map(carts.map((c) => [c.docId, c]));

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const now = Date.now();
      const list = postCandidates(storeId ? carts.filter((c) => c.locationId === storeId) : carts, now).map((c) => ({
        id: c.docId, title: title(c), price: c.price || 0, days: c.stockedAt ? Math.round((now - c.stockedAt) / DAY) : null,
        posts: postedAccountCount(c), store: storeName(c.locationId), photos: c.photos.length,
      }));
      if (!list.length) throw new Error('No carts with photos to choose from.');
      setPicks(await aiPostPicks(list));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <AutoAwesome color="primary" />
          <Typography sx={{ fontWeight: 700, flex: 1 }}>What should I post today?</Typography>
          <Button size="small" variant="outlined" onClick={run} disabled={busy || !carts.length} startIcon={busy ? <CircularProgress size={14} /> : undefined}>
            {picks ? 'Ask again' : 'Suggest 5'}
          </Button>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        {!picks && !error && <Typography variant="body2" color="text.secondary">AI looks at carts in stock the longest and posted the least, and picks five.</Typography>}
        {picks && !picks.length && <Typography variant="body2" color="text.secondary">No picks this time — try again.</Typography>}
        {picks && picks.length > 0 && (
          <Stack component="ol" spacing={0.75} sx={{ pl: 2.5, m: 0 }}>
            {picks.map((p) => {
              const c = byId.get(p.id);
              return (
                <li key={p.id}>
                  <Link component={RouterLink} to={`/mp/cart/${encodeURIComponent(p.id)}`} sx={{ fontWeight: 600 }}>{c ? title(c) : p.id}</Link>
                  {c ? <Typography component="span" variant="body2" color="text.secondary"> · {storeName(c.locationId)}</Typography> : null}
                  <Typography variant="body2">{p.reason}</Typography>
                </li>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

export default AiPostPicks;
