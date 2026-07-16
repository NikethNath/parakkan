/**
 * In-memory status of the manual "Fetch from CRIS" job. The headless run takes
 * 1-2 minutes — too long to hold an HTTP request open — so the route starts it
 * in the background and the client polls this status. Single droplet process,
 * so a module-level singleton (kept on globalThis across hot-reloads) is enough.
 */

export interface CrisFetchResult {
  ok: boolean;
  imported?: number; // total rows stored (MS + HSD per day)
  days?: number; // distinct business days covered
  from?: string;
  to?: string;
  error?: string;
  step?: string;
}

export interface CrisFetchState {
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  result: CrisFetchResult | null;
}

const g = globalThis as unknown as {
  __crisFetchState?: CrisFetchState;
  __crisMeterFetchState?: CrisFetchState;
};

export function getCrisFetchState(): CrisFetchState {
  if (!g.__crisFetchState) {
    g.__crisFetchState = { running: false, startedAt: null, finishedAt: null, result: null };
  }
  return g.__crisFetchState;
}

/** Same idea, for the per-pump meter-readings (Transaction Report) fetch. */
export function getCrisMeterFetchState(): CrisFetchState {
  if (!g.__crisMeterFetchState) {
    g.__crisMeterFetchState = { running: false, startedAt: null, finishedAt: null, result: null };
  }
  return g.__crisMeterFetchState;
}
