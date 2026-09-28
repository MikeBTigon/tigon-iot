import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { ArrowBack, Print } from '@mui/icons-material';
import { QRCodeSVG } from 'qrcode.react';
import { useMp } from '../MpDataContext';
import { cartName, cartTitle, isLithium, photoUrl } from '../cartLogic';
import { DEALERSHIP_BY_ID, locationName } from '../constants';
import type { Cart } from '../types';
import { getOrCreateLink } from './links';
import { useMpSettings, useShareCart } from './useShareData';

/** Key features for the flyer. */
function flyerFeatures(cart: Cart): string[] {
  const f: string[] = [cart.isUsed ? 'Pre-owned, inspected and ready to ride' : 'Brand new'];
  if (cart.passengers) f.push(`${cart.passengers} passenger seating`);
  if (cart.isElectric) {
    const batt = [cart.packVoltage && `${cart.packVoltage.replace(/\s*v(olt)?s?$/i, '')}V`, isLithium(cart.batteryType) ? 'lithium' : cart.batteryType.toLowerCase()].filter(Boolean).join(' ');
    f.push(batt ? `Electric · ${batt} battery` : 'Electric');
  } else f.push(`Gas${cart.engineMake ? ` · ${cart.engineMake} engine` : ''}`);
  if (cart.isStreetLegal) f.push('Street legal (LSV)');
  if (cart.isLifted) f.push('Lifted');
  if (cart.color) f.push(`${cart.color}${cart.seatColor ? ` with ${cart.seatColor.toLowerCase()} seats` : ''}`);
  if (cart.tireRimSize) f.push(`${cart.tireRimSize.replace(/"/g, '')}" wheels${cart.tireType ? `, ${cart.tireType.toLowerCase()} tires` : ''}`);
  if (cart.hasExtendedTop) f.push('Extended roof');
  if (cart.hasSoundSystem) f.push('Sound system');
  if (cart.hasHitch) f.push('Trailer hitch');
  if (cart.cartWarranty) f.push(`${cart.cartWarranty} cart warranty${cart.batteryWarranty ? ` · ${cart.batteryWarranty} battery` : ''}`);
  f.push('Financing & delivery available');
  return f;
}

const PRINT_CSS = `
@page { size: letter; margin: 0.4in; }
@media print {
  body * { visibility: hidden !important; }
  #tigon-flyer, #tigon-flyer * { visibility: visible !important; }
  #tigon-flyer { position: absolute; left: 0; top: 0; width: 100%; }
  .no-print { display: none !important; }
  .flyer-page { box-shadow: none !important; margin: 0 !important; }
}
.flyer-page { width: 7.7in; min-height: 10.1in; background: #fff; color: #111; margin: 0 auto 24px; padding: 0.3in;
  box-shadow: 0 2px 12px rgba(0,0,0,.15); font-family: Roboto, Helvetica, Arial, sans-serif; box-sizing: border-box; }
.labels { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(3, 1fr); gap: 0.2in; height: 9.9in; }
.label { border: 1px dashed #999; border-radius: 8px; padding: 0.15in; display: flex; gap: 0.15in; align-items: center; }
@media screen and (max-width: 800px) {
  .flyer-page { width: 100%; min-height: 0; padding: 16px; }
  .labels { grid-template-columns: 1fr; height: auto; }
}
`;

/** Printable flyer (letter) or a sheet of 6 QR labels for one cart. Minimal chrome, print CSS. */
const Flyer: React.FC = () => {
  const { cartId = '' } = useParams();
  const navigate = useNavigate();
  const { profile, ensureCartsLoaded } = useMp();
  const { cart, loading } = useShareCart(cartId);
  const settings = useMpSettings();
  const [mode, setMode] = useState<'flyer' | 'labels'>('flyer');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile) ensureCartsLoaded();
  }, [profile, ensureCartsLoaded]);

  useEffect(() => {
    if (!cart || !profile) return;
    let live = true;
    getOrCreateLink({ cart, platform: 'qr', campaign: 'flyer' })
      .then((l) => live && setLink(l))
      .catch((e) => live && setError(e.message || 'Could not create the QR link.'));
    return () => {
      live = false;
    };
  }, [cart, profile]);

  if (!cart) {
    return <Box sx={{ p: 3 }}>{loading ? <CircularProgress /> : <Alert severity="warning">Cart not found — it may have sold.</Alert>}</Box>;
  }
  const store = DEALERSHIP_BY_ID[cart.locationId] || DEALERSHIP_BY_ID.T0;
  const phone = store.phone || settings.defaultPhone || DEALERSHIP_BY_ID.T0.phone;
  const price = cart.price > 0 ? `$${cart.price.toLocaleString('en-US')}` : '';
  const photos = cart.photos.slice(0, 3);
  const logo = settings.logoUrl
    ? <img src={settings.logoUrl} alt="TIGON" style={{ height: 44 }} />
    : <span style={{ fontWeight: 900, fontSize: 32, letterSpacing: 1 }}>TIGON <span style={{ fontSize: 14, fontWeight: 600 }}>GOLF CARTS</span></span>;
  const qr = link ? <QRCodeSVG value={link} size={512} marginSize={1} style={{ width: '100%', height: 'auto' }} /> : <CircularProgress size={24} />;

  return (
    <Box sx={{ bgcolor: '#eee', minHeight: '100vh', py: 2, px: { xs: 1, sm: 2 } }}>
      <style>{PRINT_CSS}</style>
      <Box className="no-print" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', maxWidth: '7.7in', mx: 'auto', mb: 2 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate(`/mp/share/${cart.docId}`)}>Share Kit</Button>
        <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)} sx={{ bgcolor: 'background.paper' }}>
          <ToggleButton value="flyer">Flyer</ToggleButton>
          <ToggleButton value="labels">QR labels (6)</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="contained" startIcon={<Print />} onClick={() => window.print()} disabled={!link}>Print</Button>
      </Box>
      {error && <Alert className="no-print" severity="error" sx={{ maxWidth: '7.7in', mx: 'auto', mb: 2 }}>{error}</Alert>}

      <div id="tigon-flyer">
        {mode === 'flyer' ? (
          <div className="flyer-page">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0e4671', color: '#fff', padding: '10px 16px', borderBottom: '6px solid #af1f31' }}>
              {logo}
              <span style={{ fontWeight: 700 }}>{store.cityState || 'TIGON Golf Carts'}</span>
            </div>
            {photos[0] && <img src={photoUrl(photos[0])} alt="" style={{ width: '100%', height: '3.9in', objectFit: 'cover', display: 'block', marginTop: 12 }} />}
            {photos.length > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${photos.length - 1}, 1fr)`, gap: 8, marginTop: 8 }}>
                {photos.slice(1).map((p) => <img key={p} src={photoUrl(p)} alt="" style={{ width: '100%', height: '1.2in', objectFit: 'cover' }} />)}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginTop: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.15 }}>{cartName(cart)}</div>
                <div style={{ fontSize: 15, color: '#444', marginTop: 2 }}>{cartTitle(cart)}</div>
              </div>
              {price && <div style={{ background: '#af1f31', color: '#fff', fontSize: 30, fontWeight: 900, padding: '6px 18px', borderRadius: 40, whiteSpace: 'nowrap' }}>{price}</div>}
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
              <ul style={{ flex: 1, margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.5 }}>
                {flyerFeatures(cart).slice(0, 10).map((f) => <li key={f}>{f}</li>)}
              </ul>
              <div style={{ width: '1.7in', textAlign: 'center' }}>
                {qr}
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0e4671' }}>Scan for photos & details</div>
              </div>
            </div>
            <div style={{ marginTop: 14, background: '#0e4671', color: '#fff', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 900 }}>Call/Text {phone}</span>
              <span style={{ fontSize: 13, alignSelf: 'center' }}>{store.address !== 'National' ? store.address : locationName(cart.locationId)}</span>
            </div>
          </div>
        ) : (
          <div className="flyer-page">
            <div className="labels">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="label" key={i}>
                  <div style={{ width: '1.5in', flexShrink: 0 }}>{qr}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>{cartName(cart)}</div>
                    {price && <div style={{ color: '#af1f31', fontWeight: 900, fontSize: 22 }}>{price}</div>}
                    <div style={{ fontSize: 12, marginTop: 4 }}>Scan for details</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0e4671' }}>{phone}</div>
                    <div style={{ fontSize: 11, color: '#555' }}>TIGON {store.cityState}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Box>
  );
};

export default Flyer;
