import React, { useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import { AutoAwesome, Check, ContentCopy } from '@mui/icons-material';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { logEvent } from '../../native/deviceSession';
import { locationName } from '../constants';
import { photoUrl } from '../cartLogic';
import type { Cart } from '../types';

type Tone = 'friendly' | 'professional' | 'short';

interface AiListingRequest {
  cart: {
    make: string;
    model: string;
    year: string;
    color: string;
    seatColor: string;
    passengers: number;
    isUsed: boolean;
    isElectric: boolean;
    batteryType: string;
    packVoltage: string;
    isLifted: boolean;
    isStreetLegal: boolean;
    hasSoundSystem: boolean;
    hasExtendedTop: boolean;
    hasHitch: boolean;
    tireRimSize: string;
    tireType: string;
    driveTrain: string;
    price: number;
    cartWarranty: string;
    batteryWarranty: string;
    location: string;
  };
  photoUrl?: string;
  tone: Tone;
}

interface AiListingResult {
  title: string;
  description: string;
  priceNote: string;
}

const TONES: { value: Tone; label: string }[] = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'short', label: 'Short' },
];

const NOT_SET_UP = "AI writer isn't set up yet — an admin needs to add the ANTHROPIC_API_KEY secret.";

const mpAiListing = httpsCallable<AiListingRequest, AiListingResult>(functions, 'mpAiListing');

function buildRequest(cart: Cart, tone: Tone): AiListingRequest {
  const first = cart.photos.find(Boolean);
  const req: AiListingRequest = {
    cart: {
      make: cart.make,
      model: cart.model,
      year: cart.year,
      color: cart.color,
      seatColor: cart.seatColor,
      passengers: cart.passengers,
      isUsed: cart.isUsed,
      isElectric: cart.isElectric,
      batteryType: cart.batteryType,
      packVoltage: cart.packVoltage,
      isLifted: cart.isLifted,
      isStreetLegal: cart.isStreetLegal,
      hasSoundSystem: cart.hasSoundSystem,
      hasExtendedTop: cart.hasExtendedTop,
      hasHitch: cart.hasHitch,
      tireRimSize: cart.tireRimSize,
      tireType: cart.tireType,
      driveTrain: cart.driveTrain,
      price: cart.price,
      cartWarranty: cart.cartWarranty,
      batteryWarranty: cart.batteryWarranty,
      location: locationName(cart.locationId),
    },
    tone,
  };
  if (first) req.photoUrl = photoUrl(first);
  return req;
}

function errorMessage(e: unknown): string {
  const err = (e ?? {}) as { code?: string; message?: string };
  const code = (err.code || '').replace(/^functions\//, '');
  const msg = err.message || '';
  if (
    code === 'failed-precondition' ||
    code === 'not-found' ||
    /not (been )?deployed|does not exist|not found|ANTHROPIC_API_KEY/i.test(msg)
  ) {
    return NOT_SET_UP;
  }
  if (code === 'unauthenticated') return 'Sign in again to use the AI writer.';
  if (code === 'permission-denied') return "Your account doesn't have MP Assistant access.";
  if (code === 'internal' && (!msg || msg === 'internal' || msg === 'INTERNAL')) {
    return 'The AI writer could not be reached. It may not be deployed yet — try again later.';
  }
  return msg || 'Something went wrong. Try again.';
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    await copyText(text);
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  if (label) {
    return (
      <Button size="small" variant="contained" startIcon={done ? <Check /> : <ContentCopy />} onClick={copy}>
        {done ? 'Copied' : label}
      </Button>
    );
  }
  return (
    <Tooltip title={done ? 'Copied' : 'Copy'}>
      <IconButton size="small" onClick={copy} disabled={!text}>
        {done ? <Check fontSize="small" color="success" /> : <ContentCopy fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}

const AiListingPanel: React.FC<{ cart: Cart }> = ({ cart }) => {
  const { currentUser } = useAuth();
  const [tone, setTone] = useState<Tone>('friendly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiListingResult | null>(null);

  const write = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await mpAiListing(buildRequest(cart, tone));
      setResult(res.data);
      void logEvent(currentUser?.uid, 'ai_listing', { cartId: cart.id });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" color="primary" gutterBottom>AI listing writer</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Writes a Marketplace title and description from this cart's details. Always review before posting.
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {TONES.map((t) => (
          <Chip
            key={t.value}
            label={t.label}
            color={tone === t.value ? 'primary' : 'default'}
            variant={tone === t.value ? 'filled' : 'outlined'}
            onClick={() => setTone(t.value)}
            disabled={loading}
          />
        ))}
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <AutoAwesome />}
          onClick={write}
          disabled={loading}
        >
          {loading ? 'Writing…' : result ? 'Rewrite with AI' : 'Write with AI'}
        </Button>
      </Box>

      {error && <Alert severity={error === NOT_SET_UP ? 'info' : 'error'} sx={{ mb: 2 }}>{error}</Alert>}

      {result && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Chip size="small" label="Title" />
            <Typography sx={{ flexGrow: 1, fontWeight: 600 }}>{result.title}</Typography>
            <CopyButton text={result.title} />
          </Box>
          <Box sx={{ position: 'relative', bgcolor: 'grey.50', border: 1, borderColor: 'grey.200', borderRadius: 2, p: 2, mt: 1 }}>
            <Typography component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', m: 0, fontSize: 14 }}>
              {result.description}
            </Typography>
          </Box>
          {result.priceNote && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
              <Chip size="small" label="Price note" />
              <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{result.priceNote}</Typography>
              <CopyButton text={result.priceNote} />
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            <CopyButton text={result.description} label="Copy description" />
            <CopyButton text={`${result.title}\n\n${result.description}`} label="Copy title + description" />
          </Box>
        </>
      )}
    </Paper>
  );
};

export default AiListingPanel;
