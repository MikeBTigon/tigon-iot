/** Webhook Flows (part 1) — small data hooks shared by the overview / websites / webhooks / submissions pages. */
import { useState } from 'react';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { writeAudit } from '../../mp/audit';
import type { MpProfile } from '../../mp/types';
import { useWhCollection, useWhDoc } from '../data';
import { WH } from '../types';
import type { WhDomain, WhFlow, WhGlobalSettings, WhSubmission, WhWebhook } from '../types';

export type GlobalDoc = WhGlobalSettings & { id: string };

/** wh_settings/global (undefined = loading, null = missing). */
export const useGlobal = () => useWhDoc<GlobalDoc>(WH.settings, 'global');

/** The Master Flow named by the global settings. */
export const useMasterFlow = (global: GlobalDoc | null | undefined) => useWhDoc<WhFlow>(WH.flows, global?.masterFlowId || undefined);

export const useDomains = () => useWhCollection<WhDomain>(WH.domains);
export const useWebhooks = () => useWhCollection<WhWebhook>(WH.webhooks);
export const useFlows = () => useWhCollection<WhFlow>(WH.flows);

/** Render-safe "now" (captured once per mount). */
export const useNow = () => useState(() => Date.now())[0];

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Relative time: "5 min ago", "3 days ago". */
export function ago(ms: number | undefined, now: number): string {
  if (!ms) return 'never';
  const d = Math.max(0, now - ms);
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
  if (d < DAY_MS) return `${Math.floor(d / 3_600_000)} h ago`;
  const days = Math.floor(d / DAY_MS);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Display name of a lead. */
export const leadName = (s: WhSubmission) => [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || s.phone1 || '(no name)';

/**
 * Mark a submission as spam / not spam. Only touches the fields the rules allow managers to change
 * (isSpam, spamReason, status, reviewedBy, reviewedAt) — no updatedAt.
 */
export async function markSpam(sub: WhSubmission, spam: boolean, profile: MpProfile | null | undefined) {
  const who = profile?.name || profile?.email || 'staff';
  await updateDoc(doc(db, WH.submissions, sub.id), spam ?
    { isSpam: true, status: 'spam', spamReason: `Marked as spam by ${who}`, reviewedBy: profile?.uid || '', reviewedAt: Date.now() } :
    { isSpam: false, status: sub.status === 'spam' ? 'done' : sub.status, spamReason: deleteField(), reviewedBy: profile?.uid || '', reviewedAt: Date.now() });
  await writeAudit(profile, spam ? 'wh_mark_spam' : 'wh_mark_not_spam', leadName(sub), sub.id);
}
