// Public (no sign-in) API handler type for /api/public/<area>/<action>.
export interface PublicRequest {
  method: string;
  /** Query string values. */
  query: Record<string, string>;
  /** Parsed JSON body (POST). */
  body: Record<string, any>;
  /** Path segments after <area>/<action> (e.g. a quote code). */
  rest: string[];
  ip: string;
}

export interface PublicResponse {
  status?: number;
  body: unknown;
  /** Cache-Control max-age seconds for GETs (default 0 = no-store). */
  cacheSeconds?: number;
}

export type PublicHandler = (req: PublicRequest) => Promise<PublicResponse>;

export class PublicError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
