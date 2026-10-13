// Insights — client calls: AI help (only when deployed), sending a text, the weekly report, sending a credit app.
import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { sendText } from '../sales/salesData';

// ---------------------------------------------------------------------------
// AI help — hidden unless the AI functions are deployed (ENABLE_AI_WRITER).
// ---------------------------------------------------------------------------

let aiStatus: Promise<boolean> | null = null;

function checkAi(): Promise<boolean> {
  if (!aiStatus) {
    aiStatus = httpsCallable<unknown, { enabled?: boolean }>(functions, 'mpAiStatus')({})
      .then((r) => r.data?.enabled === true)
      .catch(() => false);
  }
  return aiStatus;
}

/** True once we know AI help is available; false while checking or when it is off. */
export function useAiEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    checkAi().then((v) => { if (live) setOn(v); });
    return () => { live = false; };
  }, []);
  return on;
}

const errText = (e: unknown) => {
  const err = e as { code?: string; message?: string };
  if (err.code === 'functions/not-found' || err.code === 'functions/unimplemented') {
    aiStatus = Promise.resolve(false);
    return 'AI help is not turned on.';
  }
  return err.message || String(e);
};

export interface ReplyInput { mode: 'reply'; messages: Array<{ dir: 'in' | 'out'; body: string; at: number }>; lead?: Record<string, unknown>; cart?: Record<string, unknown>; salesperson?: string }
export interface SummaryInput { mode: 'summary'; text: string }
export interface PicksInput { mode: 'post_picks'; carts: Array<{ id: string; title: string; price: number; days: number | null; posts: number; store: string; photos: number }> }

export async function aiReply(input: Omit<ReplyInput, 'mode'>): Promise<string> {
  try {
    const r = await httpsCallable<ReplyInput, { text: string }>(functions, 'mpAiAssist')({ mode: 'reply', ...input });
    return r.data.text || '';
  } catch (e) {
    throw new Error(errText(e));
  }
}

export async function aiSummary(text: string): Promise<string[]> {
  try {
    const r = await httpsCallable<SummaryInput, { bullets: string[] }>(functions, 'mpAiAssist')({ mode: 'summary', text });
    return r.data.bullets || [];
  } catch (e) {
    throw new Error(errText(e));
  }
}

export async function aiPostPicks(carts: PicksInput['carts']): Promise<Array<{ id: string; reason: string }>> {
  try {
    const r = await httpsCallable<PicksInput, { picks: Array<{ id: string; reason: string }> }>(functions, 'mpAiAssist')({ mode: 'post_picks', carts });
    return r.data.picks || [];
  } catch (e) {
    throw new Error(errText(e));
  }
}

// ---------------------------------------------------------------------------
// Texting: the server callable mpSendText when it is deployed, else the client outbox (mp_sms).
// ---------------------------------------------------------------------------

let noServerSend = false;

export async function sendTextSmart(input: { to: string; body: string; leadId?: string; storeId?: string; createdBy: string }): Promise<void> {
  if (!noServerSend) {
    try {
      await httpsCallable(functions, 'mpSendText')({ to: input.to, body: input.body, ...(input.leadId ? { leadId: input.leadId } : {}) });
      return;
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      // Not deployed yet (a missing callable shows up as not-found or a failed request): use the client outbox.
      if (!['functions/not-found', 'functions/unimplemented', 'functions/internal'].includes(code)) throw e;
      noServerSend = true;
    }
  }
  await sendText({ to: input.to, body: input.body, createdBy: input.createdBy, storeId: input.storeId, leadId: input.leadId, kind: 'reply' });
}

// ---------------------------------------------------------------------------
// Reports and credit applications
// ---------------------------------------------------------------------------

export async function sendWeeklyNow(): Promise<{ to: string; leads: number; sales: number }> {
  const r = await httpsCallable<unknown, { to: string; leads: number; sales: number }>(functions, 'mpOwnerWeeklyNow')({});
  return r.data;
}

export async function sendCreditToLender(appId: string, lenderEmail: string, pdfBase64: string): Promise<void> {
  await httpsCallable(functions, 'mpCreditSend')({ appId, lenderEmail, pdfBase64 });
}
