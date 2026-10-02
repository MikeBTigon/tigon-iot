// Webhook Flows — shared data model.
// KEEP IN SYNC with functions/src/wh/types.ts (identical copy; functions can't import frontend code).

export const WH = {
  domains: 'wh_domains',
  flows: 'wh_flows',
  webhooks: 'wh_webhooks',
  submissions: 'wh_submissions',
  stepRuns: 'wh_step_runs',
  templates: 'wh_email_templates',
  integrations: 'wh_integrations',
  /** Credentials per integration/webhook; readable only by Cloud Functions. */
  integrationSecrets: 'wh_integration_secrets',
  /** wh_settings/global — global defaults + masterFlowId. */
  settings: 'wh_settings',
  /** Rows waiting to be appended to Google Sheets in batches (server only). */
  sheetBuffer: 'wh_sheet_buffer',
  /** Rate-limit counters (server only). */
  rate: 'wh_rate',
  /** Daily counters for the dashboard: wh_stats/d_YYYYMMDD (server only writes). */
  stats: 'wh_stats',
} as const;

/** Public ingestion path (Hosting rewrite → whIngest). */
export const HOOK_PATH = '/hooks/';

/** The 18 standard lead fields, in display/sheet order. user_ip is always captured by the server. */
export const LEAD_FIELDS = [
  'form_name', 'first_name', 'last_name', 'phone1', 'phone2', 'address', 'email', 'zip_code',
  'model', 'brand', 'vin_number', 'sku_number', 'user_ip', 'url', 'comments',
  'image_1', 'image_2', 'image_3',
] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

export const IMAGE_FIELDS = ['image_1', 'image_2', 'image_3'] as const;

/** Tracking fields captured by the embed snippet (plus user_agent from the request). */
export const TRACKING_FIELDS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'ga_client_id', 'referrer', 'user_agent',
] as const;
export type TrackingField = (typeof TRACKING_FIELDS)[number];

// ---------------------------------------------------------------------------
// Settings (cascade: global → master flow → domain → webhook flow → webhook; most specific wins)
// ---------------------------------------------------------------------------

export interface SpamSettings {
  /** Hidden input that must stay empty (default "website"). */
  honeypotField?: string;
  /** Cloudflare Turnstile secret; when set, a valid cf-turnstile-response token is required. */
  turnstileSecret?: string;
  /** Max submissions per IP per minute (default 10) and per webhook key per minute (default 120). */
  perIpPerMinute?: number;
  perKeyPerMinute?: number;
  blockedIps?: string[];
  /** Case-insensitive words; a hit marks the submission as spam. */
  blockedWords?: string[];
}

export interface WhSettings {
  // Email
  emailTo?: string[];
  emailCc?: string[];
  emailBcc?: string[];
  emailTemplateId?: string;
  emailFromName?: string;
  emailReplyTo?: string;
  /** SMTP integration id used to send. */
  smtpIntegrationId?: string;
  autoReplyEnabled?: boolean;
  autoReplyTemplateId?: string;
  // Google Sheets
  sheetId?: string;
  sheetTab?: string;
  // DMS
  dmsEnabled?: boolean;
  dmsIntegrationId?: string;
  // GA4 (Measurement Protocol)
  ga4MeasurementId?: string;
  ga4ApiSecret?: string;
  /** Shown on Settings → Google (set by whGoogle). */
  ga4Property?: string;
  ga4ConnectedAt?: number;
  // Validation / spam / dedupe
  requiredFields?: string[];
  spam?: SpamSettings;
  dedupeWindowHours?: number;
  dedupeMatchOn?: string[];
  // TIGON IOT integration
  /** Create a lead in MP Leads (mp_leads) for each submission. */
  createLead?: boolean;
  leadOwnerUid?: string;
  /** Users who get an IoT notification (phone push) for each lead. */
  notifyUids?: string[];
  // Website
  thankYouUrl?: string;
  /** Extra origins allowed by CORS (the domain URL is always allowed). */
  allowedOrigins?: string[];
  /** Days without leads before an alert (default 3; 0 = off). */
  alertNoLeadsDays?: number;
  /** 'replace' (default): a non-empty To/CC/BCC here replaces the inherited list. 'add': merged with it. */
  emailInheritMode?: 'replace' | 'add';
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface WhDomain {
  id: string;
  name: string;
  /** https://example.com */
  url: string;
  status: 'active' | 'paused';
  platform?: 'wordpress' | 'webflow' | 'wix' | 'squarespace' | 'shopify' | 'custom' | string;
  /** MP Leads channel for leads from this website (default 'dba_website'). */
  leadChannel?: string;
  settings: WhSettings;
  /** Updated by ingest (at most once a minute); used by the no-leads alert. */
  lastReceivedAt?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type StepType =
  | 'validate'
  | 'dedupe'
  | 'condition'
  | 'email'
  | 'sheets'
  | 'ga4'
  | 'dms_sync'
  | 'webhook_out'
  | 'delay'
  | 'create_lead'
  | 'notify'
  | 'forward_to_master';

export type ConditionOp =
  | '==' | '!=' | 'contains' | 'not_contains' | 'starts_with' | 'empty' | 'not_empty' | '>' | '<';

/**
 * Step configs (by type):
 * - validate: { required?: string[] }  (defaults to settings.requiredFields)
 * - dedupe: { matchOn?: string[], windowHours?: number, onDuplicate?: 'stop' | 'continue' }
 * - condition: { field, op: ConditionOp, value?, then: stepId | 'continue' | 'stop', else: stepId | 'continue' | 'stop' }
 * - email: { templateId?, to?, cc?, bcc?, subject? }  (unset → inherit from settings)
 * - sheets: { spreadsheetId?: string | 'inherit', tab?: string, columns?: string[] }
 * - ga4: { event?: string (default 'generate_lead') }
 * - dms_sync: { integrationId?: string | 'inherit' }
 * - webhook_out: { url, method?: 'POST' | 'PUT', headers?: Record<string,string>, format?: 'json' | 'form' }
 * - delay: { minutes: number }
 * - create_lead: { ownerUid?: string }
 * - notify: { uids?: string[], text?: string }
 * - forward_to_master: {}
 */
export interface FlowStep {
  /** Stable id within the flow (used by condition jumps and step_runs). */
  id: string;
  type: StepType;
  name?: string;
  enabled?: boolean;
  config: Record<string, unknown>;
}

export interface WhFlow {
  id: string;
  name: string;
  /** 'master' = the single Master Flow; 'template' = shared by many webhooks; 'webhook' = one webhook's own flow. */
  type: 'webhook' | 'master' | 'template';
  steps: FlowStep[];
  settings: WhSettings;
  /** Webhook/template flows forward to the Master Flow at the end (unless they already have a forward step). */
  forwardToMaster: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WhWebhook {
  id: string;
  /** Random 32-char key used in the URL. */
  key: string;
  domainId: string;
  flowId: string;
  formName: string;
  status: 'active' | 'paused';
  settings: WhSettings;
  /** Incoming field name → standard field (e.g. { fname: 'first_name' }). */
  fieldMap: Record<string, string>;
  /** When true, requests must carry X-Tigon-Signature: sha256=<hmac of raw body> (secret in wh_integration_secrets/webhook_<id>). */
  hmacRequired: boolean;
  lastReceivedAt?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type SubmissionStatus = 'queued' | 'processing' | 'done' | 'partial' | 'failed' | 'spam' | 'duplicate';

export type SubmissionFields = Partial<Record<LeadField | TrackingField, string>>;

export interface WhSubmission extends SubmissionFields {
  id: string;
  webhookId: string;
  domainId: string;
  flowId: string;
  status: SubmissionStatus;
  isDuplicate: boolean;
  isSpam: boolean;
  spamReason?: string;
  duplicateOf?: string;
  /** Everything received (after file uploads were replaced by URLs), for audit. */
  rawPayload: Record<string, unknown>;
  receivedAt: number;
  processedAt?: number;
  /** Where the engine is: which flow and which step index to run next. */
  cursor: { flow: 'webhook' | 'master'; index: number } | null;
  /** When a delay/retry makes the submission wait. */
  nextRunAt?: number;
  /** Lead id returned by the DMS (ADF/HTTP), for tracking. */
  dmsLeadId?: string;
  /** mp_leads doc created from this submission. */
  mpLeadId?: string;
  /** Short counters for list views. */
  stepsOk?: number;
  stepsFailed?: number;
  /** Engine lease: another worker must not pick the submission up before this time. */
  leaseUntil?: number;
  /** Set when a step went to the dead-letter list. */
  hasDead?: boolean;
  /** Created by "Send test": emails get a [TEST] subject; GA4, CRM lead and DMS are skipped. */
  isTest?: boolean;
  /** e.g. "email:x@y.com", "phone:5551234567" — used for duplicate lookups (array-contains). */
  dedupeKeys?: string[];
  /** Validation failure message / last step error. */
  error?: string;
  lastError?: string;
}

export type StepRunStatus = 'success' | 'failed' | 'retrying' | 'skipped' | 'dead';

/** wh_step_runs/{submissionId}_{flowKind}_{stepId} — one row per step per submission (the audit log). */
export interface WhStepRun {
  id: string;
  submissionId: string;
  webhookId: string;
  domainId: string;
  flowId: string;
  flowKind: 'webhook' | 'master';
  stepId: string;
  stepType: StepType;
  status: StepRunStatus;
  attempts: number;
  error?: string;
  response?: Record<string, unknown>;
  startedAt: number;
  finishedAt?: number;
  nextAttemptAt?: number;
  /** Stored jump/outcome so a replay that skips a finished step still follows it. */
  next?: string | null;
  outcome?: string | null;
}

/** Retry delays after each failed attempt; after the last one the step is 'dead' (dead-letter list). */
export const RETRY_DELAYS_MIN = [1, 5, 30, 120, 720];

export interface WhEmailTemplate {
  id: string;
  name: string;
  /** Merge tags: {{first_name}} … {{all_fields_table}}, {{#if image_1}}…{{/if}} */
  subject: string;
  htmlBody: string;
  textBody: string;
  createdAt: number;
  updatedAt: number;
}

export type IntegrationType = 'smtp' | 'google_sheets' | 'dms' | 'ga4';

/** Non-secret config per type:
 * - smtp: { host, port, secure, fromEmail, fromName }   secrets: { user, pass }
 * - google_sheets: { note? } (uses the functions service account; share sheets with it)
 * - dms: { delivery: 'http' | 'email', url?, emailTo?, vendorName?, providerName? }  secrets: { headerName?, headerValue?, basicUser?, basicPass? }
 * - ga4: {} (per-domain ids live in settings)
 */
export interface WhIntegration {
  id: string;
  type: IntegrationType;
  name: string;
  config: Record<string, unknown>;
  credentialsSetAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface WhGlobalSettings extends WhSettings {
  masterFlowId?: string;
  /** Default template flow assigned by "Add Website". */
  defaultFlowId?: string;
  /** Delete submissions older than this many days (0 = keep forever). */
  retentionDays?: number;
  /** Alert when more than this many step failures happen in one hour (default 20; 0 = off). */
  failureSpikePerHour?: number;
}

/** wh_stats/d_YYYYMMDD (America/New_York day). Maps are keyed by domain/webhook id. */
export interface WhDayStats {
  day: string;
  total: number;
  spam: number;
  duplicate: number;
  failedSteps: number;
  byDomain: Record<string, number>;
  byWebhook: Record<string, number>;
  bySource: Record<string, number>;
  updatedAt: number;
}
