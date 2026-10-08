// "Sell more" release — everything the sales features add to a lead (shown in the lead dialog).
import React from 'react';
import { Stack } from '@mui/material';
import type { Lead } from '../growthTypes';
import type { LeadSalesFields } from './salesTypes';
import LeadSpeedPanel from './speed/LeadSpeedPanel';
import LeadTextPanel from './texting/LeadTextPanel';
import LeadClosingPanel from './closing/LeadClosingPanel';
import LeadReferralPanel from './marketing/LeadReferralPanel';

const LeadSalesPanel: React.FC<{ lead: Lead & LeadSalesFields }> = ({ lead }) => (
  <Stack spacing={1.5} sx={{ mt: 1 }}>
    <LeadSpeedPanel lead={lead} />
    <LeadTextPanel lead={lead} />
    <LeadClosingPanel lead={lead} />
    <LeadReferralPanel lead={lead} />
  </Stack>
);

export default LeadSalesPanel;
