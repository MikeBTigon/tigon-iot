// Track 5 — copy / text a referral link (Referrals page and the lead dialog).
import { useState } from 'react';
import { useMp } from '../../MpDataContext';
import { notify } from '../../../ui/notify';
import { referralUrl, sendText, useSalesSettings } from '../salesData';
import type { Referral } from '../salesTypes';
import { copyText, referralMessage } from './marketingData';

/** Text or copy a referral link (used here and in the lead dialog). */
export function useReferralActions() {
  const { profile } = useMp();
  const { settings } = useSalesSettings();
  const [busy, setBusy] = useState('');
  const copy = async (r: Referral) => notify(await copyText(referralUrl(r.code)) ? 'Link copied' : referralUrl(r.code), 'info');
  const text = async (r: Referral, leadId?: string) => {
    if (!profile) return;
    setBusy(r.code);
    try {
      await sendText({ to: r.phone, body: referralMessage(settings, r), createdBy: profile.uid, storeId: r.storeId, leadId: leadId || r.leadId, customerId: r.customerId, kind: 'referral' });
      notify(`Text to ${r.name} is on its way`, 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not send the text', 'error');
    } finally {
      setBusy('');
    }
  };
  return { copy, text, busy, settings };
}
