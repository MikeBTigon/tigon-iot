import { addDoc, collection } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from './constants';
import type { MpProfile } from './types';

/** Appends an entry to the admin audit log. Never throws. */
export async function writeAudit(actor: MpProfile | null | undefined, action: string, target: string, details = '') {
  if (!actor) return;
  try {
    await addDoc(collection(db, COLLECTIONS.audit), {
      actorUid: actor.uid,
      actorName: actor.name || actor.email,
      action,
      target,
      details,
      ts: Date.now(),
    });
  } catch (e) {
    console.warn('Audit write failed', action, e);
  }
}
