// Storage security rules tests ("Harden & polish" release).
import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { as, makeEnv } from './helpers.mjs';

let env;
const bytes = new Uint8Array([1, 2, 3, 4]);

before(async () => {
  env = await makeEnv();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref('mp_assets/seed-logo.png').put(bytes, { contentType: 'image/png' });
  });
});
after(async () => { await env?.cleanup(); });

const st = (uid, verified = true) => as(env, uid, verified).storage();
const put = (uid, path, contentType, verified = true) => st(uid, verified).ref(path).put(bytes, { contentType });

describe('storage: verified email', () => {
  it('unverified account cannot read or upload', async () => {
    await assertFails(st('u1', false).ref('mp_assets/seed-logo.png').getMetadata());
    await assertFails(put('u1', 'mp_assets/a-logo.png', 'image/png', false));
  });
  it('verified account can read', async () => {
    await assertSucceeds(st('u1').ref('mp_assets/seed-logo.png').getMetadata());
  });
});

describe('storage: brand library (mp_assets)', () => {
  it('accepts images, fonts and PDFs', async () => {
    await assertSucceeds(put('u1', 'mp_assets/a-logo.png', 'image/png'));
    await assertSucceeds(put('u1', 'mp_assets/b-logo.svg', 'image/svg+xml'));
    await assertSucceeds(put('u1', 'mp_assets/c-flyer.pdf', 'application/pdf'));
    await assertSucceeds(put('u1', 'mp_assets/d-brand.woff2', 'font/woff2'));
    await assertSucceeds(put('u1', 'mp_assets/e-brand.ttf', 'application/octet-stream'));
  });
  it('rejects other files', async () => {
    await assertFails(put('u1', 'mp_assets/f-page.html', 'text/html'));
    await assertFails(put('u1', 'mp_assets/g-app.js', 'application/javascript'));
    await assertFails(put('u1', 'mp_assets/h-clip.mp4', 'video/mp4'));
    await assertFails(put('u1', 'mp_assets/i-blob.bin', 'application/octet-stream'));
  });
});

describe('storage: walk-around videos (mp_videos)', () => {
  it('video only', async () => {
    await assertSucceeds(put('u1', 'mp_videos/cart1/walk.mp4', 'video/mp4'));
    await assertFails(put('u1', 'mp_videos/cart1/walk.png', 'image/png'));
  });
});
