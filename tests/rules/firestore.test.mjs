// Firestore security rules tests ("Harden & polish" release).
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { as, makeEnv } from './helpers.mjs';

let env;
const now = () => Date.now();

const DEVICE = {
  userId: 'sales1', deviceName: 'sales1 Android', deviceType: 'master', isActive: false, source: 'tigon-iot-app',
  installId: 'inst-1234-5678', status: 'active', pairedAt: 1, lastSeen: 1, platform: 'android', model: 'Pixel',
  osVersion: '14', appVersion: '1.0 (1)', echoSecretHash: 'h', echoRegisteredAt: 1,
};

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const p = (uid, data) => setDoc(doc(db, 'mp_users', uid), { email: `${uid}@tigongolfcarts.com`, name: uid, ...data });
    await p('admin1', { role: 'admin' }); // existing profile, no status = active
    await p('mgr1', { role: 'manager', status: 'active' });
    await p('sales1', { role: 'sales', location: 'T1' }); // existing member from before approvals
    await p('sales2', { role: 'sales', status: 'active' });
    await p('pend1', { role: 'sales', status: 'pending' });
    await p('off1', { role: 'sales', status: 'disabled' });
    await p('unver', { role: 'sales' });
    await setDoc(doc(db, 'systemConfig', 'mpAssistant'), { adminEmails: ['boot@tigongolfcarts.com'] });
    await setDoc(doc(db, 'mp_carts', 'c1'), { payload: '{}', locationId: 'T1' });
    await setDoc(doc(db, 'users', 'sales1'), { email: 'sales1@tigongolfcarts.com', role: 'user', emailVerified: true });
    await setDoc(doc(db, 'devices', 'dev1'), DEVICE);
    await setDoc(doc(db, 'devices', 'devRetired'), { ...DEVICE, status: 'revoked', retiredReason: 'phone-set-up-again', replacedBy: 'x' });
    await setDoc(doc(db, 'devices', 'devRevoked'), { ...DEVICE, status: 'revoked', isActive: false });
    await setDoc(doc(db, 'mp_storefronts', 'sales1-live'), { userId: 'sales1', title: 'Live', published: true });
    await setDoc(doc(db, 'mp_storefronts', 'sales1-draft'), { userId: 'sales1', title: 'Draft', published: false });
  });
}

before(async () => { env = await makeEnv(); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(); });

const fs = (uid, verified = true) => as(env, uid, verified).firestore();

describe('verified email', () => {
  it('unverified account is denied team data even with a profile', async () => {
    await assertFails(getDoc(doc(fs('unver', false), 'mp_carts', 'c1')));
    await assertFails(getDoc(doc(fs('unver', false), 'mp_users', 'unver')));
  });
  it('unverified account cannot self-enrol or register a phone', async () => {
    await assertFails(setDoc(doc(fs('newbie', false), 'mp_users', 'newbie'),
      { email: 'newbie@tigongolfcarts.com', name: 'N', legacyId: '', role: 'sales', status: 'pending', createdAt: now() }));
    await assertFails(setDoc(doc(fs('newbie', false), 'devices', 'd-new'), { userId: 'newbie', deviceName: 'x', status: 'active' }));
  });
  it('just-signed-up, unverified person may still create their own users/{uid} login record (no role)', async () => {
    await assertSucceeds(setDoc(doc(fs('newbie', false), 'users', 'newbie'), { email: 'newbie@tigongolfcarts.com', role: 'user' }));
    await assertFails(setDoc(doc(fs('newbie2', false), 'users', 'newbie2'), { email: 'newbie2@tigongolfcarts.com', role: 'admin' }));
  });
  it('verified existing members keep working', async () => {
    await assertSucceeds(getDoc(doc(fs('sales1'), 'mp_carts', 'c1')));
    await assertSucceeds(getDoc(doc(fs('admin1'), 'mp_carts', 'c1')));
  });
});

describe('admin approval of new members', () => {
  const profile = (uid, extra = {}) => ({ email: `${uid}@tigongolfcarts.com`, name: uid, legacyId: '', role: 'sales', createdAt: now(), ...extra });
  it('self-enrolment must start pending', async () => {
    await assertSucceeds(setDoc(doc(fs('newbie'), 'mp_users', 'newbie'), profile('newbie', { status: 'pending' })));
    await assertFails(setDoc(doc(fs('newbie2'), 'mp_users', 'newbie2'), profile('newbie2')));
    await assertFails(setDoc(doc(fs('newbie3'), 'mp_users', 'newbie3'), profile('newbie3', { status: 'active' })));
    await assertFails(setDoc(doc(fs('newbie4'), 'mp_users', 'newbie4'), profile('newbie4', { status: 'pending', role: 'manager' })));
    await assertFails(setDoc(doc(fs('newbie5'), 'mp_users', 'newbie5'), profile('newbie5', { status: 'pending', location: 'T1' })));
  });
  it('bootstrap admin starts active', async () => {
    await assertSucceeds(setDoc(doc(fs('boot'), 'mp_users', 'boot'), profile('boot', { role: 'admin', status: 'active' })));
    await assertFails(setDoc(doc(fs('nobody'), 'mp_users', 'nobody'), profile('nobody', { role: 'admin', status: 'active' })));
  });
  it('pending member is denied team data', async () => {
    await assertFails(getDoc(doc(fs('pend1'), 'mp_carts', 'c1')));
    await assertFails(addDoc(collection(fs('pend1'), 'mp_leads'), { ownerUid: 'pend1', name: 'x' }));
  });
  it('pending member can read own profile (status page)', async () => {
    await assertSucceeds(getDoc(doc(fs('pend1'), 'mp_users', 'pend1')));
  });
  it('approved member is allowed', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'mp_users', 'pend1'), { status: 'active' }));
    await assertSucceeds(getDoc(doc(fs('pend1'), 'mp_carts', 'c1')));
    await assertSucceeds(addDoc(collection(fs('pend1'), 'mp_leads'), { ownerUid: 'pend1', name: 'x' }));
  });
  it('people cannot self-approve, self-promote or change their location', async () => {
    await assertFails(updateDoc(doc(fs('pend1'), 'mp_users', 'pend1'), { status: 'active' }));
    await assertFails(updateDoc(doc(fs('sales1'), 'mp_users', 'sales1'), { role: 'manager' }));
    await assertFails(updateDoc(doc(fs('sales1'), 'mp_users', 'sales1'), { location: 'T2' }));
    await assertFails(updateDoc(doc(fs('sales1'), 'mp_users', 'sales1'), { status: 'active' }));
    await assertFails(updateDoc(doc(fs('mgr1'), 'mp_users', 'mgr1'), { role: 'admin' }));
  });
  it('people can still edit their own name, legacy identity and preferences', async () => {
    await assertSucceeds(updateDoc(doc(fs('sales1'), 'mp_users', 'sales1'), { name: 'Sam', legacyId: 'L1' }));
    await assertSucceeds(updateDoc(doc(fs('sales1'), 'mp_users', 'sales1'), { 'prefs.theme': 'dark' }));
    await assertSucceeds(updateDoc(doc(fs('pend1'), 'mp_users', 'pend1'), { name: 'Pat' }));
  });
  it('admin approves / rejects / disables; managers cannot change status but can change location', async () => {
    await assertSucceeds(updateDoc(doc(fs('admin1'), 'mp_users', 'pend1'), { status: 'active', statusBy: 'admin1', statusAt: now() }));
    await assertSucceeds(updateDoc(doc(fs('admin1'), 'mp_users', 'sales2'), { status: 'disabled' }));
    await assertFails(updateDoc(doc(fs('mgr1'), 'mp_users', 'off1'), { status: 'active' }));
    await assertSucceeds(updateDoc(doc(fs('mgr1'), 'mp_users', 'sales1'), { location: 'T3', updatedAt: now() }));
    await assertFails(updateDoc(doc(fs('sales2'), 'mp_users', 'sales1'), { location: 'T3' }));
  });
  it('disabled person is denied and cannot re-enrol or edit their profile', async () => {
    await assertFails(getDoc(doc(fs('off1'), 'mp_carts', 'c1')));
    await assertFails(setDoc(doc(fs('off1'), 'mp_users', 'off1'),
      { email: 'off1@tigongolfcarts.com', name: 'x', legacyId: '', role: 'sales', status: 'pending', createdAt: now() }));
    await assertFails(updateDoc(doc(fs('off1'), 'mp_users', 'off1'), { name: 'again' }));
  });
  it('disabled manager loses manager powers', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'mp_users', 'mgr1'), { status: 'disabled' }));
    await assertFails(updateDoc(doc(fs('mgr1'), 'devices', 'dev1'), { userId: 'sales2' }));
  });
});

describe('users/{uid}', () => {
  it('role and emailVerified are not self-editable', async () => {
    await assertFails(updateDoc(doc(fs('sales1'), 'users', 'sales1'), { role: 'admin' }));
    await assertFails(updateDoc(doc(fs('sales1'), 'users', 'sales1'), { emailVerified: false }));
    await assertSucceeds(updateDoc(doc(fs('sales1'), 'users', 'sales1'), { displayName: 'Sam' }));
  });
});

describe('devices', () => {
  const fresh = {
    userId: 'sales2', deviceName: 'sales2 Android', deviceType: 'master', isActive: false, source: 'tigon-iot-app',
    installId: 'inst-aaaa-bbbb', status: 'active', pairedAt: 1, lastSeen: 1, platform: 'android', model: 'Pixel', osVersion: '14', appVersion: '1',
  };
  it('phone app can register its own device (registerDevice / enablePhoneAlerts shapes)', async () => {
    await assertSucceeds(setDoc(doc(fs('sales2'), 'devices', 'd2'), fresh));
    await assertSucceeds(setDoc(doc(fs('sales2'), 'devices', 'd3'), {
      userId: 'sales2', deviceName: 'x', deviceType: 'master', isActive: true, fcmToken: 't', platform: 'android',
      source: 'tigon-iot-app', installId: 'i', status: 'active', lastSeen: 1, updatedAt: serverTimestamp(),
    }, { merge: true }));
  });
  it('cannot create a device for someone else or with server-only fields', async () => {
    await assertFails(setDoc(doc(fs('sales2'), 'devices', 'd4'), { ...fresh, userId: 'sales1' }));
    await assertFails(setDoc(doc(fs('sales2'), 'devices', 'd5'), { ...fresh, echoSecretHash: 'x' }));
    await assertFails(setDoc(doc(fs('sales2'), 'devices', 'd6'), { ...fresh, status: 'revoked' }));
    await assertFails(setDoc(doc(fs('sales2'), 'devices', 'd7'), { ...fresh, deviceNumber: '0001' }));
    await assertFails(setDoc(doc(fs('pend1'), 'devices', 'd8'), { ...fresh, userId: 'pend1', deviceType: 'slave' }));
  });
  it('owner may update only the whitelisted fields', async () => {
    const db = fs('sales1');
    await assertSucceeds(updateDoc(doc(db, 'devices', 'dev1'), { lastSeen: now(), platform: 'android', model: 'P', osVersion: '15', appVersion: '2' }));
    await assertSucceeds(updateDoc(doc(db, 'devices', 'dev1'), { fcmToken: 'tok', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, 'devices', 'dev1'), { isActive: false, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, 'devices', 'dev1'), { deviceName: 'Renamed' }));
    // enablePhoneAlerts: merge-set with unchanged userId/deviceType/source/installId/status
    await assertSucceeds(setDoc(doc(db, 'devices', 'dev1'), {
      userId: 'sales1', deviceName: 'n', deviceType: 'master', isActive: true, fcmToken: 't2', platform: 'android',
      source: 'tigon-iot-app', installId: DEVICE.installId, status: 'active', lastSeen: now(), updatedAt: serverTimestamp(),
    }, { merge: true }));
    for (const bad of [{ userId: 'sales2' }, { echoSecretHash: 'x' }, { echoRegisteredAt: 2 }, { status: 'revoked' },
      { source: 'other' }, { deviceType: 'slave' }, { deviceNumber: '9' }, { locationId: 'T2' }]) {
      await assertFails(updateDoc(doc(db, 'devices', 'dev1'), bad));
    }
  });
  it('owner cannot un-revoke a phone a manager revoked, but can restore one retired by re-setup', async () => {
    const db = fs('sales1');
    await assertFails(updateDoc(doc(db, 'devices', 'devRevoked'), { status: 'active', lastSeen: now() }));
    await assertFails(setDoc(doc(db, 'devices', 'devRevoked'), { ...DEVICE, isActive: true, fcmToken: 't', status: 'active' }, { merge: true }));
    await assertSucceeds(updateDoc(doc(db, 'devices', 'devRetired'),
      { status: 'active', retiredReason: deleteField(), replacedBy: deleteField(), lastSeen: now(), platform: 'android' }));
  });
  it('managers rename, reassign and revoke; members cannot reassign', async () => {
    await assertFails(updateDoc(doc(fs('sales2'), 'devices', 'dev1'), { userId: 'sales2' }));
    await assertFails(updateDoc(doc(fs('sales1'), 'devices', 'dev1'), { userId: 'sales2' }));
    await assertSucceeds(updateDoc(doc(fs('mgr1'), 'devices', 'dev1'),
      { deviceName: 'X', deviceNumber: '0003', locationId: 'T2', accountId: 'a', accountName: 'A' }));
    await assertSucceeds(updateDoc(doc(fs('mgr1'), 'devices', 'dev1'), { userId: 'sales2', isActive: false }));
    await assertSucceeds(updateDoc(doc(fs('mgr1'), 'devices', 'dev1'), { status: 'revoked', isActive: false }));
  });
});

describe('notifications', () => {
  it('app may create only notifications for yourself', async () => {
    await assertSucceeds(addDoc(collection(fs('sales1'), 'notifications'), { targetUserId: 'sales1', text: 'hi', createdAt: now() }));
    await assertFails(addDoc(collection(fs('sales1'), 'notifications'), { targetUserId: 'sales2', text: 'hi', createdAt: now() }));
    await assertFails(addDoc(collection(fs('mgr1'), 'notifications'), { targetUserId: 'sales2', text: 'hi', createdAt: now() }));
  });
});

describe('mp_sms', () => {
  const sms = (extra = {}) => ({
    to: '+15555550123', body: 'Hi', kind: 'manual', storeId: 'T1', createdBy: 'sales1', status: 'queued',
    sendAt: now(), attempts: 0, createdAt: now(), ...extra,
  });
  it('person-sent kinds are allowed (sendText shapes)', async () => {
    await assertSucceeds(addDoc(collection(fs('sales1'), 'mp_sms'), sms({ leadId: 'l1' })));
    await assertSucceeds(addDoc(collection(fs('sales1'), 'mp_sms'), sms({ kind: 'quote', customerId: 'c1' })));
    await assertSucceeds(addDoc(collection(fs('sales1'), 'mp_sms'), sms({ kind: 'referral' })));
  });
  it('automatic kinds, extra fields, scheduling and other senders are denied', async () => {
    await assertFails(addDoc(collection(fs('sales1'), 'mp_sms'), sms({ kind: 'cadence' })));
    await assertFails(addDoc(collection(fs('sales1'), 'mp_sms'), sms({ kind: 'auto_lead' })));
    await assertFails(addDoc(collection(fs('sales1'), 'mp_sms'), sms({ ownerUid: 'x' })));
    await assertFails(addDoc(collection(fs('sales1'), 'mp_sms'), sms({ sendAt: now() + 60 * 60 * 1000 })));
    await assertFails(addDoc(collection(fs('sales1'), 'mp_sms'), sms({ createdBy: 'sales2' })));
    await assertFails(addDoc(collection(fs('sales1'), 'mp_sms'), sms({ status: 'sent' })));
    await assertFails(addDoc(collection(fs('pend1'), 'mp_sms'), sms({ createdBy: 'pend1' })));
  });
});

describe('mp_audit', () => {
  const entry = (extra = {}) => ({ actorUid: 'sales1', actorName: 'Sam', action: 'device.edit', target: 'd1', details: 'x', ts: now(), ...extra });
  it('writeAudit shape in your own name works', async () => {
    await assertSucceeds(addDoc(collection(fs('sales1'), 'mp_audit'), entry()));
    await assertSucceeds(addDoc(collection(fs('sales1'), 'mp_audit'), entry({ target: '' })));
  });
  it('someone else\'s name or a different shape is denied', async () => {
    await assertFails(addDoc(collection(fs('sales1'), 'mp_audit'), entry({ actorUid: 'admin1' })));
    await assertFails(addDoc(collection(fs('sales1'), 'mp_audit'), entry({ extra: 1 })));
    await assertFails(addDoc(collection(fs('sales1'), 'mp_audit'), entry({ ts: 'now' })));
    await assertFails(addDoc(collection(fs('pend1'), 'mp_audit'), entry({ actorUid: 'pend1' })));
  });
});

describe('mp_storefronts', () => {
  const sf = (uid, published) => ({ userId: uid, title: 't', tagline: '', phone: '', locationIds: [], pinnedCartIds: [],
    showNew: true, showUsed: true, published, createdAt: now(), updatedAt: now() });
  it('members save drafts; publishing needs a manager', async () => {
    await assertSucceeds(setDoc(doc(fs('sales2'), 'mp_storefronts', 'sam-draft'), sf('sales2', false)));
    await assertFails(setDoc(doc(fs('sales2'), 'mp_storefronts', 'sam-live'), sf('sales2', true)));
    await assertSucceeds(setDoc(doc(fs('mgr1'), 'mp_storefronts', 'mgr-live'), sf('mgr1', true)));
  });
  it('members cannot publish or keep editing a published page; managers can publish theirs', async () => {
    await assertFails(setDoc(doc(fs('sales1'), 'mp_storefronts', 'sales1-draft'), sf('sales1', true)));
    await assertFails(setDoc(doc(fs('sales1'), 'mp_storefronts', 'sales1-live'), sf('sales1', true)));
    await assertSucceeds(setDoc(doc(fs('sales1'), 'mp_storefronts', 'sales1-live'), sf('sales1', false)));
    await assertSucceeds(setDoc(doc(fs('mgr1'), 'mp_storefronts', 'sales1-draft'), sf('sales1', true)));
  });
  it('"tigon" is reserved for admins', async () => {
    await assertFails(setDoc(doc(fs('mgr1'), 'mp_storefronts', 'tigon'), sf('mgr1', false)));
    await assertSucceeds(setDoc(doc(fs('admin1'), 'mp_storefronts', 'tigon'), sf('admin1', true)));
  });
});
