// Insights — the lenders' online applications as cards (/mp/credit-app, and inside an application).
// "Apply" opens the lender's form in its own window and, with the Tigon Poster extension, fills in the customer.
import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardActions, CardContent, Collapse, Grid, IconButton, Link, Tooltip, Typography,
} from '@mui/material';
import { ContentCopy, ExpandLess, ExpandMore, OpenInNew } from '@mui/icons-material';
import { notify } from '../../../ui/notify';
import { POSTER_ZIP_URL, posterVersion } from '../../posterBridge';
import { FILL_LABELS, LENDER_FILL_MIN_VERSION, LENDER_LINKS, canAutofillLenders, openLender, type LenderFill } from './lenderLinks';

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    notify(`${what} copied`, 'success');
  } catch {
    notify('Could not copy', 'error');
  }
};

/** Re-checks for the extension (its bridge marks <html> right after the page loads). */
function useAutofill() {
  const [state, setState] = useState(() => ({ ok: canAutofillLenders(), version: posterVersion() }));
  useEffect(() => {
    const check = () => setState({ ok: canAutofillLenders(), version: posterVersion() });
    const onMsg = (e: MessageEvent) => { if (e.source === window && e.data?.source === 'tigon-poster') check(); };
    window.addEventListener('message', onMsg);
    window.postMessage({ source: 'tigon-iot', type: 'TIGON_POSTER_PING' }, window.location.origin);
    const t = window.setTimeout(check, 800);
    return () => { window.removeEventListener('message', onMsg); window.clearTimeout(t); };
  }, []);
  return state;
}

const LenderPicker: React.FC<{ fill: LenderFill | null; customerName?: string; title?: string }> = ({ fill, customerName = '', title = 'Apply with a lender' }) => {
  const auto = useAutofill();
  const [showCopy, setShowCopy] = useState(false);
  const rows = fill ? FILL_LABELS.filter(([k]) => fill[k]) : [];
  const isPhone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 600px)').matches;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{title}{customerName ? ` — ${customerName}` : ''}</Typography>
      {fill && (auto.ok ? (
        <Alert severity="success" sx={{ mb: 1 }}>
          <b>Apply</b> opens the lender's form in its own window and fills in {customerName || 'the customer'}'s details. Check every field,
          then the customer types their Social Security number and date of birth and submits. Nothing is submitted for you.
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 1 }}>
          {isPhone ? 'On a phone, open the lender and copy each detail with the copy buttons below.' : (
            <>
              To fill lender forms automatically, {auto.version ? <>update the <b>Tigon Poster</b> extension to {LENDER_FILL_MIN_VERSION} or newer</> : <>install the <b>Tigon Poster</b> Chrome extension</>}{' '}
              (<Link href={POSTER_ZIP_URL}>download</Link>, then reload it on chrome://extensions). Until then, copy each detail with the copy buttons below.
            </>
          )}
        </Alert>
      ))}
      <Grid container spacing={1.5}>
        {LENDER_LINKS.map((l) => (
          <Grid key={l.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flex: 1, pb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.3 }}>{l.name.toUpperCase()}</Typography>
                <Typography variant="body2" color="text.secondary">{l.note}</Typography>
                <Link href={l.url} target="_blank" rel="noopener" variant="caption" sx={{ display: 'block', mt: 0.5, wordBreak: 'break-all' }}>
                  {new URL(l.url).hostname}
                </Link>
              </CardContent>
              <CardActions sx={{ pt: 0 }}>
                <Button variant="contained" size="small" startIcon={<OpenInNew />} onClick={() => openLender(l, fill, customerName)}>
                  {fill && auto.ok ? 'Apply & fill in' : 'Apply'}
                </Button>
                <Tooltip title="Copy the application link (to text or email the customer)">
                  <IconButton size="small" aria-label={`Copy ${l.name} link`} onClick={() => copy(l.url, `${l.name} link`)}><ContentCopy fontSize="small" /></IconButton>
                </Tooltip>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
      {rows.length > 0 && (
        <>
          <Button size="small" sx={{ mt: 1 }} endIcon={showCopy ? <ExpandLess /> : <ExpandMore />} onClick={() => setShowCopy((v) => !v)}>
            Customer details to copy
          </Button>
          <Collapse in={showCopy || (!auto.ok && !!fill)}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2, mt: 0.5 }}>
              {rows.map(([k, label]) => (
                <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25, minWidth: 0 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ width: 150, flexShrink: 0 }}>{label}</Typography>
                  <Typography variant="body2" sx={{ flex: 1, overflowWrap: 'anywhere' }}>{fill![k]}</Typography>
                  <IconButton size="small" aria-label={`Copy ${label}`} onClick={() => copy(fill![k], label)}><ContentCopy fontSize="inherit" /></IconButton>
                </Box>
              ))}
            </Box>
          </Collapse>
        </>
      )}
    </Box>
  );
};

export default LenderPicker;
