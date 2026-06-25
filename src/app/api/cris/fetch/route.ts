import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getCrisCredentials } from "@/lib/crisCreds";
import { fetchDailySalesReport } from "@/services/cris";
import { storeCrisReport } from "@/services/crisStore";

// The headless browser run can take a while.
export const maxDuration = 180;

const schema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

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

  const creds = await getCrisCredentials();
  if (!creds) {
    return NextResponse.json(
      { error: "Set your CRIS login first (above)." },
      { status: 400 },
    );
  }

  const result = await fetchDailySalesReport({
    username: creds.username,
    password: creds.password,
    fromDate: parsed.data.fromDate,
    toDate: parsed.data.toDate,
    sapCode: creds.username, // RO SAP code == CRIS user id for this dealer
  });

  if (!result.ok || !result.report) {
    return NextResponse.json(
      { error: result.error ?? "Fetch failed", step: result.step },
      { status: 502 },
    );
  }

  const imported = await storeCrisReport(result.report);
  return NextResponse.json({
    ok: true,
    imported,
    sapCode: result.report.sapCode,
    from: result.report.fromDate,
    to: result.report.toDate,
  });
}
