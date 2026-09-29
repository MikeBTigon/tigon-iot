// Webhook Flows — website forms → flows (email, Google Sheets, DMS, GA4, …) → Master Flow.
// Deployed function names are fixed (see the deploy workflow):
//   whIngest      POST /hooks/{key}            public ingestion (Hosting rewrite)
//   whProcess     every minute                 runs due submissions through their flows, flushes Sheets rows
//   whReplay      callable (manager)           re-run failed / all / one step of submissions
//   whTestEmail   callable (manager)           send a test email
//   whTestWebhook callable (manager)           create + run a test submission
//   whDeleteSubmissions callable (manager)     permanently delete submissions (single or bulk)
//   whAlerts      hourly                       "no leads" and failure-spike alerts
//   whMaintenance daily 03:15 New York         retention, rate-counter cleanup, Master Digest email
//   whOnSubmission (only when WH_REALTIME=true) runs new submissions immediately
export {whIngest} from './ingest';
export {whProcess} from './engine';
export {whReplay, whTestWebhook, whDeleteSubmissions} from './admin';
export {whTestEmail} from './steps';
export {whAlerts} from './alerts';
export {whMaintenance} from './maintenance';

if (process.env.WH_REALTIME === 'true') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  exports.whOnSubmission = require('./realtime').whOnSubmission;
}
