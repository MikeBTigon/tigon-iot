import { doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { randomKey } from './shared';
import { WH } from './types';

/** Doc id of a webhook's signing secret in wh_integration_secrets. */
export const secretDocId = (webhookId: string) => `webhook_${webhookId}`;

/** Creates (or replaces) a webhook's signing secret. Returns the new secret. */
export async function createWebhookSecret(webhookId: string): Promise<string> {
  const secret = randomKey(40);
  await setDoc(doc(db, WH.integrationSecrets, secretDocId(webhookId)), { secret, setAt: Date.now() });
  return secret;
}

