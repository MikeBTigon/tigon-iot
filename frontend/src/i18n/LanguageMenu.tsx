import React, { useState } from 'react';
import { Button, Menu, MenuItem } from '@mui/material';
import { Translate } from '@mui/icons-material';
import { LANGUAGES, applyLanguage, useLanguage, useT } from '.';
import type { Language } from '../mp/growthTypes';

/**
 * Small language switch for pages without a signed-in profile (Login, Register, customer pages).
 * The choice is remembered on this device (localStorage) by applyLanguage(); signed-in users change it in Preferences.
 */
const LanguageMenu: React.FC<{ codes?: Language[]; color?: 'inherit' | 'primary' }> = ({ codes, color = 'primary' }) => {
  const t = useT();
  const lang = useLanguage();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const options = codes ? LANGUAGES.filter((l) => codes.includes(l.code)) : LANGUAGES;

  return (
    <>
      <Button
        size="small"
        color={color}
        startIcon={<Translate fontSize="small" />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={t('prefs.language')}
        aria-haspopup="menu"
        sx={{ minWidth: 0, textTransform: 'uppercase' }}
      >
        {lang}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {options.map((l) => (
          <MenuItem
            key={l.code}
            lang={l.code}
            selected={l.code === lang}
            onClick={() => {
              applyLanguage(l.code);
              setAnchor(null);
            }}
          >
            {l.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default LanguageMenu;
