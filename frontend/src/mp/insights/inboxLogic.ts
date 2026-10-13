// Insights — two-way texting inbox: group texts into conversations (pure; unit-tested).
import { toE164 } from './phone';

export interface OutText { id: string; to: string; body: string; createdAt: number; status?: string; leadId?: string; ownerUid?: string; createdBy?: string; error?: string; sentAt?: number }
export interface InText { id: string; from: string; body: string; receivedAt: number; leadId?: string; storeId?: string }
export interface LeadLite { id: string; name?: string; ownerUid?: string; locationId?: string; cartId?: string; cartTitle?: string; status?: string }

export interface ChatMessage { id: string; dir: 'in' | 'out'; body: string; at: number; status?: string; error?: string }

export interface Conversation {
  /** +1XXXXXXXXXX */
  phone: string;
  name: string;
  leadId?: string;
  ownerUid?: string;
  lastAt: number;
  lastBody: string;
  lastDir: 'in' | 'out';
  unread: number;
  /** Oldest first. */
  messages: ChatMessage[];
}

/**
 * Groups outbound (mp_sms) and inbound (mp_sms_inbound) texts by customer phone, newest conversation first.
 * Unread = inbound texts newer than both our last outbound text and this person's read marker for that phone.
 */
export function groupConversations(
  outs: OutText[], ins: InText[], readAt: Record<string, number>, leadsByPhone: Record<string, LeadLite>,
): Conversation[] {
  const map = new Map<string, { msgs: ChatMessage[]; leadId?: string }>();
  const add = (phone: string, m: ChatMessage, leadId?: string) => {
    if (!phone) return;
    if (!map.has(phone)) map.set(phone, { msgs: [] });
    const c = map.get(phone)!;
    c.msgs.push(m);
    if (leadId && !c.leadId) c.leadId = leadId;
  };
  for (const o of outs) add(toE164(o.to), { id: o.id, dir: 'out', body: o.body, at: Number(o.createdAt) || 0, status: o.status, error: o.error }, o.leadId);
  for (const i of ins) add(toE164(i.from), { id: i.id, dir: 'in', body: i.body, at: Number(i.receivedAt) || 0 }, i.leadId);

  const out: Conversation[] = [];
  for (const [phone, c] of map) {
    c.msgs.sort((a, b) => a.at - b.at);
    const last = c.msgs[c.msgs.length - 1];
    const lastOut = Math.max(0, ...c.msgs.filter((m) => m.dir === 'out').map((m) => m.at));
    const seen = Math.max(lastOut, readAt[phone] || 0);
    const lead = leadsByPhone[phone];
    out.push({
      phone, name: lead?.name || '', leadId: lead?.id || c.leadId, ownerUid: lead?.ownerUid,
      lastAt: last.at, lastBody: last.body, lastDir: last.dir,
      unread: c.msgs.filter((m) => m.dir === 'in' && m.at > seen).length,
      messages: c.msgs,
    });
  }
  return out.sort((a, b) => b.lastAt - a.lastAt);
}

/** Conversations with something unread. */
export const unreadCount = (convs: Conversation[]) => convs.filter((c) => c.unread > 0).length;

/** mp_inbox_reads doc id for a person + phone. */
export const readDocId = (uid: string, phone: string) => `${uid}_${toE164(phone).replace(/\D/g, '')}`;
