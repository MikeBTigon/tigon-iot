// Webhook Flows — optional realtime trigger (only exported when WH_REALTIME === 'true').
// Without it, whProcess picks new submissions up within a minute.
import * as logger from 'firebase-functions/logger';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import {processSubmission} from './engine';

export const whOnSubmission = onDocumentCreated({document: 'wh_submissions/{id}', timeoutSeconds: 300, memory: '512MiB'}, async (event) => {
  const data = event.data?.data();
  if (!data || data.status !== 'queued') return;
  try {
    await processSubmission(event.params.id, {deadline: Date.now() + 240_000});
  } catch (e) {
    logger.error('whOnSubmission failed', {id: event.params.id, error: String(e)});
  }
});
