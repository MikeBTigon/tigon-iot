import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import { ListAlt, Menu as MenuIcon, PersonSearch, Search, Today } from '@mui/icons-material';
import { useT } from '../i18n';
import { BOTTOM_NAV } from '../mp/navRegistry';
import { activeNavPath, navLabel } from './navUtils';

const ICONS: Record<string, React.ReactNode> = {
  '/mp/today': <Today />,
  '/mp/leads': <PersonSearch />,
  '/mp/find': <Search />,
  '/mp/queue': <ListAlt />,
};

/** Height of the phone bottom bar (without the safe-area inset). */
export const BOTTOM_NAV_HEIGHT = 56;

/**
 * Phone bottom bar: Today, Leads, Find a cart, Queue and More (opens the full grouped menu — the same
 * menu as the left drawer). Hidden on tablets and computers, where the drawer is always visible.
 */
const MpNav: React.FC<{ onMore: () => void }> = ({ onMore }) => {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = activeNavPath(pathname);
  const value = BOTTOM_NAV.some((b) => b.path === active) ? active : 'more';

  return (
    <Paper
      component="nav"
      aria-label={t('nav.quickNav', 'Quick links')}
      elevation={8}
      sx={{
        display: { xs: 'block', sm: 'none' },
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (th) => th.zIndex.appBar,
        pb: 'env(safe-area-inset-bottom)',
        borderRadius: 0,
      }}
    >
      <BottomNavigation
        showLabels
        value={value}
        onChange={(_, v: string) => (v === 'more' ? onMore() : navigate(v))}
        sx={{ height: BOTTOM_NAV_HEIGHT }}
      >
        {BOTTOM_NAV.map((b) => (
          <BottomNavigationAction
            key={b.path}
            value={b.path}
            label={navLabel(t, b)}
            icon={ICONS[b.path]}
            aria-current={b.path === active ? 'page' : undefined}
            sx={{ minWidth: 0, px: 0.5 }}
          />
        ))}
        <BottomNavigationAction
          value="more"
          label={t('nav.more')}
          icon={<MenuIcon />}
          aria-haspopup="dialog"
          sx={{ minWidth: 0, px: 0.5 }}
          // Re-opening while already on "More" (a page outside the bar) still opens the menu.
          onClick={() => value === 'more' && onMore()}
        />
      </BottomNavigation>
    </Paper>
  );
};

export default MpNav;
