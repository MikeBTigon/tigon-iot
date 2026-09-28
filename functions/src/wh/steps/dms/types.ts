// Webhook Flows — DMS adapter contract.
import type {WhIntegration} from '../../types';
import type {StepContext} from '../../engineTypes';

/** The lead in a DMS-neutral shape. */
export interface NormalizedLead {
  submissionId: string;
  receivedAt: number;
  firstName: string;
  lastName: string;
  email: string;
  phone1: string;
  phone2: string;
  address: string;
  zipCode: string;
  brand: string;
  model: string;
  year: string;
  vin: string;
  sku: string;
  comments: string;
  images: string[];
  pageUrl: string;
  formName: string;
  domainName: string;
  domainUrl: string;
  source: Record<string, string>;
  isTest: boolean;
}

export interface DmsAdapter {
  name: string;
  send(lead: NormalizedLead, ctx: StepContext, integration: WhIntegration, secrets: Record<string, string>):
    Promise<{leadId?: string; response: Record<string, unknown>}>;
}

/** Thrown by adapters; retryable=false for configuration problems. */
export class DmsError extends Error {
  constructor(message: string, public retryable: boolean, public response?: Record<string, unknown>) {
    super(message);
  }
}
