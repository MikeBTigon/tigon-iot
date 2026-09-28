import React, { useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BottomNavigation, BottomNavigationAction, Box, Button, Chip, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  ListSubheader, Paper,
} from '@mui/material';
import { AddAPhoto, Home, ListAlt, MoreHoriz, PersonSearch } from '@mui/icons-material';
import { useT } from '../i18n';
import { activeNavPath, groupOf, visibleNav } from './navUtils';
import { groupIcon, navIcon } from './navIcons';

/** Phone bottom bar destinations (the 5th button, More, opens every group). */
const BOTTOM = [
  { path: '/mp', key: 'nav.home', icon: <Home /> },
  { path: '/mp/new', key: 'nav.new', icon: <AddAPhoto /> },
  { path: '/mp/queue', key: 'nav.queue', icon: <ListAlt /> },
  { path: '/mp/leads', key: 'nav.leads', icon: <PersonSearch /> },
];

/** Height of the phone bottom bar (without the safe-area inset). */
export const BOTTOM_NAV_HEIGHT = 56;

/**
 * MP Assistant navigation from mp/navRegistry:
 * - tablet/desktop: a row of group buttons with the chosen group's pages as chips underneath;
 * - phone: a bottom bar (Home, New listing, Queue, Leads, More → drawer with every group).
 */
const MpNav: React.FC<{ role: string | undefined }> = ({ role }) => {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const groups = visibleNav(role);
  const active = activeNavPath(pathname);
  const activeGroupKey = groupOf(active)?.key ?? groups[0]?.key;
  const [pickedGroup, setPickedGroup] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const shownGroup = groups.find((g) => g.key === (pickedGroup ?? activeGroupKey)) ?? groups[0];

  const bottomValue = BOTTOM.some((b) => b.path === active) ? active : active ? 'more' : false;

  return (
    <>
      {/* Tablet / desktop */}
      <Box component="nav" aria-label={t('nav.mpNavLabel')} sx={{ display: { xs: 'none', sm: 'block' }, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', borderBottom: 1, borderColor: 'divider', pb: 0.5 }}>
          {groups.map((g) => {
            const isShown = g.key === shownGroup?.key;
            const hasActive = g.key === activeGroupKey && !!active;
            return (
              <Button
                key={g.key}
                size="small"
                startIcon={groupIcon(g.key)}
                onClick={() => setPickedGroup(g.key)}
                aria-expanded={isShown}
                aria-controls="mp-subnav"
                color={hasActive ? 'primary' : 'inherit'}
                sx={{
                  fontWeight: isShown ? 700 : 500,
                  borderBottom: 2,
                  borderColor: isShown ? 'primary.main' : 'transparent',
                  borderRadius: 0,
                  px: 1.5,
                }}
              >
                {t(g.key)}
              </Button>
            );
          })}
        </Box>
        {shownGroup && (
          <Box id="mp-subnav" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', pt: 1.25 }}>
            {shownGroup.items.map((i) => {
              const selected = i.path === active;
              return (
                <Chip
                  key={i.path}
                  icon={navIcon(i.path) as React.ReactElement}
                  label={t(i.key)}
                  component={RouterLink}
                  to={i.path}
                  clickable
                  color={selected ? 'primary' : 'default'}
                  variant={selected ? 'filled' : 'outlined'}
                  aria-current={selected ? 'page' : undefined}
                />
              );
            })}
          </Box>
        )}
      </Box>

      {/* Phone */}
      <Paper
        component="nav"
        aria-label={t('nav.mpNavLabel')}
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
          value={bottomValue}
          onChange={(_, v: string) => (v === 'more' ? setMoreOpen(true) : navigate(v))}
          sx={{ height: BOTTOM_NAV_HEIGHT }}
        >
          {BOTTOM.map((b) => (
            <BottomNavigationAction key={b.path} value={b.path} label={t(b.key)} icon={b.icon} sx={{ minWidth: 0, px: 0.5 }} />
          ))}
          <BottomNavigationAction value="more" label={t('nav.more')} icon={<MoreHoriz />} sx={{ minWidth: 0, px: 0.5 }} />
        </BottomNavigation>
      </Paper>
      <Drawer
        anchor="bottom"
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        slotProps={{ paper: { sx: { maxHeight: '80vh', borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: 'env(safe-area-inset-bottom)' } } }}
      >
        <List aria-label={t('nav.allPages')} sx={{ pt: 0 }}>
          {groups.map((g) => (
            <React.Fragment key={g.key}>
              <ListSubheader sx={{ bgcolor: 'background.paper' }}>{t(g.key)}</ListSubheader>
              {g.items.map((i) => (
                <ListItemButton
                  key={i.path}
                  component={RouterLink}
                  to={i.path}
                  selected={i.path === active}
                  aria-current={i.path === active ? 'page' : undefined}
                  onClick={() => setMoreOpen(false)}
                >
                  <ListItemIcon>{navIcon(i.path)}</ListItemIcon>
                  <ListItemText primary={t(i.key)} />
                </ListItemButton>
              ))}
            </React.Fragment>
          ))}
        </List>
      </Drawer>
    </>
  );
};

export default MpNav;
