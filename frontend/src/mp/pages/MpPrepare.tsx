import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Paper, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { ArrowBack, CheckCircle, ContentCopy, ErrorOutline, OpenInNew, PhotoLibrary } from '@mui/icons-material';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import MpShell from '../components/MpShell';
import CartPhoto from '../components/CartPhoto';
import { useMp } from '../MpDataContext';
import { cartTitle, generateVariations } from '../cartLogic';
import { formatPrice, groupAccounts, workingPhotos } from '../cartUtils';
import { COLLECTIONS, MARKETPLACE_CREATE_URL } from '../constants';
import { saveAllPhotos } from '../photos';
import { isOpenStatus, QUEUE_STATUS_COLOR, QUEUE_STATUS_LABEL, setQueueStatus } from '../queue';
import type { QueueItem } from '../types';
import { copyText, openExternal } from '../../native/actions';
import { logEvent } from '../../native/deviceSession';

type Step = 'photos' | 'text' | 'opened';

interface StepButtonProps {
  n: number;
  label: string;
  doneLabel: string;
  icon: React.ReactNode;
  onClick: () => void;
  isDone: boolean;
  disabled?: boolean;
}

function StepButton({ n, label, doneLabel, icon, onClick, isDone, disabled }: StepButtonProps) {
  return (
    <Button
      fullWidth
      size="large"
      variant={isDone ? 'outlined' : 'contained'}
      color={isDone ? 'success' : 'primary'}
      startIcon={isDone ? <CheckCircle /> : icon}
      onClick={onClick}
      disabled={disabled}
      sx={{ justifyContent: 'flex-start', py: 1.5, mb: 1.5 }}
    >
      {n}. {isDone ? doneLabel : label}
    </Button>
  );
}

/**
 * One-tap posting helper. Reached from a queue push (/mp/post/:queueId) or a cart page
 * (/mp/prepare/:cartId): save photos → copy listing + open Marketplace → confirm it was published.
 * Marketplace has no posting API, so the person always taps Publish themselves.
 */
const MpPrepare: React.FC = () => {
  const { queueId, cartId: cartParam } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const { carts, cartsLoading, brokenPhotos, accounts, userKeys, setPostedAccounts, refreshCart } = useMp();
  const [item, setItem] = useState<QueueItem | null>(null);
  const [itemError, setItemError] = useState('');
  const [variation, setVariation] = useState(0);
  const [done, setDone] = useState<Record<Step, boolean>>({ photos: false, text: false, opened: false });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const markedOpen = useRef(false);

  // Live queue item (when opened from a push / queue).
  useEffect(() => {
    if (!queueId) return;
    return onSnapshot(
      doc(db, COLLECTIONS.queue, queueId),
      (snap) => {
        if (!snap.exists()) {
          setItemError('This queue item no longer exists.');
          return;
        }
        const q = { id: snap.id, ...snap.data() } as QueueItem;
        setItem(q);
        setVariation((v) => (markedOpen.current ? v : q.variation || 0));
        if (q.accountId) setChosen((c) => (c.length ? c : [q.accountId]));
      },
      (e) => setItemError(e.message),
    );
  }, [queueId]);

  // Mark as opened once.
  useEffect(() => {
    if (!item || markedOpen.current || !uid) return;
    markedOpen.current = true;
    if (item.status === 'queued' || item.status === 'sent') setQueueStatus(item.id, 'opened').catch(() => undefined);
    logEvent(uid, 'queue_opened', { queueId: item.id, cartId: item.cartId });
  }, [item, uid]);

  const cartId = item?.cartId || cartParam || '';
  const cart = carts.find((c) => c.docId === cartId);
  useEffect(() => {
    if (cartId && !cart && !cartsLoading) refreshCart(cartId).catch(() => undefined);
  }, [cartId, cart, cartsLoading, refreshCart]);

  const listings = useMemo(() => (cart ? generateVariations(cart, userKeys[0] || '') : []), [cart, userKeys]);
  const listing = listings[variation];
  const photos = cart ? workingPhotos(cart, brokenPhotos) : [];
  const account = accounts.find((a) => a.id === item?.accountId);
  const grouped = useMemo(() => groupAccounts(accounts), [accounts]);
  const ev = { cartId: cart?.docId, queueId: item?.id };
  const pending = item?.status === 'pending_approval';

  if (itemError) return <MpShell><Alert severity="warning">{itemError}</Alert></MpShell>;
  if (!cart || !listing) {
    return (
      <MpShell>
        {cartsLoading || (queueId && !item) ? <CircularProgress /> : <Alert severity="warning">Cart not found — it may have sold.</Alert>}
      </MpShell>
    );
  }

  const flash = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage(''), 2500);
  };

  const savePhotos = async () => {
    await saveAllPhotos(cart, photos);
    setDone((d) => ({ ...d, photos: true }));
    logEvent(uid, 'photos_saved', ev);
  };

  const copyAndOpen = async () => {
    await copyText(listing.description);
    setDone((d) => ({ ...d, text: true, opened: true }));
    logEvent(uid, 'listing_prepared', ev);
    logEvent(uid, 'marketplace_opened', ev);
    flash('Description copied — paste it into Facebook.');
    await openExternal(MARKETPLACE_CREATE_URL);
  };

  const copy = async (label: string, text: string) => {
    await copyText(text);
    logEvent(uid, 'text_copied', { ...ev, message: label });
    flash(`${label} copied`);
  };

  const confirmPosted = async () => {
    setBusy(true);
    try {
      const add = chosen.filter((id) => !cart.postedAccounts[id]);
      await setPostedAccounts(cart, add, []);
      if (item) await setQueueStatus(item.id, 'posted', { accountId: chosen[0] || item.accountId });
      for (const a of chosen) logEvent(uid, 'post_marked', { ...ev, accountId: a });
      if (!chosen.length) logEvent(uid, 'post_marked', ev);
      setConfirmOpen(false);
      flash('Nice — marked as posted.');
    } catch (e) {
      logEvent(uid, 'error', { ...ev, message: e instanceof Error ? e.message : 'confirm failed' });
      flash('Could not save — check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const reportFailed = async () => {
    setBusy(true);
    try {
      if (item) await setQueueStatus(item.id, 'failed', { lastError: reason.trim() || 'Could not post' });
      logEvent(uid, 'post_failed', { ...ev, message: reason.trim() || 'Could not post' });
      setFailOpen(false);
      flash('Reported — a manager will see it.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MpShell>
      <Button startIcon={<ArrowBack />} onClick={() => navigate(-1)} sx={{ mb: 1 }}>Back</Button>
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '360px 1fr' } }}>
        <Paper sx={{ overflow: 'hidden', alignSelf: 'start' }}>
          <CartPhoto file={photos[0]} height={200} />
          <Box sx={{ p: 2 }}>
            <Typography variant="h6">{cartTitle(cart)}</Typography>
            <Typography variant="h5" color="primary" sx={{ fontWeight: 700 }}>{formatPrice(cart.price)}</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
              {item && <Chip size="small" color={QUEUE_STATUS_COLOR[item.status]} label={QUEUE_STATUS_LABEL[item.status]} />}
              {account && <Chip size="small" variant="outlined" label={`Post on: ${account.name}`} />}
              <Chip size="small" label={`${photos.length} photos`} />
            </Box>
            {item?.lastError && item.status === 'failed' && <Alert severity="error" sx={{ mt: 1 }}>{item.lastError}</Alert>}
          </Box>
        </Paper>

        <Box>
          <Paper sx={{ p: 2, mb: 2 }}>
            {pending && <Alert severity="info" sx={{ mb: 1.5 }}>Waiting for a manager's approval — you can look it over, but post it once it's approved.</Alert>}
            <Typography variant="overline" color="text.secondary">Post in 3 taps</Typography>
            <StepButton n={1} label={`Save ${photos.length} photos to this phone`} doneLabel="Photos saved" icon={<PhotoLibrary />} onClick={savePhotos} isDone={done.photos} />
            <StepButton n={2} label="Copy listing & open Marketplace" doneLabel="Copied — Marketplace opened" icon={<OpenInNew />} onClick={copyAndOpen} isDone={done.opened} />
            <StepButton n={3} label="I published it" doneLabel="Marked as posted" icon={<CheckCircle />} onClick={() => setConfirmOpen(true)} isDone={item?.status === 'posted'} disabled={pending} />
            <Button fullWidth color="error" startIcon={<ErrorOutline />} onClick={() => setFailOpen(true)} disabled={item?.status === 'posted' || pending}>
              Couldn't post it
            </Button>
            {message && <Alert severity="success" sx={{ mt: 1 }}>{message}</Alert>}
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Tabs value={variation} onChange={(_, v) => setVariation(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 1 }}>
              {listings.map((l, i) => <Tab key={i} label={`#${i + 1} ${l.format === 'list' ? 'List' : 'Para'}`} />)}
            </Tabs>
            <Typography variant="caption" color="text.secondary">Tap a field to copy it:</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', my: 1 }}>
              <Chip icon={<ContentCopy />} label={`Title: ${listing.title1}`} onClick={() => copy('Title', listing.title1)} />
              <Chip icon={<ContentCopy />} label={`Price: ${cart.price}`} onClick={() => copy('Price', String(cart.price))} />
              {cart.year && <Chip icon={<ContentCopy />} label={`Year: ${cart.year}`} onClick={() => copy('Year', cart.year)} />}
              {cart.make && <Chip icon={<ContentCopy />} label={`Make: ${cart.make}`} onClick={() => copy('Make', cart.make)} />}
              {cart.model && <Chip icon={<ContentCopy />} label={`Model: ${cart.model}`} onClick={() => copy('Model', cart.model)} />}
            </Box>
            <Box
              onClick={() => copy('Description', listing.description)}
              sx={{ bgcolor: 'grey.50', border: 1, borderColor: 'grey.200', borderRadius: 2, p: 2, cursor: 'pointer' }}
            >
              <Typography component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', m: 0, fontSize: 14 }}>{listing.description}</Typography>
            </Box>
          </Paper>
        </Box>
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Which account did you post on?</DialogTitle>
        <DialogContent>
          {grouped.map(([g, list]) => (
            <Box key={g} sx={{ mb: 1 }}>
              <Typography variant="overline" color="text.secondary">{g}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {list.map((a) => {
                  const already = !!cart.postedAccounts[a.id];
                  return (
                    <FormControlLabel
                      key={a.id}
                      disabled={already}
                      control={
                        <Checkbox
                          size="small"
                          checked={already || chosen.includes(a.id)}
                          onChange={(e) => setChosen((c) => (e.target.checked ? [...c, a.id] : c.filter((x) => x !== a.id)))}
                        />
                      }
                      label={<Typography variant="body2">{a.name}</Typography>}
                    />
                  );
                })}
              </Box>
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmPosted} disabled={busy}>{busy ? 'Saving…' : 'Mark posted'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={failOpen} onClose={() => setFailOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>What went wrong?</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField fullWidth multiline minRows={2} label="Reason (e.g. account blocked, photos failed)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFailOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={reportFailed} disabled={busy}>Report</Button>
        </DialogActions>
      </Dialog>
      {item && !isOpenStatus(item.status) && item.status !== 'posted' && item.status !== 'failed' && (
        <Alert severity="info" sx={{ mt: 2 }}>This item was {QUEUE_STATUS_LABEL[item.status].toLowerCase()}.</Alert>
      )}
    </MpShell>
  );
};

export default MpPrepare;
