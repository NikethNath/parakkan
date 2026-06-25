import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { parseCrisReport } from "@/services/crisReport";
import { storeCrisReport } from "@/services/crisStore";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  let report;
  try {
    report = parseCrisReport(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "Could not read the Excel file" }, { status: 400 });
  }
  if (report.rows.length === 0) {
    return NextResponse.json(
      { error: "No MS/HSD rows found — is this the CRIS Daily Sales Report?" },
      { status: 400 },
    );
  }

  const imported = await storeCrisReport(report);

  return NextResponse.json({
    ok: true,
    imported,
    sapCode: report.sapCode,
    from: report.fromDate,
    to: report.toDate,
  });
}
