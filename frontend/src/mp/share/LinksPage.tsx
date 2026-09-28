import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, FormControl, IconButton, InputLabel, LinearProgress, MenuItem, Paper, Select,
  Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { ContentCopy, Delete, EmojiEvents, IosShare, Refresh, Science } from '@mui/icons-material';
import { db } from '../../config/firebase';
import MpShell from '../components/MpShell';
import CartPhoto from '../components/CartPhoto';
import { useMp } from '../MpDataContext';
import { cartTitle, generateVariations } from '../cartLogic';
import { formatPrice, timeAgo, workingPhotos } from '../cartUtils';
import { COLLECTIONS, shortLinkUrl } from '../constants';
import { copyText } from '../../native/actions';
import { logEvent } from '../../native/deviceSession';
import { writeAudit } from '../audit';
import type { Click, SharePlatform } from '../growthTypes';
import type { MpCart } from '../types';
import { buildCaption, createShortLink, PLATFORM_LABEL, randomCode, type ShortLinkDoc } from './links';
import { shareTo } from './shareActions';

const DAY = 86_400_000;
const AB_PLATFORMS: SharePlatform[] = ['facebook', 'instagram', 'whatsapp', 'tiktok', 'x', 'sms', 'email', 'other'];

/** Rows of [label, count] as a compact bar list. */
const BarList: React.FC<{ title: string; rows: Array<[string, number]> }> = ({ title, rows }) => {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>{title}</Typography>
      {rows.length === 0 && <Typography color="text.secondary" variant="body2">No clicks yet.</Typography>}
      {rows.map(([label, n]) => (
        <Box key={label} sx={{ mb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="body2" noWrap>{label}</Typography>
            <Typography variant="body2" fontWeight={700}>{n}</Typography>
          </Box>
          <LinearProgress variant="determinate" value={(n / max) * 100} sx={{ height: 6, borderRadius: 3 }} />
        </Box>
      ))}
    </Paper>
  );
};

const countBy = <T,>(items: T[], key: (t: T) => string, weight: (t: T) => number = () => 1): Array<[string, number]> => {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) || 0) + weight(it));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

interface AbCreated {
  abTestId: string;
  cart: MpCart;
  platform: SharePlatform;
  variants: Array<{ variant: 'A' | 'B'; title: string; photo: string; link: string; caption: string; captionTitle: string }>;
}

/** Links & A/B: your tracked links, click stats and simple title/photo A/B tests. */
const LinksPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, carts, userName, brokenPhotos } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const uid = profile?.uid || '';
  const [tab, setTab] = useState<'links' | 'ab' | 'clicks'>('links');
  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const [links, setLinks] = useState<ShortLinkDoc[] | null>(null);
  const [clicks, setClicks] = useState<Click[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [since] = useState(() => Date.now() - 30 * DAY);

  // A/B creator
  const [abCart, setAbCart] = useState<MpCart | null>(null);
  const [abPlatform, setAbPlatform] = useState<SharePlatform>('facebook');
  const [titleA, setTitleA] = useState('');
  const [titleB, setTitleB] = useState('');
  const [photoA, setPhotoA] = useState('');
  const [photoB, setPhotoB] = useState('');
  const [abBusy, setAbBusy] = useState(false);
  const [abCreated, setAbCreated] = useState<AbCreated | null>(null);

  useEffect(() => {
    if (!profile) return;
    let live = true;
    const teamView = isManager && scope === 'team';
    const linkQ = teamView
      ? query(collection(db, COLLECTIONS.links), orderBy('createdAt', 'desc'), limit(2000))
      : query(collection(db, COLLECTIONS.links), where('userId', '==', uid), limit(2000));
    // Members may only read their own clicks (rules); managers read all and filter by date server-side.
    const clickQ = isManager
      ? query(collection(db, COLLECTIONS.clicks), where('ts', '>=', since), limit(10000))
      : query(collection(db, COLLECTIONS.clicks), where('userId', '==', uid), limit(10000));
    Promise.all([getDocs(linkQ), getDocs(clickQ)])
      .then(([ls, cs]) => {
        if (!live) return;
        setLinks(ls.docs.map((d) => ({ ...(d.data() as Omit<ShortLinkDoc, 'id'>), id: d.id })).sort((a, b) => b.createdAt - a.createdAt));
        setClicks(cs.docs.map((d) => ({ ...(d.data() as Click), id: d.id })).filter((c) => c.ts >= since && (!teamView ? c.userId === uid : true)));
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [profile, isManager, scope, uid, since, reload]);

  const cartById = useMemo(() => new Map(carts.map((c) => [c.docId, c])), [carts]);
  const byPlatform = useMemo(() => {
    const m = new Map<string, { links: number; clicks: number }>();
    for (const l of links || []) {
      const e = m.get(l.platform) || { links: 0, clicks: 0 };
      e.links++;
      e.clicks += l.clicks || 0;
      m.set(l.platform, e);
    }
    return [...m.entries()].sort((a, b) => b[1].clicks - a[1].clicks);
  }, [links]);

  const abTests = useMemo(() => {
    const m = new Map<string, ShortLinkDoc[]>();
    for (const l of links || []) if (l.abTestId) m.set(l.abTestId, [...(m.get(l.abTestId) || []), l]);
    return [...m.entries()].map(([id, ls]) => ({ id, a: ls.find((l) => l.variant === 'A'), b: ls.find((l) => l.variant === 'B'), createdAt: Math.max(...ls.map((l) => l.createdAt)) }))
      .sort((x, y) => y.createdAt - x.createdAt);
  }, [links]);

  const abVariations = useMemo(() => (abCart ? generateVariations(abCart, uid) : []), [abCart, uid]);
  const abPhotos = useMemo(() => (abCart ? workingPhotos(abCart, brokenPhotos) : []), [abCart, brokenPhotos]);

  const pickAbCart = (c: MpCart | null) => {
    setAbCart(c);
    setAbCreated(null);
    if (!c) return;
    const v = generateVariations(c, uid);
    setTitleA(`${v[0].title1} – ${v[0].title2}`);
    setTitleB(`${v[1].title1} – ${v[1].title2}`);
    const ph = workingPhotos(c, brokenPhotos);
    setPhotoA(ph[0] || '');
    setPhotoB(ph[1] || ph[0] || '');
  };

  const createAb = async () => {
    if (!abCart || !titleA.trim() || !titleB.trim()) return;
    setAbBusy(true);
    setError('');
    try {
      const abTestId = `ab_${randomCode(10)}`;
      const listing = abVariations[0];
      const variants: AbCreated['variants'] = [];
      for (const [variant, title, photo] of [['A', titleA.trim(), photoA], ['B', titleB.trim(), photoB]] as const) {
        const photoNo = photo ? abPhotos.indexOf(photo) + 1 : 0;
        const link = await createShortLink({
          cart: abCart, platform: abPlatform, campaign: `ab_test`, variant, abTestId,
          variantLabel: `${title}${photoNo ? ` · photo ${photoNo}` : ''}`,
        });
        const caption = buildCaption({ ...listing, title1: title, title2: '' }, abCart, link, abPlatform);
        variants.push({ variant, title, photo, link, caption: caption.text, captionTitle: caption.title });
      }
      setAbCreated({ abTestId, cart: abCart, platform: abPlatform, variants });
      writeAudit(profile, 'ab_test_create', abCart.docId, `${abPlatform} ${abTestId}`);
      setReload((r) => r + 1);
    } catch (e) {
      setError((e as Error).message || 'Could not create the test.');
    } finally {
      setAbBusy(false);
    }
  };

  const shareVariant = async (v: AbCreated['variants'][number]) => {
    if (!abCreated) return;
    try {
      const res = await shareTo({ platform: abCreated.platform, cart: abCreated.cart, title: v.captionTitle, text: v.caption, link: v.link, photos: v.photo ? [v.photo] : [] });
      if (res.retry) setError(`${res.message} Tap Share again.`);
      logEvent(uid, 'share', { cartId: abCreated.cart.docId, message: `${abCreated.platform}:ab${v.variant}` });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    }
  };

  const removeLink = async (l: ShortLinkDoc) => {
    if (!window.confirm(`Delete link ${l.id}? It will stop redirecting.`)) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.links, l.id));
      writeAudit(profile, 'link_delete', l.id, l.cartTitle || l.cartId);
      setLinks((ls) => (ls || []).filter((x) => x.id !== l.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const cartLabel = (l: ShortLinkDoc) => {
    const c = cartById.get(l.cartId);
    return c ? `${c.year} ${cartTitle(c)}` : l.cartTitle || (l.cartId ? l.cartId : 'Storefront');
  };
  const cartOptionLabel = (c: MpCart) => `${c.year} ${cartTitle(c)} · ${formatPrice(c.price)}`;
  const phoneLabel = (id: string) => (id === 'web' ? 'Website (no phone)' : `Phone …${id.slice(-8)}`);
  const totalClicks = (links || []).reduce((s, l) => s + (l.clicks || 0), 0);

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Links & A/B</Typography>
        {isManager && (
          <Tabs value={scope} onChange={(_, v) => setScope(v)}>
            <Tab value="mine" label="Mine" />
            <Tab value="team" label="Team" />
          </Tabs>
        )}
        <IconButton onClick={() => setReload((r) => r + 1)} title="Refresh"><Refresh /></IconButton>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2 }}>
        <Tab value="links" label="Links" />
        <Tab value="ab" label="A/B tests" />
        <Tab value="clicks" label="Clicks (30 days)" />
      </Tabs>

      {!links || !clicks ? <CircularProgress /> : (
        <>
          {tab === 'links' && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1, mb: 2 }}>
                <Paper sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">All links</Typography>
                  <Typography variant="h6">{links.length} · {totalClicks} clicks</Typography>
                </Paper>
                {byPlatform.map(([p, v]) => (
                  <Paper key={p} sx={{ p: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">{PLATFORM_LABEL[p as SharePlatform] || p}</Typography>
                    <Typography variant="h6">{v.clicks} <Typography component="span" variant="body2" color="text.secondary">clicks · {v.links} links</Typography></Typography>
                  </Paper>
                ))}
              </Box>
              <Paper sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Link</TableCell>
                      <TableCell>Platform</TableCell>
                      <TableCell>Cart</TableCell>
                      <TableCell align="right">Clicks</TableCell>
                      <TableCell>Created</TableCell>
                      {scope === 'team' && <TableCell>By</TableCell>}
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {links.length === 0 && (
                      <TableRow><TableCell colSpan={7}>No links yet — use Share Kit on a cart page.</TableCell></TableRow>
                    )}
                    {links.slice(0, 500).map((l) => (
                      <TableRow key={l.id} hover>
                        <TableCell sx={{ fontFamily: 'monospace' }}>/l/{l.id}</TableCell>
                        <TableCell>
                          <Chip size="small" label={`${PLATFORM_LABEL[l.platform] || l.platform}${l.variant ? ` · ${l.variant}` : ''}`} />
                        </TableCell>
                        <TableCell
                          sx={{ cursor: l.cartId ? 'pointer' : 'default', maxWidth: 260 }}
                          onClick={() => l.cartId && cartById.has(l.cartId) && navigate(`/mp/cart/${l.cartId}`)}
                        >
                          <Typography variant="body2" noWrap>{cartLabel(l)}</Typography>
                          <Typography variant="caption" color="text.secondary">{l.campaign}</Typography>
                        </TableCell>
                        <TableCell align="right"><b>{l.clicks || 0}</b></TableCell>
                        <TableCell>{timeAgo(l.createdAt)}</TableCell>
                        {scope === 'team' && <TableCell>{userName(l.userId)}</TableCell>}
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Tooltip title="Copy link"><IconButton size="small" onClick={() => copyText(shortLinkUrl(l.id))}><ContentCopy fontSize="small" /></IconButton></Tooltip>
                          {isManager && <Tooltip title="Delete"><IconButton size="small" onClick={() => removeLink(l)}><Delete fontSize="small" /></IconButton></Tooltip>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </>
          )}

          {tab === 'ab' && (
            <>
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom><Science fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />New A/B test</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Post the same cart twice with two different titles (and photos). Each version gets its own link — the one with more clicks wins.
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, gap: 2, mb: 2 }}>
                  <Autocomplete
                    options={carts}
                    value={abCart}
                    onChange={(_, v) => pickAbCart(v)}
                    getOptionLabel={cartOptionLabel}
                    isOptionEqualToValue={(a, b) => a.docId === b.docId}
                    filterOptions={(opts, s) => {
                      const q = s.inputValue.toLowerCase().trim();
                      return (q ? opts.filter((c) => `${cartOptionLabel(c)} ${c.serial} ${c.locationId}`.toLowerCase().includes(q)) : opts).slice(0, 50);
                    }}
                    renderInput={(p) => <TextField {...p} label="Cart" placeholder="Search carts" />}
                  />
                  <FormControl>
                    <InputLabel>Platform</InputLabel>
                    <Select label="Platform" value={abPlatform} onChange={(e) => setAbPlatform(e.target.value as SharePlatform)}>
                      {AB_PLATFORMS.map((p) => <MenuItem key={p} value={p}>{PLATFORM_LABEL[p]}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Box>
                {abCart && (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                    {([['A', titleA, setTitleA, photoA, setPhotoA], ['B', titleB, setTitleB, photoB, setPhotoB]] as const).map(([v, title, setTitle, photo, setPhoto]) => (
                      <Paper key={v} variant="outlined" sx={{ p: 1.5 }}>
                        <Typography fontWeight={700} gutterBottom>Version {v}</Typography>
                        <TextField fullWidth size="small" label={`Title ${v}`} value={title} onChange={(e) => setTitle(e.target.value)} sx={{ mb: 1 }} />
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                          {abVariations.slice(0, 5).map((x, i) => (
                            <Chip key={i} size="small" variant="outlined" label={x.title1} onClick={() => setTitle(`${x.title1} – ${x.title2}`)} />
                          ))}
                        </Box>
                        {abPhotos.length > 0 && (
                          <>
                            <Typography variant="caption" color="text.secondary">Photo (optional)</Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, overflowX: 'auto', pb: 0.5 }}>
                              {abPhotos.slice(0, 10).map((p) => (
                                <Box key={p} onClick={() => setPhoto(photo === p ? '' : p)} sx={{ width: 64, flexShrink: 0, cursor: 'pointer', outline: photo === p ? '3px solid #af1f31' : 'none', borderRadius: 0.5, overflow: 'hidden' }}>
                                  <CartPhoto file={p} height={48} />
                                </Box>
                              ))}
                            </Box>
                          </>
                        )}
                      </Paper>
                    ))}
                  </Box>
                )}
                <Button sx={{ mt: 2 }} variant="contained" disabled={!abCart || abBusy || !titleA.trim() || !titleB.trim() || titleA.trim() === titleB.trim()} onClick={createAb}
                  startIcon={abBusy ? <CircularProgress size={18} color="inherit" /> : <Science />}>
                  Create test links
                </Button>
                {abCreated && (
                  <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                    {abCreated.variants.map((v) => (
                      <Paper key={v.variant} variant="outlined" sx={{ p: 1.5 }}>
                        <Typography fontWeight={700}>Version {v.variant} — post this</Typography>
                        <TextField value={v.caption} multiline fullWidth minRows={4} maxRows={10} sx={{ my: 1 }} slotProps={{ input: { readOnly: true } }} />
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          <Button size="small" startIcon={<ContentCopy />} onClick={() => copyText(v.caption)}>Copy</Button>
                          <Button size="small" variant="contained" startIcon={<IosShare />} onClick={() => shareVariant(v)}>Share {PLATFORM_LABEL[abCreated.platform]}</Button>
                        </Box>
                      </Paper>
                    ))}
                  </Box>
                )}
              </Paper>

              <Paper sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Test</TableCell>
                      <TableCell>Version A</TableCell>
                      <TableCell>Version B</TableCell>
                      <TableCell>Result</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {abTests.length === 0 && <TableRow><TableCell colSpan={4}>No A/B tests yet.</TableCell></TableRow>}
                    {abTests.map((t) => {
                      const a = t.a?.clicks || 0;
                      const b = t.b?.clicks || 0;
                      const total = a + b;
                      const lead = total < 20 ? '' : a === b ? 'tie' : a > b ? 'A' : 'B';
                      const any = t.a || t.b;
                      return (
                        <TableRow key={t.id}>
                          <TableCell sx={{ maxWidth: 220 }}>
                            <Typography variant="body2" noWrap>{any ? cartLabel(any) : t.id}</Typography>
                            <Typography variant="caption" color="text.secondary">{any ? PLATFORM_LABEL[any.platform] : ''} · {timeAgo(t.createdAt)}</Typography>
                          </TableCell>
                          {[t.a, t.b].map((l, i) => (
                            <TableCell key={i} sx={{ maxWidth: 220, bgcolor: lead === (i ? 'B' : 'A') ? 'rgba(76,175,80,0.12)' : undefined }}>
                              <Typography variant="body2" fontWeight={700}>{l?.clicks || 0} clicks</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>{l?.variantLabel || '—'}</Typography>
                            </TableCell>
                          ))}
                          <TableCell>
                            {!lead ? <Chip size="small" label={`Needs more clicks (${total}/20)`} />
                              : lead === 'tie' ? <Chip size="small" label="Tied" />
                              : <Chip size="small" color="success" icon={<EmojiEvents />} label={`${lead} is leading`} />}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Paper>
            </>
          )}

          {tab === 'clicks' && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {clicks.length} click{clicks.length === 1 ? '' : 's'} in the last 30 days{isManager && scope === 'team' ? ' (whole team)' : ' on your links'}. Link-preview bots are not counted.
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                <BarList title="By platform" rows={countBy(clicks, (c) => PLATFORM_LABEL[c.platform] || c.platform)} />
                <BarList title="By phone" rows={countBy(clicks, (c) => `${phoneLabel(c.deviceId)}${scope === 'team' ? ` · ${userName(c.userId)}` : ''}`)} />
                <BarList title="By person" rows={countBy(clicks, (c) => userName(c.userId))} />
              </Box>
            </>
          )}
        </>
      )}
    </MpShell>
  );
};

export default LinksPage;
