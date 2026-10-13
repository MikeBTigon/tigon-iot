// Insights — who is calling (mp_users) for callables.
import {HttpsError} from 'firebase-functions/v2/https';
import type {CallableRequest} from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

export interface Caller {uid: string; role: 'admin' | 'manager' | 'sales'; name: string; email: string; location: string}

export async function callerOf(req: CallableRequest<unknown>, min: 'member' | 'manager' | 'admin' = 'member'): Promise<Caller> {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  const s = await admin.firestore().collection('mp_users').doc(req.auth.uid).get();
  if (!s.exists) throw new HttpsError('permission-denied', 'You need MP Assistant access for this.');
  const role = (['admin', 'manager'].includes(String(s.get('role'))) ? s.get('role') : 'sales') as Caller['role'];
  if (min === 'manager' && role === 'sales') throw new HttpsError('permission-denied', 'Only managers can do this.');
  if (min === 'admin' && role !== 'admin') throw new HttpsError('permission-denied', 'Only admins can do this.');
  return {
    uid: req.auth.uid, role, name: String(s.get('name') || s.get('email') || ''), email: String(s.get('email') || ''),
    location: String(s.get('location') || ''),
  };
}
