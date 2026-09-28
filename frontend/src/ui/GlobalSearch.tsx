import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query, where, type Query } from 'firebase/firestore';
import {
  Box, Chip, Dialog, DialogContent, IconButton, InputAdornment, LinearProgress, List, ListItemButton, ListItemIcon,
  ListItemText, ListSubheader, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import {
  Close, Dashboard, Description, Devices, DirectionsCar, Download, History, ListAlt, People, PersonSearch, Search,
  Settings,
} from '@mui/icons-material';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useMp } from '../mp/MpDataContext';
import { COLLECTIONS } from '../mp/constants';
import { cartTitle } from '../mp/cartLogic';
import { formatPrice } from '../mp/cartUtils';
import type { Customer, Lead } from '../mp/growthTypes';
import type { DeviceDoc, QueueItem } from '../mp/types';
import { HELP_ARTICLES, articleText } from '../mp/help/articles';
import { useLanguage, useT } from '../i18n';
import { navIcon } from './navIcons';
import { visibleNavItems } from './navUtils';
import { readLocal, writeLocal } from './prefs';

type GroupKey = 'pages' | 'help' | 'carts' | 'devices' | 'queue' | 'leads' | 'customers';

interface Hit {
  id: string;
  group: GroupKey;
  title: string;
  subtitle?: string;
  to: string;
  icon: React.ReactNode;
  /** Lower-case text the query is matched against. */
  hay: string;
}

interface Remote {
  key: string;
  at: number;
  devices: DeviceDoc[];
  queue: QueueItem[];
  leads: Lead[];
  customers: Customer[];
}

const RECENT_KEY = 'tigon.recentSearches';
const GROUP_ORDER: GroupKey[] = ['pages', 'carts', 'leads', 'customers', 'queue', 'devices', 'help'];
const GROUP_LIMIT: Record<GroupKey, number> = { pages: 5, help: 3, carts: 8, devices: 5, queue: 5, leads: 6, customers: 6 };
const CACHE_MS = 5 * 60 * 1000;

/** Collections fetched when the dialog opens; kept for 5 minutes across page changes. */
let remoteCache: Remote | null = null;

function loadRecent(): string[] {
  try {
    const v = JSON.parse(readLocal(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

const settle = async <T,>(q: Query | null): Promise<T[]> => {
  if (!q) return [];
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
  } catch (e) {
    console.warn('Search source unavailable', e);
    return [];
  }
};

const join = (...parts: Array<string | number | undefined | null>) => parts.filter((p) => p !== undefined && p !== null && p !== '').join(' · ');

/**
 * Ctrl/Cmd+K search across pages, help, carts (already loaded), and — fetched when opened — phones,
 * the posting queue, leads (members: their own) and customers. ↑/↓ + Enter to open, recent searches kept locally.
 */
const GlobalSearch: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const t = useT();
  const lang = useLanguage();
  const navigate = useNavigate();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { currentUser } = useAuth();
  const { profile, carts, ensureCartsLoaded, userName } = useMp();
  const uid = currentUser?.uid || '';
  const role = profile?.role;
  const isManager = role === 'manager' || role === 'admin';
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const cacheKey = `${uid}:${role || 'none'}`;
  const [remote, setRemote] = useState<Remote | null>(() =>
    remoteCache && remoteCache.key === cacheKey && Date.now() - remoteCache.at < CACHE_MS ? remoteCache : null);
  const loading = open && (!remote || remote.key !== cacheKey);

  // Lazy-load the non-cart collections when the dialog opens.
  useEffect(() => {
    if (!open || !uid) return;
    if (profile) ensureCartsLoaded();
    if (remoteCache && remoteCache.key === cacheKey && Date.now() - remoteCache.at < CACHE_MS) return;
    let cancelled = false;
    const devicesQ = isManager
      ? query(collection(db, 'devices'))
      : query(collection(db, 'devices'), where('userId', '==', uid));
    const member = !!profile;
    Promise.all([
      settle<DeviceDoc>(devicesQ),
      settle<QueueItem>(member ? query(collection(db, COLLECTIONS.queue), orderBy('createdAt', 'desc'), limit(300)) : null),
      settle<Lead>(member
        ? isManager
          ? query(collection(db, COLLECTIONS.leads), orderBy('updatedAt', 'desc'), limit(500))
          : query(collection(db, COLLECTIONS.leads), where('ownerUid', '==', uid))
        : null),
      settle<Customer>(member ? query(collection(db, COLLECTIONS.customers), limit(1000)) : null),
    ]).then(([devices, queue, leads, customers]) => {
      remoteCache = { key: cacheKey, at: Date.now(), devices, queue, leads, customers };
      if (!cancelled) setRemote(remoteCache);
    });
    return () => {
      cancelled = true;
    };
  }, [open, uid, cacheKey, isManager, profile, ensureCartsLoaded]);

  // Static entries: pages + help articles.
  const staticHits = useMemo<Hit[]>(() => {
    const base: Hit[] = [
      { id: 'p-dashboard', group: 'pages', title: t('layout.dashboard'), to: '/dashboard', icon: <Dashboard />, hay: '' },
      { id: 'p-devices', group: 'pages', title: t('layout.devices'), to: '/devices', icon: <Devices />, hay: 'phones pair' },
      { id: 'p-settings', group: 'pages', title: t('layout.settings'), to: '/settings', icon: <Settings />, hay: '' },
      { id: 'p-download', group: 'pages', title: t('layout.download'), to: '/download', icon: <Download />, hay: 'app install' },
    ];
    const mp: Hit[] = profile
      ? [
        ...visibleNavItems(role).map((i) => ({
          id: `p-${i.path}`, group: 'pages' as const, title: t(i.key), subtitle: i.path, to: i.path, icon: navIcon(i.path), hay: i.label,
        })),
        { id: 'p-welcome', group: 'pages', title: t('nav.welcome'), to: '/mp/welcome', icon: navIcon('/mp/help'), hay: 'onboarding setup' },
      ]
      : [];
    const help: Hit[] = profile
      ? HELP_ARTICLES.map((a) => {
        const text = articleText(a, lang);
        return {
          id: `h-${a.id}`, group: 'help' as const, title: text.title, subtitle: text.summary, to: `/mp/help?a=${a.id}`,
          icon: <Description />, hay: `${a.keywords} ${a.text.en.title}`,
        };
      })
      : [];
    return [...base, ...mp, ...help].map((h) => ({ ...h, hay: `${h.title} ${h.subtitle || ''} ${h.hay}`.toLowerCase() }));
  }, [t, lang, profile, role]);

  const tokens = useMemo(() => q.toLowerCase().split(/\s+/).filter(Boolean), [q]);
  const searching = q.trim().length >= 2;

  const hits = useMemo<Hit[]>(() => {
    if (!searching) return [];
    const match = (hay: string) => tokens.every((tok) => hay.includes(tok));
    const out: Record<GroupKey, Hit[]> = { pages: [], help: [], carts: [], devices: [], queue: [], leads: [], customers: [] };
    const push = (h: Hit) => {
      if (out[h.group].length < GROUP_LIMIT[h.group] && match(h.hay)) out[h.group].push(h);
    };
    staticHits.forEach(push);
    for (const c of carts) {
      if (out.carts.length >= GROUP_LIMIT.carts) break;
      const title = cartTitle(c);
      const hay = [title, c.make, c.model, c.year, c.color, c.serial, c.vin, c.dmsId, c.id, c.locationId, c.invoice]
        .join(' ').toLowerCase();
      push({
        id: `c-${c.docId}`, group: 'carts', title, subtitle: join(c.locationId, c.serial && `#${c.serial}`, c.price ? formatPrice(c.price) : ''),
        to: `/mp/cart/${c.docId}`, icon: <DirectionsCar />, hay,
      });
    }
    if (remote) {
      for (const d of remote.devices) {
        push({
          id: `d-${d.id}`, group: 'devices', title: d.deviceName || d.model || d.id,
          subtitle: join(d.model, d.platform, userName(d.userId)), to: '/devices', icon: <Devices />,
          hay: [d.deviceName, d.model, d.platform, d.id, userName(d.userId)].join(' ').toLowerCase(),
        });
      }
      for (const it of remote.queue) {
        push({
          id: `q-${it.id}`, group: 'queue', title: it.cartTitle || it.cartId,
          subtitle: join(it.status, it.accountName, userName(it.assignedUserId)), to: `/mp/post/${it.id}`, icon: <ListAlt />,
          hay: [it.cartTitle, it.cartId, it.status, it.accountName, it.locationId, userName(it.assignedUserId)].join(' ').toLowerCase(),
        });
      }
      for (const l of remote.leads) {
        push({
          id: `l-${l.id}`, group: 'leads', title: l.name || l.phone || l.email,
          subtitle: join(l.status, l.phone, l.email, l.cartTitle), to: `/mp/leads?lead=${l.id}`, icon: <PersonSearch />,
          hay: [l.name, l.phone, l.email, l.cartTitle, l.status, l.channel, l.notes].join(' ').toLowerCase(),
        });
      }
      for (const c of remote.customers) {
        push({
          id: `u-${c.id}`, group: 'customers', title: c.name || c.phone || c.email,
          subtitle: join(c.phone, c.email, c.locationId), to: `/mp/customers?customer=${c.id}`, icon: <People />,
          hay: [c.name, c.phone, c.email, c.locationId, ...(c.tags || [])].join(' ').toLowerCase(),
        });
      }
    }
    return GROUP_ORDER.flatMap((g) => out[g]);
  }, [searching, tokens, staticHits, carts, remote, userName]);

  const safeIdx = Math.min(activeIdx, Math.max(hits.length - 1, 0));

  const close = () => {
    setQ('');
    setActiveIdx(0);
    onClose();
  };

  const go = (h: Hit) => {
    if (q.trim().length >= 2) {
      const next = [q.trim(), ...recent.filter((r) => r.toLowerCase() !== q.trim().toLowerCase())].slice(0, 6);
      setRecent(next);
      writeLocal(RECENT_KEY, JSON.stringify(next));
    }
    close();
    navigate(h.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!hits.length) return;
    let idx = safeIdx;
    if (e.key === 'ArrowDown') idx = (safeIdx + 1) % hits.length;
    else if (e.key === 'ArrowUp') idx = (safeIdx - 1 + hits.length) % hits.length;
    else if (e.key === 'Enter') {
      e.preventDefault();
      go(hits[safeIdx]);
      return;
    } else return;
    e.preventDefault();
    setActiveIdx(idx);
    requestAnimationFrame(() => document.getElementById(`gs-opt-${idx}`)?.scrollIntoView({ block: 'nearest' }));
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
      aria-labelledby="gs-title"
      slotProps={{ paper: { sx: { alignSelf: { sm: 'flex-start' }, mt: { sm: 8 } } } }}
    >
      <Typography id="gs-title" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {t('search.title')}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, pt: fullScreen ? 'calc(12px + env(safe-area-inset-top))' : 1.5 }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          value={q}
          placeholder={t('search.placeholder')}
          onChange={(e) => {
            setQ(e.target.value);
            setActiveIdx(0);
          }}
          onKeyDown={onKeyDown}
          slotProps={{
            htmlInput: {
              role: 'combobox',
              'aria-label': t('search.title'),
              'aria-expanded': hits.length > 0,
              'aria-controls': 'gs-listbox',
              'aria-autocomplete': 'list',
              'aria-activedescendant': hits.length ? `gs-opt-${safeIdx}` : undefined,
              enterKeyHint: 'search',
            },
            input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> },
          }}
        />
        <IconButton aria-label={t('search.close')} onClick={close}><Close /></IconButton>
      </Box>
      {loading && searching && <LinearProgress aria-label={t('search.loading')} />}
      <DialogContent dividers sx={{ p: 0, minHeight: 200 }}>
        {!searching && (
          <Box sx={{ p: 2 }}>
            {recent.length > 0 && (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <History fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} aria-hidden />
                  <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>{t('search.recent')}</Typography>
                  <Chip
                    size="small"
                    label={t('search.clearRecent')}
                    onClick={() => {
                      setRecent([]);
                      writeLocal(RECENT_KEY, null);
                    }}
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  {recent.map((r) => <Chip key={r} label={r} variant="outlined" onClick={() => setQ(r)} />)}
                </Box>
              </>
            )}
            <Typography variant="body2" color="text.secondary">{t('search.hint')}</Typography>
          </Box>
        )}
        {searching && hits.length === 0 && !loading && (
          <Typography sx={{ p: 2 }} color="text.secondary">{t('search.noResults', { q: q.trim() })}</Typography>
        )}
        {hits.length > 0 && (
          <List id="gs-listbox" role="listbox" dense aria-label={t('search.title')} sx={{ py: 0 }}>
            {hits.map((h, i) => {
              const header = i === 0 || hits[i - 1].group !== h.group ? h.group : null;
              return (
                <React.Fragment key={h.id}>
                  {header && (
                    <ListSubheader role="presentation" sx={{ lineHeight: '32px', bgcolor: 'background.paper' }}>
                      {t(`search.${header}`)}
                    </ListSubheader>
                  )}
                  <ListItemButton
                    id={`gs-opt-${i}`}
                    role="option"
                    aria-selected={i === safeIdx}
                    selected={i === safeIdx}
                    onClick={() => go(h)}
                    onMouseMove={() => i !== safeIdx && setActiveIdx(i)}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>{h.icon}</ListItemIcon>
                    <ListItemText
                      primary={h.title}
                      secondary={h.subtitle}
                      slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
                    />
                  </ListItemButton>
                </React.Fragment>
              );
            })}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GlobalSearch;
