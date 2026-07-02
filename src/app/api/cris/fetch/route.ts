import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getCrisLogin } from "@/lib/crisCreds";
import { fetchDailySalesReport } from "@/services/cris";
import { storeCrisReport } from "@/services/crisStore";
import { getCrisFetchState } from "@/services/crisFetchState";

// The headless browser run can take a while; it runs in the background and the
// client polls GET for the result, so the request itself returns immediately.
export const maxDuration = 240;

const schema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// GET — current status of the background fetch (for polling).
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const s = getCrisFetchState();
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
    return NextResponse.json({ error: "Valid From/To dates required" }, { status: 400 });
  }

  const login = await getCrisLogin();
  if (!login) {
    return NextResponse.json({ error: "Set your CRIS login first (above)." }, { status: 400 });
  }

  const state = getCrisFetchState();
  if (state.running) {
    return NextResponse.json({ ok: true, running: true }, { status: 202 });
  }

  state.running = true;
  state.startedAt = Date.now();
  state.finishedAt = null;
  state.result = null;

  const { fromDate, toDate } = parsed.data;

  // Fire-and-forget: the long Playwright run continues after we respond. The
  // process is a single long-lived Node server (next start), so this is safe.
  void (async () => {
    try {
      const result = await fetchDailySalesReport({ ...login, fromDate, toDate });
      if (result.ok && result.report) {
        const imported = await storeCrisReport(result.report);
        const days = new Set(result.report.rows.map((r) => r.businessDate)).size;
        state.result = {
          ok: true,
          imported,
          days,
          from: result.report.fromDate,
          to: result.report.toDate,
        };
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
