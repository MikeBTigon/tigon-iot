// Shared setup for the security rules tests. Run through `npm test` (starts the Firestore + Storage emulators).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const root = fileURLToPath(new URL('../../', import.meta.url));

export const PROJECT_ID = 'demo-tigon';

/** Starts a test environment against the running emulators (host/port from the env set by emulators:exec). */
export async function makeEnv() {
  const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  const [stHost, stPort] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199').split(':');
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(`${root}firestore.rules`, 'utf8'), host: fsHost, port: Number(fsPort) },
    storage: { rules: readFileSync(`${root}storage.rules`, 'utf8'), host: stHost, port: Number(stPort) },
  });
}

/** Auth token claims for a company account (verified unless told otherwise). */
export const claims = (name, verified = true) => ({ email: `${name}@tigongolfcarts.com`, email_verified: verified });

/** A signed-in person's context. */
export const as = (env, uid, verified = true) => env.authenticatedContext(uid, claims(uid, verified));
