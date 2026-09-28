// Webhook Flows — website forms → flows (email, Google Sheets, DMS, GA4, …) → Master Flow.
// Placeholder exports; implemented by the Webhook Flows engine.
import {onRequest} from 'firebase-functions/v2/https';

export const whIngest = onRequest((_req, res) => {
  res.status(503).json({ok: false, error: 'not ready'});
});
