import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import {
  Alert, AppBar, Box, Button, CircularProgress, Dialog, IconButton, MenuItem, Slider, Stack, Switch, TextField,
  ToggleButton, ToggleButtonGroup, Toolbar, Typography,
} from '@mui/material';
import { AutoFixHigh, Close, Download, PhotoLibrary, Replay, SwapHoriz } from '@mui/icons-material';
import { db } from '../../config/firebase';
import { COLLECTIONS, DEALERSHIP_BY_ID } from '../constants';
import { canvasToBlob, loadImage, saveBlob } from './media';

type Aspect = 'orig' | '1:1' | '4:5' | '16:9';
type Corner = 'br' | 'bl' | 'tr' | 'tl';

interface Adjust {
  aspect: Aspect;
  /** Crop position 0..1 (0.5 = centered). */
  posX: number;
  posY: number;
  brightness: number;
  contrast: number;
  saturation: number;
  /** Auto-levels input range. */
  lo: number;
  hi: number;
}

interface Watermark {
  on: boolean;
  corner: Corner;
  opacity: number;
}

const NEUTRAL: Adjust = { aspect: 'orig', posX: 0.5, posY: 0.5, brightness: 0, contrast: 0, saturation: 0, lo: 0, hi: 255 };
const ASPECTS: Record<Exclude<Aspect, 'orig'>, number> = { '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9 };
const BRAND_RED = '#af1f31';
const PREVIEW_SIDE = 1000;
const EXPORT_SIDE = 2000;

function cropRect(w: number, h: number, a: Adjust) {
  if (a.aspect === 'orig') return { sx: 0, sy: 0, cw: w, ch: h };
  const r = ASPECTS[a.aspect];
  let cw = w;
  let ch = h;
  if (w / h > r) cw = Math.round(h * r);
  else ch = Math.round(w / r);
  return { sx: Math.round((w - cw) * a.posX), sy: Math.round((h - ch) * a.posY), cw, ch };
}

/** Per-pixel levels → brightness → contrast → saturation. */
function applyAdjust(data: Uint8ClampedArray, a: Adjust) {
  const neutral = !a.brightness && !a.contrast && !a.saturation && a.lo === 0 && a.hi === 255;
  if (neutral) return;
  const lut = new Uint8ClampedArray(256);
  const b = 1 + a.brightness / 100;
  const c = 1 + a.contrast / 100;
  const span = Math.max(1, a.hi - a.lo);
  for (let v = 0; v < 256; v++) {
    let x = ((v - a.lo) * 255) / span;
    x *= b;
    x = (x - 128) * c + 128;
    lut[v] = x;
  }
  const s = 1 + a.saturation / 100;
  for (let i = 0; i < data.length; i += 4) {
    let r = lut[data[i]];
    let g = lut[data[i + 1]];
    let bl = lut[data[i + 2]];
    if (s !== 1) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = gray + (r - gray) * s;
      g = gray + (g - gray) * s;
      bl = gray + (bl - gray) * s;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = bl;
  }
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, wm: Watermark, logo: HTMLImageElement | null, text: string) {
  if (!wm.on) return;
  const pad = Math.round(Math.min(w, h) * 0.03);
  ctx.save();
  ctx.globalAlpha = wm.opacity;
  let bw: number;
  let bh: number;
  if (logo) {
    bw = Math.round(w * 0.22);
    bh = Math.round((bw * logo.naturalHeight) / Math.max(1, logo.naturalWidth));
  } else {
    const fs = Math.max(12, Math.round(w * 0.032));
    ctx.font = `700 ${fs}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    bw = Math.ceil(ctx.measureText(text).width) + fs;
    bh = Math.round(fs * 1.7);
  }
  const x = wm.corner.endsWith('r') ? w - bw - pad : pad;
  const y = wm.corner.startsWith('b') ? h - bh - pad : pad;
  if (logo) {
    ctx.drawImage(logo, x, y, bw, bh);
  } else {
    const fs = Math.round(bh / 1.7);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    const r = bh / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + bw, y, x + bw, y + bh, r);
    ctx.arcTo(x + bw, y + bh, x, y + bh, r);
    ctx.arcTo(x, y + bh, x, y, r);
    ctx.arcTo(x, y, x + bw, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = BRAND_RED;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + fs / 2, y + bh / 2 + 1);
  }
  ctx.restore();
}

/** Renders the edited photo into `canvas` (longest side ≤ maxSide). Throws on a CORS-tainted image. */
function render(
  canvas: HTMLCanvasElement, img: HTMLImageElement, a: Adjust, maxSide: number,
  wm: Watermark, logo: HTMLImageElement | null, text: string,
) {
  const { sx, sy, cw, ch } = cropRect(img.naturalWidth, img.naturalHeight, a);
  const scale = Math.min(1, maxSide / Math.max(cw, ch));
  const w = Math.max(1, Math.round(cw * scale));
  const h = Math.max(1, Math.round(ch * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available on this device.');
  ctx.drawImage(img, sx, sy, cw, ch, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  applyAdjust(id.data, a);
  ctx.putImageData(id, 0, 0);
  drawWatermark(ctx, w, h, wm, logo, text);
}

/** Simple auto-levels: stretch the 1st–99th luminance percentile, small saturation boost. */
function autoLevels(img: HTMLImageElement): Pick<Adjust, 'lo' | 'hi' | 'saturation' | 'brightness' | 'contrast'> {
  const c = document.createElement('canvas');
  const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  const total = d.length / 4;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total * 0.01) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= total * 0.01) {
      hi = v;
      break;
    }
  }
  if (hi - lo < 40) return { lo: 0, hi: 255, saturation: 10, brightness: 0, contrast: 0 };
  return { lo: Math.min(lo, 60), hi: Math.max(hi, 195), saturation: 12, brightness: 0, contrast: 5 };
}

const isTaintError = (e: unknown) => e instanceof DOMException && (e.name === 'SecurityError' || /taint|cross-origin/i.test(e.message));

/**
 * Full-screen photo editor: crop to 1:1 / 4:5 / 16:9 (drag to position), brightness/contrast/saturation,
 * one-tap auto fix, and a logo or "TIGON Golf Carts · phone" stamp. Exports a JPEG.
 */
export default function PhotoStudio({
  open,
  onClose,
  sources,
  initialIndex = 0,
  fileBase = 'photo',
  locationId = '',
  onApply,
  applyLabel = 'Use this photo',
}: {
  open: boolean;
  onClose: () => void;
  /** Photos to pick from (full URLs or local Blobs). */
  sources: Array<string | Blob>;
  initialIndex?: number;
  fileBase?: string;
  locationId?: string;
  /** Called with the edited JPEG (e.g. replace the photo in a listing). */
  onApply?: (blob: Blob, index: number) => Promise<void> | void;
  applyLabel?: string;
}) {
  const [extra, setExtra] = useState<Blob[]>([]);
  const all = useMemo(() => [...sources, ...extra], [sources, extra]);
  const [index, setIndex] = useState(initialIndex);
  /** Which listing photo "apply" replaces (the last original photo picked). */
  const [target, setTarget] = useState(initialIndex);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState('');
  const [adj, setAdj] = useState<Adjust>(NEUTRAL);
  const [wm, setWm] = useState<Watermark>({ on: false, corner: 'br', opacity: 0.85 });
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [phone, setPhone] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setIndex(initialIndex);
    setTarget(initialIndex);
  }, [open, initialIndex]);

  // Thumbnails (object URLs for local photos).
  const thumbs = useMemo(() => all.map((s) => (typeof s === 'string' ? s : URL.createObjectURL(s))), [all]);
  useEffect(() => () => thumbs.forEach((t, i) => typeof all[i] !== 'string' && URL.revokeObjectURL(t)), [thumbs, all]);

  // Logo + phone for the stamp.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const storePhone = DEALERSHIP_BY_ID[locationId]?.phone || '';
    getDoc(doc(db, COLLECTIONS.settings, 'general'))
      .then(async (snap) => {
        const s = snap.exists() ? snap.data() : {};
        if (!alive) return;
        setPhone(storePhone || String(s.defaultPhone || '') || DEALERSHIP_BY_ID.T0?.phone || '');
        if (s.logoUrl) {
          try {
            const l = await loadImage(String(s.logoUrl));
            if (alive) setLogo(l);
          } catch {
            // Logo host without CORS: fall back to the text stamp.
          }
        }
      })
      .catch(() => alive && setPhone(storePhone || DEALERSHIP_BY_ID.T0?.phone || ''));
    return () => {
      alive = false;
    };
  }, [open, locationId]);

  // Load the selected photo (keyed on the photo itself, so unrelated list changes don't reset edits).
  const current = all[index];
  useEffect(() => {
    if (!open || !current) return;
    let alive = true;
    setLoading(true);
    setError('');
    setDone('');
    setImg(null);
    setAdj(NEUTRAL);
    loadImage(current)
      .then((i) => alive && setImg(i))
      .catch(() =>
        alive &&
        setError("This photo couldn't be loaded for editing (its server may block it). Tap “From phone” to edit a copy saved on your phone."),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, current]);

  const stampText = `TIGON Golf Carts${phone ? ` · ${phone}` : ''}`;

  // Preview render.
  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const id = requestAnimationFrame(() => {
      try {
        render(canvasRef.current!, img, adj, PREVIEW_SIDE, wm, logo, stampText);
      } catch (e) {
        setError(
          isTaintError(e)
            ? "This photo's server doesn't allow editing (CORS). Save it to your phone, then tap “From phone” to edit the copy."
            : e instanceof Error ? e.message : String(e),
        );
      }
    });
    return () => cancelAnimationFrame(id);
  }, [img, adj, wm, logo, stampText]);

  const exportBlob = useCallback(async () => {
    if (!img) throw new Error('No photo loaded.');
    const c = document.createElement('canvas');
    try {
      render(c, img, adj, EXPORT_SIDE, wm, logo, stampText);
    } catch (e) {
      if (isTaintError(e)) throw new Error("This photo's server doesn't allow editing (CORS). Edit a copy from your phone instead.");
      throw e;
    }
    return canvasToBlob(c, 0.9);
  }, [img, adj, wm, logo, stampText]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError('');
    setDone('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const autoFix = () => {
    if (!img) return;
    try {
      setAdj((a) => ({ ...a, ...autoLevels(img) }));
    } catch (e) {
      setError(isTaintError(e) ? "Auto fix isn't possible for this photo (its server blocks editing)." : String(e));
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (adj.aspect === 'orig') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, posX: adj.posX, posY: adj.posY };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || !img) return;
    const { cw, ch } = cropRect(img.naturalWidth, img.naturalHeight, adj);
    const rect = e.currentTarget.getBoundingClientRect();
    const spareX = img.naturalWidth - cw;
    const spareY = img.naturalHeight - ch;
    const dx = ((e.clientX - d.x) / rect.width) * cw;
    const dy = ((e.clientY - d.y) / rect.height) * ch;
    setAdj((a) => ({
      ...a,
      posX: spareX > 0 ? Math.min(1, Math.max(0, d.posX - dx / spareX)) : 0.5,
      posY: spareY > 0 ? Math.min(1, Math.max(0, d.posY - dy / spareY)) : 0.5,
    }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const addFromPhone = (files: FileList | null) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setExtra((x) => [...x, ...list]);
    setIndex(all.length);
  };

  const slider = (key: 'brightness' | 'contrast' | 'saturation', label: string) => (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Slider
        size="small"
        min={-50}
        max={50}
        value={adj[key]}
        onChange={(_, v) => setAdj((a) => ({ ...a, [key]: v as number }))}
        valueLabelDisplay="auto"
      />
    </Box>
  );

  return (
    <Dialog fullScreen open={open} onClose={onClose}>
      <AppBar position="sticky" color="secondary" elevation={0}>
        <Toolbar variant="dense">
          <IconButton edge="start" color="inherit" onClick={onClose} aria-label="Close"><Close /></IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Photo studio</Typography>
          <Button color="inherit" startIcon={<PhotoLibrary />} onClick={() => fileRef.current?.click()}>From phone</Button>
          <input ref={fileRef} hidden type="file" accept="image/*" onChange={(e) => { addFromPhone(e.target.files); e.target.value = ''; }} />
        </Toolbar>
      </AppBar>
      <Box sx={{ p: { xs: 1.5, sm: 2 }, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 340px' }, alignItems: 'start' }}>
        <Box>
          {all.length > 1 && (
            <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, mb: 1 }}>
              {thumbs.map((t, i) => (
                <Box
                  key={i}
                  component="img"
                  src={t}
                  alt=""
                  onClick={() => {
                    setIndex(i);
                    if (i < sources.length) setTarget(i);
                  }}
                  sx={{
                    width: 64, height: 64, objectFit: 'cover', borderRadius: 1, cursor: 'pointer', flex: '0 0 auto',
                    outline: i === index ? `3px solid ${BRAND_RED}` : '1px solid rgba(0,0,0,0.15)',
                  }}
                />
              ))}
            </Box>
          )}
          <Box sx={{ bgcolor: '#111', borderRadius: 1, minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1 }}>
            {loading && <CircularProgress sx={{ color: '#fff' }} />}
            {!loading && !img && !error && <Typography color="#bbb">Pick a photo</Typography>}
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                display: img ? 'block' : 'none', maxWidth: '100%', maxHeight: '60vh', touchAction: 'none',
                cursor: adj.aspect === 'orig' ? 'default' : 'grab',
              }}
            />
          </Box>
          {adj.aspect !== 'orig' && img && (
            <Typography variant="caption" color="text.secondary">Drag the photo to position the crop.</Typography>
          )}
        </Box>

        <Stack spacing={1.5}>
          {error && <Alert severity="warning">{error}</Alert>}
          {done && <Alert severity="success">{done}</Alert>}
          <Box>
            <Typography variant="caption" color="text.secondary">Crop</Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              fullWidth
              value={adj.aspect}
              onChange={(_, v) => v && setAdj((a) => ({ ...a, aspect: v, posX: 0.5, posY: 0.5 }))}
            >
              <ToggleButton value="orig">Original</ToggleButton>
              <ToggleButton value="1:1">1:1</ToggleButton>
              <ToggleButton value="4:5">4:5</ToggleButton>
              <ToggleButton value="16:9">16:9</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" startIcon={<AutoFixHigh />} onClick={autoFix} disabled={!img} fullWidth>Auto fix</Button>
            <Button variant="outlined" startIcon={<Replay />} onClick={() => setAdj((a) => ({ ...NEUTRAL, aspect: a.aspect, posX: a.posX, posY: a.posY }))} disabled={!img}>
              Reset
            </Button>
          </Stack>
          {slider('brightness', 'Brightness')}
          {slider('contrast', 'Contrast')}
          {slider('saturation', 'Saturation')}

          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ flexGrow: 1 }}>{logo ? 'Logo stamp' : 'Store stamp'}</Typography>
              <Switch checked={wm.on} onChange={(e) => setWm((w) => ({ ...w, on: e.target.checked }))} />
            </Box>
            {!logo && <Typography variant="caption" color="text.secondary">“{stampText}”</Typography>}
            {wm.on && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1, alignItems: 'center' }}>
                <TextField select size="small" label="Corner" value={wm.corner} onChange={(e) => setWm((w) => ({ ...w, corner: e.target.value as Corner }))}>
                  <MenuItem value="br">Bottom right</MenuItem>
                  <MenuItem value="bl">Bottom left</MenuItem>
                  <MenuItem value="tr">Top right</MenuItem>
                  <MenuItem value="tl">Top left</MenuItem>
                </TextField>
                <Box>
                  <Typography variant="caption" color="text.secondary">Opacity</Typography>
                  <Slider size="small" min={0.2} max={1} step={0.05} value={wm.opacity} onChange={(_, v) => setWm((w) => ({ ...w, opacity: v as number }))} />
                </Box>
              </Box>
            )}
          </Box>

          <Button
            variant="outlined"
            startIcon={busy === 'save' ? <CircularProgress size={18} /> : <Download />}
            disabled={!img || !!busy}
            onClick={() =>
              run('save', async () => {
                await saveBlob(await exportBlob(), `${fileBase.replace(/[^\w.-]+/g, '_')}_studio_${index + 1}.jpg`);
                setDone('Saved.');
              })
            }
          >
            Save to phone
          </Button>
          {onApply && (
            <Button
              variant="contained"
              startIcon={busy === 'apply' ? <CircularProgress size={18} color="inherit" /> : <SwapHoriz />}
              disabled={!img || !!busy}
              onClick={() =>
                run('apply', async () => {
                  await onApply(await exportBlob(), target);
                  setDone(`${applyLabel} ✓`);
                })
              }
            >
              {applyLabel}
            </Button>
          )}
          {onApply && sources.length > 1 && (
            <Typography variant="caption" color="text.secondary">
              Replaces photo {target + 1}{index >= sources.length ? ' with this copy from your phone' : ''}.
            </Typography>
          )}
        </Stack>
      </Box>
    </Dialog>
  );
}
