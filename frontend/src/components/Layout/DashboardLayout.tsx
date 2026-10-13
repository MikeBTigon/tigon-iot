import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Collapse,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Chip,
  Menu,
  MenuItem,
  Switch,
  Tooltip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Menu as MenuIcon,
  Logout as LogoutIcon,
  AccountCircle,
  Search as SearchIcon,
  DarkMode,
  LightMode,
  TextIncrease,
  Translate,
  Check,
  ExpandLess,
  ExpandMore,
  Person,
  Settings as SettingsIcon,
  CloudSync,
  DirectionsCar,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { isNativeApp } from '../../native/platform';
import { disablePhoneAlerts } from '../../native/phoneAlerts';
import { LANGUAGES, useLanguage, useT } from '../../i18n';
import { useThemeMode } from '../../ui/themeModeContext';
import { useSetLanguage } from '../../ui/useSetLanguage';
import { activeNavPath, groupOf, navLabel, visibleNav } from '../../ui/navUtils';
import { groupIcon, navIcon } from '../../ui/navIcons';
import { readLocal, writeLocal } from '../../ui/prefs';
import GlobalSearch from '../../ui/GlobalSearch';
import OfflineBanner from '../../ui/OfflineBanner';
import NotifyHost from '../../ui/NotifyHost';
import UpdateBanner from '../../native/UpdateBanner';
import AnnouncementBanner from '../../ui/AnnouncementBanner';
import SetupBanner from '../../ui/onboarding/SetupBanner';
import MpNav, { BOTTOM_NAV_HEIGHT } from '../../ui/MpNav';
import { useMp } from '../../mp/MpDataContext';
import { timeAgo } from '../../mp/cartUtils';

const drawerWidth = 248;
const OPEN_KEY = 'tigon.navOpenGroups';
const ROLE_KEYS: Record<string, string> = { admin: 'shell.roleAdmin', manager: 'shell.roleManager', sales: 'shell.roleSales' };

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const readOpen = (): string[] => {
  try {
    const v = JSON.parse(readLocal(OPEN_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/**
 * Signed-in app frame: top bar (search, account menu), the ONE grouped menu from mp/navRegistry
 * (left drawer; on phones a bottom bar with More → the same drawer), banners (one at a time) and the page.
 */
const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const t = useT();
  const lang = useLanguage();
  const setLanguage = useSetLanguage();
  const { resolved, setMode, largeText, setLargeText } = useThemeMode();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [langAnchor, setLangAnchor] = useState<null | HTMLElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const { profile, users, carts, cartsLoading, syncStatus } = useMp();
  // Admins: people waiting for approval (badge on Accounts, where they are approved).
  const pendingCount = profile?.role === 'admin' ? users.filter((u) => u.status === 'pending').length : 0;
  const navigate = useNavigate();
  const location = useLocation();

  const groups = useMemo(() => visibleNav(profile?.role), [profile?.role]);
  const active = activeNavPath(location.pathname);
  const activeGroup = groupOf(active)?.key;
  // Groups the person opened (remembered on this device); the current page's group starts open.
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => Object.fromEntries(readOpen().map((k) => [k, true])));
  const isOpen = (key: string) => overrides[key] ?? key === activeGroup;
  const toggleGroup = (key: string) => {
    const next = { ...overrides, [key]: !isOpen(key) };
    setOverrides(next);
    writeLocal(OPEN_KEY, JSON.stringify(Object.keys(next).filter((k) => next[k])));
  };

  // Ctrl+K / Cmd+K opens global search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = async () => {
    setAnchorEl(null);
    try {
      // A signed-out phone must stop receiving this user's alerts.
      if (isNativeApp() && currentUser) await disablePhoneAlerts(currentUser.uid).catch(() => undefined);
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  const go = (path: string) => {
    setAnchorEl(null);
    setMobileOpen(false);
    navigate(path);
  };

  const drawer = (
    <nav aria-label={t('layout.mainNav')}>
      <Toolbar>
        <Typography variant="h6" noWrap component="div" color="primary" sx={{ fontWeight: 600 }}>
          TIGON IOT
        </Typography>
      </Toolbar>
      <Divider />
      <List dense disablePadding sx={{ pb: 2 }}>
        {groups.map((g) => {
          const open = isOpen(g.key);
          const single = g.items.length === 1;
          const listId = `nav-group-${g.key.replace(/\W/g, '-')}`;
          // A one-page group (Today) is a plain link, no expand arrow.
          const renderItem = (i: (typeof g.items)[number], nested: boolean) => {
            const selected = i.path === active;
            return (
              <ListItem key={i.path} disablePadding>
                <ListItemButton
                  component={RouterLink}
                  to={i.path}
                  selected={selected}
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => setMobileOpen(false)}
                  sx={{
                    pl: nested ? 3 : 2,
                    minHeight: 40,
                    '&.Mui-selected': {
                      backgroundColor: (th) => alpha(th.palette.primary.main, 0.14),
                      '&:hover': { backgroundColor: (th) => alpha(th.palette.primary.main, 0.22) },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: selected ? 'primary.main' : 'inherit' }}>{navIcon(i.path)}</ListItemIcon>
                  <ListItemText primary={navLabel(t, i)} slotProps={{ primary: { sx: { fontWeight: selected || single ? 600 : 400 } } }} />
                  {i.path === '/mp/accounts' && pendingCount > 0 && (
                    <Chip size="small" color="error" label={pendingCount} aria-label={`${pendingCount} waiting for approval`} />
                  )}
                </ListItemButton>
              </ListItem>
            );
          };
          if (single) return <React.Fragment key={g.key}>{renderItem(g.items[0], false)}</React.Fragment>;
          return (
            <React.Fragment key={g.key}>
              <ListItemButton
                onClick={() => toggleGroup(g.key)}
                aria-expanded={open}
                aria-controls={listId}
                sx={{ minHeight: 40 }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: g.key === activeGroup ? 'primary.main' : 'text.secondary' }}>{groupIcon(g.key)}</ListItemIcon>
                <ListItemText
                  primary={t(g.key, g.label)}
                  slotProps={{ primary: { sx: { fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: 0.8 } } }}
                />
                {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </ListItemButton>
              <Collapse in={open} timeout="auto" unmountOnExit>
                <List id={listId} dense disablePadding>
                  {g.items.map((i) => renderItem(i, true))}
                </List>
              </Collapse>
            </React.Fragment>
          );
        })}
      </List>
    </nav>
  );

  const pickLanguage = (code: (typeof LANGUAGES)[number]['code']) => {
    setLanguage(code);
    setLangAnchor(null);
    setAnchorEl(null);
  };

  const roleLabel = profile ? (ROLE_KEYS[profile.role] ? t(ROLE_KEYS[profile.role]) : profile.role) : '';

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          // Phone apps draw under the status bar / notch; these insets are 0 in a browser.
          pt: 'env(safe-area-inset-top)',
          pl: 'env(safe-area-inset-left)',
          pr: 'env(safe-area-inset-right)',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={t('layout.openMenu')}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
            {t('layout.appTitle')}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title={`${t('layout.search')} (${t('search.shortcut')})`}>
              <IconButton color="inherit" onClick={() => setSearchOpen(true)} aria-label={t('layout.search')} aria-keyshortcuts="Control+K Meta+K">
                <SearchIcon />
              </IconButton>
            </Tooltip>
            <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' } }}>
              {profile?.name || currentUser?.email}
            </Typography>
            <IconButton
              onClick={(e) => setAnchorEl(e.currentTarget)}
              color="inherit"
              aria-label={t('layout.accountMenu')}
              aria-haspopup="menu"
              aria-controls={anchorEl ? 'account-menu' : undefined}
              aria-expanded={anchorEl ? true : undefined}
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main', color: 'secondary.contrastText' }}>
                <AccountCircle />
              </Avatar>
            </IconButton>
          </Box>
          <Menu
            id="account-menu"
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
          >
            <MenuItem onClick={() => go('/settings')}>
              <ListItemIcon><Person fontSize="small" /></ListItemIcon>
              <ListItemText
                primary={profile ? `${profile.name} · ${roleLabel}` : currentUser?.email}
                secondary={profile ? currentUser?.email : undefined}
              />
            </MenuItem>
            {profile && (
              <MenuItem disabled sx={{ '&.Mui-disabled': { opacity: 1 } }}>
                <ListItemIcon><DirectionsCar fontSize="small" /></ListItemIcon>
                <ListItemText secondary={`${t('shell.carts', { count: carts.length })}${cartsLoading ? '+' : ''}`} />
              </MenuItem>
            )}
            {profile && syncStatus?.finishedAt && (
              <MenuItem disabled sx={{ '&.Mui-disabled': { opacity: 1 } }}>
                <ListItemIcon><CloudSync fontSize="small" color={syncStatus.ok ? 'inherit' : 'error'} /></ListItemIcon>
                <ListItemText
                  secondary={syncStatus.ok ? t('shell.dmsSynced', { ago: timeAgo(syncStatus.finishedAt) }) : t('shell.dmsFailed')}
                  slotProps={{ secondary: { color: syncStatus.ok ? 'text.secondary' : 'error' } }}
                />
              </MenuItem>
            )}
            <Divider />
            <MenuItem onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}>
              <ListItemIcon>
                {resolved === 'dark' ? <DarkMode fontSize="small" /> : <LightMode fontSize="small" />}
              </ListItemIcon>
              <ListItemText>{t('prefs.darkMode')}</ListItemText>
              <Switch
                edge="end"
                size="small"
                checked={resolved === 'dark'}
                tabIndex={-1}
                slotProps={{ input: { 'aria-label': t('prefs.darkMode') } }}
              />
            </MenuItem>
            <MenuItem onClick={() => setLargeText(!largeText)}>
              <ListItemIcon><TextIncrease fontSize="small" /></ListItemIcon>
              <ListItemText>{t('prefs.largeText')}</ListItemText>
              <Switch
                edge="end"
                size="small"
                checked={largeText}
                tabIndex={-1}
                slotProps={{ input: { 'aria-label': t('prefs.largeText') } }}
              />
            </MenuItem>
            <MenuItem
              onClick={(e) => setLangAnchor(e.currentTarget)}
              aria-haspopup="menu"
              aria-controls={langAnchor ? 'language-menu' : undefined}
            >
              <ListItemIcon><Translate fontSize="small" /></ListItemIcon>
              <ListItemText secondary={LANGUAGES.find((l) => l.code === lang)?.label}>{t('prefs.language')}</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => go('/settings')}>
              <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t('nav.settings')}</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{t('layout.logout')}</ListItemText>
            </MenuItem>
          </Menu>
          <Menu
            id="language-menu"
            anchorEl={langAnchor}
            open={Boolean(langAnchor)}
            onClose={() => setLangAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            {LANGUAGES.map((l) => (
              <MenuItem key={l.code} lang={l.code} selected={l.code === lang} onClick={() => pickLanguage(l.code)}>
                <ListItemIcon>{l.code === lang ? <Check fontSize="small" /> : null}</ListItemIcon>
                <ListItemText>{l.label}</ListItemText>
              </MenuItem>
            ))}
          </Menu>
        </Toolbar>
      </AppBar>
      <Box
        component="div"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, pt: 'env(safe-area-inset-top)', pb: 'env(safe-area-inset-bottom)' },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, pt: 'env(safe-area-inset-top)' },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          minWidth: 0,
          mt: 'calc(64px + env(safe-area-inset-top))',
          // Room for the phone bottom bar so it never covers the end of the page.
          pb: profile
            ? { xs: `calc(${BOTTOM_NAV_HEIGHT + 24}px + env(safe-area-inset-bottom))`, sm: 'calc(24px + env(safe-area-inset-bottom))' }
            : 'calc(24px + env(safe-area-inset-bottom))',
        }}
      >
        <OfflineBanner />
        <NotifyHost />
        {/* At most one banner at a time: a slot that rendered something hides the slots after it. */}
        <Box sx={{ '& > .banner-slot:not(:empty) ~ .banner-slot': { display: 'none' } }}>
          <div className="banner-slot"><UpdateBanner /></div>
          <div className="banner-slot"><AnnouncementBanner /></div>
          <div className="banner-slot">{profile && <SetupBanner />}</div>
        </Box>
        {children}
      </Box>
      {profile && <MpNav onMore={() => setMobileOpen(true)} />}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Box>
  );
};

export default DashboardLayout;
