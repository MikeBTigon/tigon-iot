import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
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
  ListSubheader,
  Avatar,
  Menu,
  MenuItem,
  Switch,
  Tooltip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Devices as DevicesIcon,
  Settings as SettingsIcon,
  Download as DownloadIcon,
  Storefront as StorefrontIcon,
  Logout as LogoutIcon,
  AccountCircle,
  AddAPhoto,
  ListAlt,
  PersonSearch,
  Search as SearchIcon,
  DarkMode,
  LightMode,
  TextIncrease,
  Translate,
  Check,
  HelpOutline,
  Insights,
  AddLink,
  Language as WebsiteIcon,
  Webhook,
  AccountTree,
  Inbox,
  Email,
  Tune,
  NotificationImportant,
  People as PeopleIcon,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { isNativeApp } from '../../native/platform';
import { disablePhoneAlerts } from '../../native/phoneAlerts';
import { LANGUAGES, useLanguage, useT } from '../../i18n';
import { useThemeMode } from '../../ui/themeModeContext';
import { useSetLanguage } from '../../ui/useSetLanguage';
import { activeNavPath } from '../../ui/navUtils';
import GlobalSearch from '../../ui/GlobalSearch';
import OfflineBanner from '../../ui/OfflineBanner';
import NotifyHost from '../../ui/NotifyHost';
import UpdateBanner from '../../native/UpdateBanner';
import { useMp } from '../../mp/MpDataContext';
import { WH_NAV, activeWhPath } from '../../wh/nav';

const WH_ICONS: Record<string, React.ReactNode> = {
  '/wh': <Insights />,
  '/wh/triage': <NotificationImportant />,
  '/wh/new': <AddLink />,
  '/wh/websites': <WebsiteIcon />,
  '/wh/webhooks': <Webhook />,
  '/wh/flows': <AccountTree />,
  '/wh/submissions': <Inbox />,
  '/wh/templates': <Email />,
  '/wh/settings': <Tune />,
};

const drawerWidth = 240;

interface DashboardLayoutProps {
  children: React.ReactNode;
}

interface NavEntry {
  text: string;
  icon: React.ReactNode;
  path: string;
}

/** Marketplace shortcuts that get their own sidebar entry (the rest of /mp/* highlights "MP Assistant"). */
const MP_SHORTCUTS = ['/mp/new', '/mp/queue', '/mp/leads'];

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
  const { profile } = useMp();
  const navigate = useNavigate();
  const location = useLocation();

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

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      // A signed-out phone must stop receiving this user's alerts.
      if (isNativeApp() && currentUser) await disablePhoneAlerts(currentUser.uid).catch(() => undefined);
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  const canSeeUsers = profile?.role === 'admin' || profile?.role === 'manager';
  const menuItems: NavEntry[] = [
    { text: t('layout.dashboard'), icon: <DashboardIcon />, path: '/dashboard' },
    { text: t('layout.devices'), icon: <DevicesIcon />, path: '/devices' },
    // People who use TIGON IOT, their phones and online hours (managers and admins).
    ...(canSeeUsers ? [{ text: 'Users', icon: <PeopleIcon />, path: '/users' }] : []),
    { text: t('layout.settings'), icon: <SettingsIcon />, path: '/settings' },
    { text: t('layout.download'), icon: <DownloadIcon />, path: '/download' },
  ];

  // Parallel module: Facebook Marketplace posting (Tigon MP Assistant) + its most-used pages.
  const marketplaceItems: NavEntry[] = [
    { text: t('layout.mpAssistant'), icon: <StorefrontIcon />, path: '/mp' },
    { text: t('nav.new'), icon: <AddAPhoto />, path: '/mp/new' },
    { text: t('nav.queue'), icon: <ListAlt />, path: '/mp/queue' },
    { text: t('nav.leads'), icon: <PersonSearch />, path: '/mp/leads' },
    { text: t('nav.help'), icon: <HelpOutline />, path: '/mp/help' },
  ];

  // Webhook Flows (website forms → email / Sheets / DMS / GA4): managers and admins.
  const isMpManager = profile?.role === 'admin' || profile?.role === 'manager';
  const webhookItems: NavEntry[] = isMpManager
    ? WH_NAV.filter((i) => !i.admin || profile?.role === 'admin')
      .map((i) => ({ text: i.label, icon: WH_ICONS[i.path], path: i.path }))
    : [];

  const activeMp = activeNavPath(location.pathname);
  const isSelected = (path: string) => {
    if (path === '/wh' || path.startsWith('/wh/')) return activeWhPath(location.pathname) === path;
    if (path === '/mp') {
      return (location.pathname === '/mp' || location.pathname.startsWith('/mp/'))
        && !MP_SHORTCUTS.includes(activeMp) && activeMp !== '/mp/help';
    }
    if (path.startsWith('/mp/')) return activeMp === path;
    if (path === '/users') return location.pathname === '/users' || location.pathname.startsWith('/users/');
    return location.pathname === path;
  };

  const renderNavItems = (items: NavEntry[]) =>
    items.map((item) => {
      const selected = isSelected(item.path);
      return (
        <ListItem key={item.path} disablePadding>
          <ListItemButton
            selected={selected}
            aria-current={selected ? 'page' : undefined}
            onClick={() => {
              navigate(item.path);
              setMobileOpen(false);
            }}
            sx={{
              '&.Mui-selected': {
                backgroundColor: (th) => alpha(th.palette.primary.main, 0.14),
                '&:hover': {
                  backgroundColor: (th) => alpha(th.palette.primary.main, 0.22),
                },
              },
            }}
          >
            <ListItemIcon sx={{ color: selected ? 'primary.main' : 'inherit' }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText primary={item.text} slotProps={{ primary: { sx: { fontWeight: selected ? 600 : 400 } } }} />
          </ListItemButton>
        </ListItem>
      );
    });

  const drawer = (
    <nav aria-label={t('layout.mainNav')}>
      <Toolbar>
        <Typography variant="h6" noWrap component="div" color="primary" sx={{ fontWeight: 600 }}>
          TIGON IOT
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {renderNavItems(menuItems)}
      </List>
      <Divider />
      <List
        sx={{ pt: 0 }}
        subheader={
          <ListSubheader component="div" sx={{ lineHeight: '32px', pt: 1, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: 1 }}>
            {t('layout.marketplace')}
          </ListSubheader>
        }
      >
        {renderNavItems(marketplaceItems)}
      </List>
      {webhookItems.length > 0 && (
        <>
          <Divider />
          <List
            sx={{ pt: 0 }}
            subheader={
              <ListSubheader component="div" sx={{ lineHeight: '32px', pt: 1, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: 1 }}>
                {t('layout.webhookFlows')}
              </ListSubheader>
            }
          >
            {renderNavItems(webhookItems)}
          </List>
        </>
      )}
    </nav>
  );

  const pickLanguage = (code: (typeof LANGUAGES)[number]['code']) => {
    setLanguage(code);
    setLangAnchor(null);
    setAnchorEl(null);
  };

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
            onClick={handleDrawerToggle}
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
              {currentUser?.email}
            </Typography>
            <IconButton
              onClick={handleMenuOpen}
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
            onClose={handleMenuClose}
          >
            <MenuItem disabled>
              <Typography variant="body2">{currentUser?.email}</Typography>
            </MenuItem>
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
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, pt: 'env(safe-area-inset-top)' },
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
          pb: 'calc(24px + env(safe-area-inset-bottom))',
        }}
      >
        <OfflineBanner />
        <NotifyHost />
        <UpdateBanner />
        {children}
      </Box>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Box>
  );
};

export default DashboardLayout;
