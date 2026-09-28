import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import { cartTitle } from './cartLogic';
import { COLLECTIONS } from './constants';
import type { MpCart, MpProfile, QueueItem, QueueStatus } from './types';
import { writeAudit } from './audit';
import { loadMpSettings, needsApproval } from './team/settings';

export const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  pending_approval: 'Waiting for approval',
  queued: 'Queued',
  sent: 'Sent to phone',
  opened: 'Opened',
  posted: 'Posted',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const QUEUE_STATUS_COLOR: Record<QueueStatus, 'default' | 'info' | 'warning' | 'success' | 'error' | 'secondary'> = {
  pending_approval: 'secondary',
  queued: 'default',
  sent: 'info',
  opened: 'warning',
  posted: 'success',
  failed: 'error',
  cancelled: 'default',
};

/** Still to do (includes items waiting for a manager's approval). */
export const isOpenStatus = (s: QueueStatus): boolean => s === 'pending_approval' || s === 'queued' || s === 'sent' || s === 'opened';

/** Released to the phone and can be posted now (open, and not waiting for approval). */
export const isPostableStatus = (s: QueueStatus): boolean => s === 'queued' || s === 'sent' || s === 'opened';

export interface NewQueueItem {
  assignedUserId: string;
  deviceId: string;
  accountId: string;
  accountName: string;
  variation: number;
  scheduledAt: number;
}

/**
 * Adds a cart to someone's posting queue; the server pushes it to their phone when due.
 * When mp_settings/general.requireApproval is on, a Member's item starts as 'pending_approval' and is
 * only pushed after a manager approves it (managers' items go straight to 'queued').
 * Pass `requireApproval` to skip re-reading the settings.
 */
export async function queueCart(
  actor: MpProfile, cart: MpCart, opts: NewQueueItem, { requireApproval }: { requireApproval?: boolean } = {},
): Promise<string> {
  const now = Date.now();
  const pending = requireApproval ?? needsApproval(actor.role, await loadMpSettings());
  const item: Omit<QueueItem, 'id'> = {
    cartId: cart.docId,
    cartTitle: cartTitle(cart),
    cartPrice: cart.price,
    locationId: cart.locationId,
    ...opts,
    status: pending ? 'pending_approval' : 'queued',
    attempts: 0,
    createdBy: actor.uid,
    createdAt: now,
    updatedAt: now,
  };
  const ref = await addDoc(collection(db, COLLECTIONS.queue), item);
  await writeAudit(actor, pending ? 'queue.request' : 'queue.create', ref.id, `${item.cartTitle} → ${opts.accountName || 'any account'}`);
  if (!pending && opts.scheduledAt <= now + 60_000) await sendQueueItemNow(ref.id);
  return ref.id;
}

/** Manager releases a member's item: it goes to 'queued' (pushed now if already due). */
export async function approveQueueItem(actor: MpProfile, item: QueueItem) {
  const now = Date.now();
  await updateDoc(doc(db, COLLECTIONS.queue, item.id), {
    status: 'queued', approvedBy: actor.uid, approvedAt: now, updatedAt: now,
  });
  await writeAudit(actor, 'queue.approve', item.id, item.cartTitle);
  if (item.scheduledAt <= now + 60_000) await sendQueueItemNow(item.id);
}

/** Manager turns down a member's item (it becomes 'cancelled' with the reason). */
export async function rejectQueueItem(actor: MpProfile, item: QueueItem, reason: string) {
  await updateDoc(doc(db, COLLECTIONS.queue, item.id), {
    status: 'cancelled', rejectedReason: reason.trim() || 'Not approved', updatedAt: Date.now(),
  });
  await writeAudit(actor, 'queue.reject', item.id, `${item.cartTitle}${reason.trim() ? ` — ${reason.trim()}` : ''}`);
}

export async function setQueueStatus(id: string, status: QueueStatus, extra: Partial<QueueItem> = {}) {
  const patch: Record<string, unknown> = { status, updatedAt: Date.now(), ...extra };
  if (status === 'posted') patch.postedAt = Date.now();
  if (status === 'opened') patch.openedAt = Date.now();
  await updateDoc(doc(db, COLLECTIONS.queue, id), patch);
}

/** Asks the server to push a due item right away (otherwise the 5-minute dispatcher does it). */
export async function sendQueueItemNow(id: string) {
  try {
    await httpsCallable(functions, 'mpSendQueueItem')({ id });
  } catch (e) {
    console.warn('Immediate send failed; the dispatcher will retry', e);
  }
}

/** Puts a failed/cancelled item back in line to be pushed again now (back to approval for Members when required). */
export async function retryQueueItem(actor: MpProfile, item: QueueItem) {
  const pending = needsApproval(actor.role, await loadMpSettings());
  await updateDoc(doc(db, COLLECTIONS.queue, item.id), {
    status: pending ? 'pending_approval' : 'queued', attempts: 0, scheduledAt: Date.now(), updatedAt: Date.now(),
    lastError: '', failAlertedAt: 0,
  });
  await writeAudit(actor, 'queue.retry', item.id, item.cartTitle);
  if (!pending) await sendQueueItemNow(item.id);
}

export async function cancelQueueItem(actor: MpProfile, item: QueueItem) {
  await setQueueStatus(item.id, 'cancelled');
  await writeAudit(actor, 'queue.cancel', item.id, item.cartTitle);
}
