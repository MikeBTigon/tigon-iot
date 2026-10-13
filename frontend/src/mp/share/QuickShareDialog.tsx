// Quick share for a cart (cart page): one tap opens the phone's own Share sheet — which is where AirDrop
// (iPhone/iPad) and Nearby Share (Android) live, alongside Messages, WhatsApp and email — and shows a QR code
// anyone nearby can scan with their camera. A website cannot scan for or list nearby devices itself (browsers
// don't expose AirDrop, Bluetooth or Wi-Fi peers to a page); the OS Share sheet and the QR code are how the
// web hands a link to a device beside you. The link is a public, tracked storefront link the customer can open.
import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, Divider, IconButton, Snackbar, Typography,
} from '@mui/material';
import { Close, ContentCopy, IosShare, Sms } from '@mui/icons-material';
import { QRCodeSVG } from 'qrcode.react';
import { cartTitle } from '../cartLogic';
import { formatPrice } from '../cartUtils';
import { cartSeoSlug, createShortLink, trackedTarget } from './links';
import type { MpCart } from '../types';

/** True when the phone's native Share sheet is available (iOS Safari, Android Chrome, some desktops). */
const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

const QuickShareDialog: React.FC<{ cart: MpCart; open: boolean; onClose: () => void }> = ({ cart, open, onClose }) => {
  // The ready link is tied to a cart id, so reopening for a different cart shows a spinner until its link is made.
  const [link, setLink] = useState<{ cartId: string; url: string } | null>(null);
  const [toast, setToast] = useState('');
  const name = `${cart.year ? `${cart.year} ` : ''}${cartTitle(cart)}`.trim();
  const price = formatPrice(cart.price);
  const shareText = `${name}${price ? ` — ${price}` : ''}`;
  const ready = link?.cartId === cart.docId;
  const url = ready ? link!.url : '';
  const loading = open && !ready;

  useEffect(() => {
    if (!open || ready) return;
    let live = true;
    const set = (u: string) => { if (live) setLink({ cartId: cart.docId, url: u }); };
    // A tracked short link (clicks count in Share → Links). Fall back to the plain public link if that fails.
    createShortLink({ cart, platform: 'qr', campaign: 'quick_share' })
      .then(set)
      .catch(() => set(trackedTarget('tigon', cart.docId, { platform: 'qr', campaign: 'quick_share', uid: '', deviceId: '', seo: cartSeoSlug({ year: cart.year, make: cart.make, model: cart.model, color: cart.color, isUsed: cart.isUsed }) })));
    return () => { live = false; };
  }, [open, ready, cart]);

  const nativeShare = async () => {
    try {
      await navigator.share({ title: name, text: shareText, url });
    } catch {
      /* the person cancelled the share sheet */
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${url}`);
      setToast('Link copied');
    } catch {
      setToast('Could not copy — press and hold the link to copy it.');
    }
  };

  const smsUrl = `sms:?&body=${encodeURIComponent(`${shareText}\n${url}`)}`;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <IosShare color="primary" />
        <Box sx={{ flex: 1 }}>Quick share</Box>
        <IconButton aria-label="Close" onClick={onClose}><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{name}</Typography>
        {price && <Typography color="primary" sx={{ fontWeight: 700, mb: 1 }}>{price}</Typography>}

        {loading ? (
          <Box sx={{ py: 5, textAlign: 'center' }}><CircularProgress aria-label="Preparing link" /></Box>
        ) : (
          <>
            {canNativeShare() && (
              <>
                <Button fullWidth size="large" variant="contained" startIcon={<IosShare />} onClick={nativeShare} sx={{ mb: 1 }}>
                  Send to a device near me
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Opens your phone's share panel. On an iPhone or iPad pick <b>AirDrop</b>; on Android pick <b>Nearby Share</b>.
                  Any open device nearby shows up there. Messages, WhatsApp and email are in the same panel.
                </Typography>
              </>
            )}

            <Divider sx={{ my: 1 }}><Typography variant="caption" color="text.secondary">or scan to open on another phone</Typography></Divider>
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 1.5 }}>
              <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 2, border: 1, borderColor: 'grey.300' }}>
                <QRCodeSVG value={url} size={190} includeMargin level="M" />
              </Box>
            </Box>
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
              The person beside you points their camera at this code and the cart opens on their phone — no app or pairing needed.
            </Typography>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button variant="outlined" startIcon={<ContentCopy />} onClick={copy} sx={{ flex: 1 }}>Copy link</Button>
              <Button variant="outlined" startIcon={<Sms />} href={smsUrl} sx={{ flex: 1 }}>Text it</Button>
            </Box>

            {!canNativeShare() && (
              <Alert severity="info" sx={{ mt: 2 }}>
                This device doesn't offer a system share panel (AirDrop / Nearby Share), so it can't push to a nearby device directly.
                Have them scan the QR code, or copy / text the link.
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <Snackbar open={!!toast} autoHideDuration={2500} onClose={() => setToast('')} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Dialog>
  );
};

export default QuickShareDialog;
