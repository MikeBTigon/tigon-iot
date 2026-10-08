// "Sell more" release — admin settings for every sales feature (mp_settings/sales), one section per track.
import React, { useState } from 'react';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import MpShell from '../components/MpShell';
import SpeedSettings from './speed/SpeedSettings';
import TextingSettings from './texting/TextingSettings';
import ClosingSettings from './closing/ClosingSettings';
import InventorySettings from './inventory/InventorySettings';
import MarketingSettings from './marketing/MarketingSettings';

const TABS = [
  { id: 'speed', label: 'Leads & speed', el: <SpeedSettings /> },
  { id: 'texting', label: 'Texting', el: <TextingSettings /> },
  { id: 'closing', label: 'Quotes, booking & trade-ins', el: <ClosingSettings /> },
  { id: 'inventory', label: 'Inventory', el: <InventorySettings /> },
  { id: 'marketing', label: 'Reviews & referrals', el: <MarketingSettings /> },
];

const SalesSettingsPage: React.FC = () => {
  const [tab, setTab] = useState(() => {
    const h = typeof location !== 'undefined' ? location.hash.slice(1) : '';
    return TABS.some((t) => t.id === h) ? h : 'speed';
  });
  return (
    <MpShell adminOnly>
      <Typography variant="h5" color="primary" sx={{ fontWeight: 700, mb: 1 }}>Sell more — settings</Typography>
      <Tabs value={tab} onChange={(_e, v) => { setTab(v); history.replaceState(null, '', `#${v}`); }} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2 }}>
        {TABS.map((t) => <Tab key={t.id} value={t.id} label={t.label} />)}
      </Tabs>
      <Box>{TABS.find((t) => t.id === tab)?.el}</Box>
    </MpShell>
  );
};

export default SalesSettingsPage;
