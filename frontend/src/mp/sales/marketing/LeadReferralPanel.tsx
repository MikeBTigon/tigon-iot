// Track 5 — referral info in the lead dialog: the buyer's own referral link (Copy / Text), and "Referred by …".
import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../constants';
import { Box, Button, Paper, Typography } from '@mui/material';
import { ContentCopy, Redeem, Sms } from '@mui/icons-material';
import type { Lead } from '../../growthTypes';
import type { LeadSalesFields } from '../salesTypes';
import { useMp } from '../../MpDataContext';
import { updateLead } from '../../crm/crmData';
import { notify } from '../../../ui/notify';
import { referralUrl } from '../salesData';
import { createReferral, money, useReferral } from './marketingData';
import type { LeadReferralFields } from './marketingData';
import { useReferralActions } from './useReferralActions';

type FullLead = Lead & LeadSalesFields & LeadReferralFields;

/** Referral fields of the lead, live (the server adds the buyer's code a moment after "Mark sold"). */
function useLiveReferralFields(id: string): LeadReferralFields & { status?: string } {
  const [live, setLive] = useState<{ id: string; v: LeadReferralFields & { status?: string } }>({ id: '', v: {} });
  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, COLLECTIONS.leads, id), (s) => {
      const d = s.data() || {};
      setLive({ id, v: { myReferralCode: d.myReferralCode, referralRewardAt: d.referralRewardAt, referralRewardAmount: d.referralRewardAmount, status: d.status } });
    }, () => undefined);
  }, [id]);
  return live.id === id ? live.v : {};
}

const LeadReferralPanel: React.FC<{ lead: Lead & LeadSalesFields }> = ({ lead: l }) => {
  const live = useLiveReferralFields(l.id);
  const lead = { ...l, ...Object.fromEntries(Object.entries(live).filter(([, v]) => v !== undefined)) } as FullLead;
  const { profile } = useMp();
  const referredBy = useReferral(lead.referralCode);
  const [madeCode, setMadeCode] = useState('');
  const myCode = lead.myReferralCode || madeCode;
  const mine = useReferral(myCode || undefined);
  const { copy, text, busy, settings } = useReferralActions();
  const [creating, setCreating] = useState(false);

  if (!lead.referralCode && !myCode && lead.status !== 'sold') return null;

  const create = async () => {
    if (!profile) return;
    setCreating(true);
    try {
      const code = await createReferral({
        name: lead.name, phone: lead.phone, storeId: lead.locationId, leadId: lead.id, customerId: lead.customerId, createdBy: profile.uid,
      });
      await updateLead(lead.id, { myReferralCode: code });
      setMadeCode(code);
      notify('Referral link ready', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not create the link', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Redeem fontSize="small" color="primary" />
        <Typography sx={{ fontWeight: 700 }}>Referrals</Typography>
      </Box>
      {lead.referralCode && (
        <Typography variant="body2" sx={{ mb: myCode || lead.status === 'sold' ? 1 : 0 }}>
          Referred by <b>{referredBy?.name || lead.referralCode}</b>
          {lead.referralRewardAt ? ` — reward of ${money(lead.referralRewardAmount || settings.referral.rewardAmount)} owed to them` : ''}
        </Typography>
      )}
      {myCode ? (
        <>
          <Typography variant="body2" color="text.secondary">
            {lead.name ? `${lead.name.split(/\s+/)[0]}'s` : 'Their'} link — they earn {money(settings.referral.rewardAmount)} for each friend who buys
            {mine && (mine.leads || mine.sales) ? ` (${mine.leads} sent, ${mine.sales} bought so far)` : ''}:
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', my: 0.5 }}>{referralUrl(myCode)}</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" startIcon={<ContentCopy />} onClick={() => copy({ code: myCode } as Parameters<typeof copy>[0])}>Copy</Button>
            <Button
              size="small" variant="contained" startIcon={<Sms />} disabled={!lead.phone || busy === myCode}
              onClick={() => text(mine || { id: myCode, code: myCode, name: lead.name, phone: lead.phone, storeId: lead.locationId, leads: 0, sales: 0, rewardsOwed: 0, rewardsPaid: 0, createdAt: 0 }, lead.id)}
            >
              Text it
            </Button>
          </Box>
        </>
      ) : lead.status === 'sold' ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>Their referral link is made automatically in a moment.</Typography>
          <Button size="small" disabled={creating} onClick={create}>Make it now</Button>
        </Box>
      ) : null}
    </Paper>
  );
};

export default LeadReferralPanel;
