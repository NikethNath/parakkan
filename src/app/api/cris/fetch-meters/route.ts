import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getCrisLogin } from "@/lib/crisCreds";
import { fetchTransactionsReport } from "@/services/cris";
import { storeCrisPumpReadings } from "@/services/crisStore";
import { getCrisMeterFetchState } from "@/services/crisFetchState";

// Fetches the CRIS Transaction Report for one day and stores each pump's
// opening/closing totalizer. Long headless-browser run → background job +
// GET polling, same pattern as /api/cris/fetch.
export const maxDuration = 240;

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// GET — current status of the background fetch (for polling).
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const s = getCrisMeterFetchState();
  return NextResponse.json({
    running: s.running,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    result: s.result,
  });
}

// POST — start a background fetch and return immediately (202).
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
  }

  const login = await getCrisLogin();
  if (!login) {
    return NextResponse.json({ error: "CRIS login isn't configured." }, { status: 400 });
  }

  const state = getCrisMeterFetchState();
  if (state.running) {
    return NextResponse.json({ ok: true, running: true }, { status: 202 });
  }

  state.running = true;
  state.startedAt = Date.now();
  state.finishedAt = null;
  state.result = null;

  const { date } = parsed.data;

  // Fire-and-forget: the long Playwright run continues after we respond.
  void (async () => {
    try {
      const result = await fetchTransactionsReport({ ...login, fromDate: date, toDate: date });
      if (result.ok && result.report) {
        const imported = await storeCrisPumpReadings(result.report);
        state.result = { ok: true, imported, days: 1, from: date, to: date };
      } else {
        state.result = { ok: false, error: result.error ?? "Fetch failed", step: result.step };
      }
    } catch (e) {
      state.result = { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
    } finally {
      state.running = false;
      state.finishedAt = Date.now();
    }
  })();

  return NextResponse.json({ ok: true, started: true }, { status: 202 });
}
