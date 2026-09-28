// Webhook Flows — contract between the flow engine (engine.ts) and step handlers (steps/*).
import type {FlowStep, WhDomain, WhSettings, WhSubmission, WhWebhook} from './types';

export interface StepContext {
  submission: WhSubmission;
  /** Fully resolved settings (global → master → domain → webhook flow → webhook). */
  settings: WhSettings;
  step: FlowStep;
  flowKind: 'webhook' | 'master';
  /** Id of the flow being run (webhook/template flow or the Master Flow). */
  flowId?: string;
  domain: WhDomain | null;
  webhook: WhWebhook | null;
  /** 1 on the first try. */
  attempt: number;
  /** Step runs are idempotent by id; handlers can use it as a dedupe/idempotency key. */
  runId: string;
}

export interface StepResult {
  status: 'success' | 'skipped' | 'failed';
  /** Short, safe-to-show details (message id, row count, HTTP status, …). */
  response?: Record<string, unknown>;
  error?: string;
  /** false = permanent failure (bad config): go straight to the dead-letter list. Default true. */
  retryable?: boolean;
  /** Fields to save on the submission (e.g. { dmsLeadId }, { mpLeadId }). */
  patch?: Partial<WhSubmission>;
  /** Control flow: 'stop' ends this flow; a step id jumps to it; omitted = next step. */
  next?: 'stop' | 'continue' | string;
  /** Delay step: pause the submission until this time (ms). */
  waitUntil?: number;
  /** Mark the submission (dedupe/spam steps). */
  outcome?: 'duplicate' | 'spam';
}

export type StepHandler = (ctx: StepContext) => Promise<StepResult>;
