import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import { cartTitle } from './cartLogic';
import { COLLECTIONS } from './constants';
import type { MpCart, MpProfile, QueueItem, QueueStatus } from './types';
import { writeAudit } from './audit';

export const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  queued: 'Queued',
  sent: 'Sent to phone',
  opened: 'Opened',
  posted: 'Posted',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const QUEUE_STATUS_COLOR: Record<QueueStatus, 'default' | 'info' | 'warning' | 'success' | 'error' | 'secondary'> = {
  queued: 'default',
  sent: 'info',
  opened: 'warning',
  posted: 'success',
  failed: 'error',
  cancelled: 'default',
};

export const isOpenStatus = (s: QueueStatus) => s === 'queued' || s === 'sent' || s === 'opened';

export interface NewQueueItem {
  assignedUserId: string;
  deviceId: string;
  accountId: string;
  accountName: string;
  variation: number;
  scheduledAt: number;
}

/** Adds a cart to someone's posting queue; the server pushes it to their phone when due. */
export async function queueCart(actor: MpProfile, cart: MpCart, opts: NewQueueItem): Promise<string> {
  const now = Date.now();
  const item: Omit<QueueItem, 'id'> = {
    cartId: cart.docId,
    cartTitle: cartTitle(cart),
    cartPrice: cart.price,
    locationId: cart.locationId,
    ...opts,
    status: 'queued',
    attempts: 0,
    createdBy: actor.uid,
    createdAt: now,
    updatedAt: now,
  };
  const ref = await addDoc(collection(db, COLLECTIONS.queue), item);
  await writeAudit(actor, 'queue.create', ref.id, `${item.cartTitle} → ${opts.accountName || 'any account'}`);
  if (opts.scheduledAt <= now + 60_000) await sendQueueItemNow(ref.id);
  return ref.id;
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

/** Puts a failed/cancelled item back in line to be pushed again now. */
export async function retryQueueItem(actor: MpProfile, item: QueueItem) {
  await updateDoc(doc(db, COLLECTIONS.queue, item.id), {
    status: 'queued', attempts: 0, scheduledAt: Date.now(), updatedAt: Date.now(), lastError: '', failAlertedAt: 0,
  });
  await writeAudit(actor, 'queue.retry', item.id, item.cartTitle);
  await sendQueueItemNow(item.id);
}

export async function cancelQueueItem(actor: MpProfile, item: QueueItem) {
  await setQueueStatus(item.id, 'cancelled');
  await writeAudit(actor, 'queue.cancel', item.id, item.cartTitle);
}
