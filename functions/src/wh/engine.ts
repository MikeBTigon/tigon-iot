// Webhook Flows — the flow engine. Runs a submission through its webhook flow, then the Master Flow.
// Durable & idempotent: every step writes wh_step_runs/{submissionId}_{flowKind}_{stepId}; a step that already
// succeeded is never re-run (replays/retries are safe). Failed steps retry on RETRY_DELAYS_MIN and then go to
// the dead-letter list while the flow continues with the next step.
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {RETRY_DELAYS_MIN, WH} from './types';
import type {FlowStep, StepType, WhFlow, WhSubmission} from './types';
import type {StepContext, StepHandler, StepResult} from './engineTypes';
import {db, loadConfigForSubmission} from './config';
import type {WhConfig} from './config';
import {CORE_STEPS, NEXT_MASTER} from './coreSteps';
import {dedupeKeys, normalizePatch} from './fields';
import {bumpStats} from './stats';
import {INTEGRATION_STEPS, flushSheetBuffer} from './steps';

export const LEASE_MS = 5 * 60_000;
export const STEP_TIMEOUT_MS = 55_000;
const MAX_STEPS_PER_RUN = 200;
export const FINISHED_STATUSES = ['done', 'partial', 'failed', 'spam', 'duplicate'];
/** Step run statuses that are final: the engine advances past them without re-running. */
const FINAL_RUN = ['success', 'skipped', 'dead'];

type FlowKind = 'webhook' | 'master';
type Cursor = {flow: FlowKind; index: number};
const del = () => admin.firestore.FieldValue.delete();

// ---------------------------------------------------------------------------
// Test hook: override a step type's handler (null restores the real one).
// ---------------------------------------------------------------------------
const testHandlers = new Map<string, StepHandler>();
export function __setTestHandler(type: StepType | string, fn: StepHandler | null) {
  if (fn) testHandlers.set(type, fn);
  else testHandlers.delete(type);
}

export function handlerFor(type: StepType): StepHandler | undefined {
  return testHandlers.get(type) || CORE_STEPS[type] || INTEGRATION_STEPS[type];
}

export const runIdFor = (submissionId: string, flowKind: FlowKind, stepId: string) => `${submissionId}_${flowKind}_${stepId}`;

/** Minutes to wait after failed attempt `attempt` (1-based), or null when the step is dead. */
export function retryDelayMin(attempt: number): number | null {
  return attempt >= 1 && attempt <= RETRY_DELAYS_MIN.length ? RETRY_DELAYS_MIN[attempt - 1] : null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_r, reject) => {
      t = setTimeout(() => reject(new Error(`Step timed out after ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 1000);

// ---------------------------------------------------------------------------
// Claim / lease
// ---------------------------------------------------------------------------

/** Take the lease on a submission. Returns null when it's finished, leased by another worker or not due yet. */
export async function claimSubmission(id: string, force = false): Promise<WhSubmission | null> {
  const ref = db().collection(WH.submissions).doc(id);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data() as WhSubmission;
    const now = Date.now();
    if (FINISHED_STATUSES.includes(d.status)) return null;
    if (d.status === 'processing' && (d.leaseUntil || 0) > now) return null;
    if (!force && (d.nextRunAt || 0) > now) return null;
    // nextRunAt = lease end, so a crashed worker's submission is picked up again after the lease.
    tx.update(ref, {status: 'processing', leaseUntil: now + LEASE_MS, nextRunAt: now + LEASE_MS});
    return {...d, id: snap.id};
  });
}

export interface ProcessResult {
  id: string;
  /** Submission status after this run, or 'skipped' when it could not be claimed. */
  status: string;
  ran: number;
}

/** Run a submission from its cursor until it finishes, waits (delay/retry) or the time budget ends. */
export async function processSubmission(id: string, opts: {deadline?: number; force?: boolean} = {}): Promise<ProcessResult> {
  const sub = await claimSubmission(id, !!opts.force);
  if (!sub) return {id, status: 'skipped', ran: 0};
  const deadline = opts.deadline || Date.now() + 45_000;
  try {
    const cfg = await loadConfigForSubmission(sub);
    return await new Runner(sub, cfg, deadline).run();
  } catch (e) {
    logger.error('wh engine: run crashed', {id, error: errMsg(e)});
    await db().collection(WH.submissions).doc(id).update({
      status: 'queued', nextRunAt: Date.now() + 60_000, leaseUntil: del(), lastError: 'Engine error: ' + errMsg(e),
    }).catch(() => undefined);
    return {id, status: 'queued', ran: 0};
  }
}

class Runner {
  private cursor: Cursor;
  private stepsOk: number;
  private stepsFailed: number;
  private hasDead: boolean;
  private isDuplicate: boolean;
  private ran = 0;
  private ref: admin.firestore.DocumentReference;

  constructor(private sub: WhSubmission, private cfg: WhConfig, private deadline: number) {
    this.cursor = sub.cursor ? {...sub.cursor} : {flow: 'webhook', index: 0};
    this.stepsOk = sub.stepsOk || 0;
    this.stepsFailed = sub.stepsFailed || 0;
    this.hasDead = !!sub.hasDead;
    this.isDuplicate = !!sub.isDuplicate;
    this.ref = db().collection(WH.submissions).doc(sub.id);
  }

  private flowOf(kind: FlowKind): WhFlow | null {
    return kind === 'webhook' ? this.cfg.flow : this.cfg.master;
  }

  private counters() {
    return {stepsOk: this.stepsOk, stepsFailed: this.stepsFailed, hasDead: this.hasDead, isDuplicate: this.isDuplicate};
  }

  private get isTest() {
    return !!(this.sub as unknown as {isTest?: boolean}).isTest;
  }

  /** Persist progress (and keep the lease). */
  private async save(patch: Record<string, unknown> = {}) {
    const now = Date.now();
    await this.ref.update({...patch, cursor: this.cursor, ...this.counters(), leaseUntil: now + LEASE_MS, nextRunAt: now + LEASE_MS});
  }

  /** Pause: release the lease and come back at `at`. */
  private async pause(at: number, patch: Record<string, unknown> = {}): Promise<ProcessResult> {
    await this.ref.update({...patch, cursor: this.cursor, ...this.counters(), status: 'queued', nextRunAt: at, leaseUntil: del()});
    return {id: this.sub.id, status: 'queued', ran: this.ran};
  }

  private async finish(status?: string, patch: Record<string, unknown> = {}): Promise<ProcessResult> {
    const final = status || (this.hasDead || this.stepsFailed > 0 ? 'partial' : 'done');
    await this.ref.update({
      ...patch, ...this.counters(), status: final, cursor: null, processedAt: Date.now(), nextRunAt: del(), leaseUntil: del(),
    });
    if (final === 'duplicate' && !this.isTest) await bumpStats({duplicate: 1});
    return {id: this.sub.id, status: final, ran: this.ran};
  }

  /** End of the current flow. Returns true when the Master Flow starts. */
  private async endFlow(viaForwardStep: boolean): Promise<boolean> {
    if (this.cursor.flow !== 'webhook') return false;
    const forward = viaForwardStep || this.cfg.flow?.forwardToMaster !== false;
    const master = this.cfg.master;
    if (!forward || !master || master.id === this.cfg.flow?.id) return false;
    this.cursor = {flow: 'master', index: 0};
    // Master normalize: email lowercase, phones formatted, names capitalized.
    const patch: Record<string, unknown> = normalizePatch(this.sub as unknown as Record<string, unknown>);
    Object.assign(this.sub, patch);
    patch.dedupeKeys = dedupeKeys(this.sub as unknown as Record<string, unknown>);
    await this.save(patch);
    return true;
  }

  /** Move the cursor after a step. Returns 'finish' when the whole run is over. */
  private async move(next: string | undefined | null, steps: FlowStep[]): Promise<'go' | 'finish'> {
    if (next === NEXT_MASTER) return (await this.endFlow(true)) ? 'go' : 'finish';
    if (next === 'stop') return (await this.endFlow(false)) ? 'go' : 'finish';
    if (next && next !== 'continue') {
      const idx = steps.findIndex((s) => s.id === next);
      if (idx >= 0) {
        this.cursor = {...this.cursor, index: idx};
        return 'go';
      }
      logger.warn('wh engine: jump target not found', {submissionId: this.sub.id, next});
    }
    this.cursor = {...this.cursor, index: this.cursor.index + 1};
    return 'go';
  }

  async run(): Promise<ProcessResult> {
    for (let guard = 0; ; guard++) {
      if (guard > MAX_STEPS_PER_RUN) {
        logger.error('wh engine: too many steps (loop?)', {submissionId: this.sub.id});
        this.stepsFailed++;
        return this.finish('partial', {lastError: 'Flow stopped: too many steps (check condition jumps for loops)'});
      }
      if (Date.now() > this.deadline) return this.pause(Date.now());

      const flow = this.flowOf(this.cursor.flow);
      const steps = flow?.steps || [];
      if (this.cursor.index >= steps.length) {
        if (await this.endFlow(false)) continue;
        return this.finish();
      }
      const step = steps[this.cursor.index];
      if (step.enabled === false) {
        this.cursor = {...this.cursor, index: this.cursor.index + 1};
        continue;
      }
      const flowKind = this.cursor.flow;
      const runId = runIdFor(this.sub.id, flowKind, step.id);
      const runRef = db().collection(WH.stepRuns).doc(runId);
      const prev = (await runRef.get()).data() as (Record<string, unknown> | undefined);

      // Idempotency: finished runs are not repeated, but their control flow is honored.
      if (prev && FINAL_RUN.includes(String(prev.status))) {
        if (prev.status === 'dead') {
          this.cursor = {...this.cursor, index: this.cursor.index + 1};
          continue;
        }
        if (prev.outcome === 'duplicate') {
          this.isDuplicate = true;
          if (prev.next === 'stop') return this.finish('duplicate');
        }
        if ((await this.move(prev.next as string | undefined, steps)) === 'finish') return this.finish();
        continue;
      }

      const attempt = Number(prev?.attempts || 0) + 1;
      const ctx: StepContext = {
        submission: this.sub,
        settings: this.cfg.settings,
        step: {...step, config: step.config || {}},
        flowKind,
        domain: this.cfg.domain,
        webhook: this.cfg.webhook,
        attempt,
        runId,
        flowId: flow?.id || '',
      };
      const handler = handlerFor(step.type);
      const startedAt = Date.now();
      let result: StepResult;
      if (!handler) {
        result = {status: 'skipped', response: {reason: `Unknown step type "${step.type}"`}};
      } else {
        try {
          result = await withTimeout(handler(ctx), Math.max(10_000, Math.min(STEP_TIMEOUT_MS, this.deadline + 30_000 - Date.now())));
          if (!result || !['success', 'skipped', 'failed'].includes(result.status)) {
            result = {status: 'failed', error: 'Step returned no result', retryable: true};
          }
        } catch (e) {
          result = {status: 'failed', error: errMsg(e), retryable: true};
        }
      }
      this.ran++;
      const base: Record<string, unknown> = {
        id: runId, submissionId: this.sub.id, webhookId: this.sub.webhookId || '', domainId: this.sub.domainId || '',
        flowId: flow?.id || '', flowKind, stepId: step.id, stepType: step.type, attempts: attempt,
        startedAt, finishedAt: Date.now(), response: sanitizeResponse(result.response),
      };
      const patch = (result.patch || {}) as Record<string, unknown>;
      delete patch.id;
      Object.assign(this.sub, patch);

      if (result.status !== 'failed') {
        await runRef.set({...base, status: result.status, next: result.next ?? null, outcome: result.outcome ?? null});
        if (result.status === 'success') this.stepsOk++;
        if (result.outcome === 'spam') {
          return this.finish('spam', {...patch, isSpam: true, spamReason: result.error || 'Marked as spam by the flow'});
        }
        if (result.outcome === 'duplicate') {
          this.isDuplicate = true;
          if (result.next === 'stop') return this.finish('duplicate', patch);
        }
        if (result.waitUntil && result.waitUntil > Date.now()) {
          this.cursor = {...this.cursor, index: this.cursor.index + 1};
          return this.pause(result.waitUntil, patch);
        }
        if ((await this.move(result.next, steps)) === 'finish') return this.finish(undefined, patch);
        await this.save(patch);
        continue;
      }

      // Failure
      const error = result.error || 'Step failed';
      const label = step.name || step.type;
      if (result.retryable === false && result.next === 'stop') {
        // Validation-style failure: the submission itself is bad — stop everything.
        await runRef.set({...base, status: 'failed', error});
        this.stepsFailed++;
        if (!this.isTest) await bumpStats({failedSteps: 1});
        return this.finish('failed', {...patch, error});
      }
      const delayMin = result.retryable === false ? null : retryDelayMin(attempt);
      if (delayMin !== null) {
        const nextAttemptAt = Date.now() + delayMin * 60_000;
        await runRef.set({...base, status: 'retrying', error, nextAttemptAt});
        logger.info('wh engine: step will retry', {submissionId: this.sub.id, stepId: step.id, attempt, delayMin, error});
        return this.pause(nextAttemptAt, {...patch, lastError: `${label}: ${error}`});
      }
      await runRef.set({...base, status: 'dead', error});
      logger.warn('wh engine: step dead', {submissionId: this.sub.id, stepId: step.id, attempt, error});
      this.hasDead = true;
      this.stepsFailed++;
      if (!this.isTest) await bumpStats({failedSteps: 1});
      this.cursor = {...this.cursor, index: this.cursor.index + 1};
      await this.save({...patch, lastError: `${label}: ${error}`});
    }
  }
}

function sanitizeResponse(r: unknown): Record<string, unknown> {
  if (!r || typeof r !== 'object') return {};
  try {
    const s = JSON.stringify(r);
    if (s.length > 20_000) return {truncated: true, preview: s.slice(0, 2000)};
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/** Run one step of a submission on its own (replay mode 'step'). Does not move the cursor. */
export async function runSingleStep(id: string, flowKind: FlowKind, stepId: string): Promise<{status: string; error?: string}> {
  const snap = await db().collection(WH.submissions).doc(id).get();
  if (!snap.exists) return {status: 'missing'};
  const sub = {...snap.data(), id} as WhSubmission;
  const cfg = await loadConfigForSubmission(sub, true);
  const flow = flowKind === 'webhook' ? cfg.flow : cfg.master;
  const step = flow?.steps.find((s) => s.id === stepId);
  if (!step) return {status: 'missing', error: 'Step not found in the flow'};
  const runId = runIdFor(id, flowKind, stepId);
  const runRef = db().collection(WH.stepRuns).doc(runId);
  const prev = (await runRef.get()).data();
  const attempt = Number(prev?.attempts || 0) + 1;
  const handler = handlerFor(step.type);
  const startedAt = Date.now();
  let result: StepResult;
  if (!handler) result = {status: 'skipped', response: {reason: 'Unknown step type'}};
  else {
    try {
      result = await withTimeout(handler({
        submission: sub, settings: cfg.settings, step: {...step, config: step.config || {}}, flowKind,
        domain: cfg.domain, webhook: cfg.webhook, attempt, runId, flowId: flow?.id || '',
      }), STEP_TIMEOUT_MS);
    } catch (e) {
      result = {status: 'failed', error: errMsg(e)};
    }
  }
  const status = result.status === 'failed' ? 'dead' : result.status;
  await runRef.set({
    id: runId, submissionId: id, webhookId: sub.webhookId || '', domainId: sub.domainId || '', flowId: flow?.id || '',
    flowKind, stepId, stepType: step.type, attempts: attempt, startedAt, finishedAt: Date.now(),
    response: sanitizeResponse(result.response), status, next: result.next ?? null, outcome: result.outcome ?? null,
    ...(result.error ? {error: result.error} : {}),
  });
  const upd: Record<string, unknown> = {...(result.patch || {})};
  delete upd.id;
  if (status === 'dead') upd.hasDead = true;
  if (Object.keys(upd).length) await snap.ref.update(upd);
  return {status, error: result.error};
}

// ---------------------------------------------------------------------------
// Scheduler: every minute, run everything that is due.
// ---------------------------------------------------------------------------

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<unknown>) {
  let i = 0;
  const workers = Array.from({length: Math.min(size, items.length)}, async () => {
    while (i < items.length) {
      const x = items[i++];
      await fn(x);
    }
  });
  await Promise.all(workers);
}

/** Process due submissions until the budget is used. Exported for tests. */
export async function runDue(budgetMs = 480_000, concurrency = 10) {
  const started = Date.now();
  const deadline = started + budgetMs;
  const stats = {claimed: 0, finished: 0, waiting: 0};
  const seen = new Set<string>();
  while (Date.now() < deadline - 5_000) {
    const snap = await db().collection(WH.submissions).where('nextRunAt', '<=', Date.now()).orderBy('nextRunAt').limit(300).get();
    const ids = snap.docs.map((d) => d.id).filter((id) => !seen.has(id));
    if (!ids.length) break;
    ids.forEach((id) => seen.add(id));
    await pool(ids, concurrency, async (id) => {
      if (Date.now() > deadline - 5_000) return;
      const r = await processSubmission(id, {deadline: Math.min(deadline, Date.now() + 120_000)});
      if (r.status === 'skipped') return;
      stats.claimed++;
      if (FINISHED_STATUSES.includes(r.status)) stats.finished++;
      else stats.waiting++;
    });
    if (snap.size < 300) break;
  }
  return {...stats, ms: Date.now() - started};
}

export const whProcess = onSchedule({schedule: 'every 1 minutes', timeoutSeconds: 540, memory: '512MiB'}, async () => {
  const r = await runDue(420_000, 10); // leaves ~60s for flushSheetBuffer + slack
  let sheets = {rows: 0, errors: 0};
  try {
    sheets = await flushSheetBuffer();
  } catch (e) {
    logger.error('wh flushSheetBuffer failed', e);
  }
  if (r.claimed || sheets.rows || sheets.errors) logger.info('wh process', {...r, sheets});
});
