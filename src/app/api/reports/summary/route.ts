import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildSummary, SUMMARY_COLS } from "@/lib/summary";
import { dayLabel } from "@/lib/format";

/**
 * Excel export of the accountant's daily summary — the same numbers as the
 * on-screen table (both come from `buildSummary`), written as real numbers so
 * they can be totalled and pivoted in Excel rather than re-typed.
 *
 * Two sheets: the per-day summary, and the outlet's overheads itemised.
 */

const isDate = (s: string | null): s is string => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

// Excel number formats: rupees to paise, litres to 2dp, rate to 2dp.
const FORMAT: Record<string, string> = {
  money: "#,##0.00",
  L: "#,##0.00",
  rate: "#,##0.00",
};

export async function GET(req: Request) {
  const user = await getSessionUser();
  // The accountant's own report, and the admin sees everything they do.
  if (!user || (user.role !== "ACCOUNTANT" && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  if (!isDate(fromRaw) || !isDate(toRaw)) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD dates" }, { status: 400 });
  }
  const [from, to] = fromRaw <= toRaw ? [fromRaw, toRaw] : [toRaw, fromRaw];

  const { days, totals, overheads } = await buildSummary(from, to);

  const header = ["Date", ...SUMMARY_COLS.map((c) => c.label)];
  const body = days.map(({ date, row }) => [
    dayLabel(date),
    ...SUMMARY_COLS.map((c) => c.value(row)),
  ]);
  const totalRow = ["Total", ...SUMMARY_COLS.map((c) => c.value(totals))];

  const ws = XLSX.utils.aoa_to_sheet([
    [`Daily summary — ${dayLabel(from)} to ${dayLabel(to)}`],
    [],
    header,
    ...body,
    totalRow,
  ]);

  // Apply a number format to every numeric cell (row 3 is the header; data
  // starts on row 4 in 1-based terms, so index 3 here).
  const firstDataRow = 3;
  for (let r = firstDataRow; r < firstDataRow + body.length + 1; r++) {
    SUMMARY_COLS.forEach((col, i) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c: i + 1 })];
      if (cell && typeof cell.v === "number") cell.z = FORMAT[col.kind];
    });
  }
  ws["!cols"] = [{ wch: 14 }, ...SUMMARY_COLS.map((c) => ({ wch: Math.max(12, c.label.length + 2) }))];
  ws["!freeze"] = { xSplit: "1", ySplit: "3" };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Daily summary");

  // The outlet's own running costs, itemised on their own sheet. The daily sheet
  // carries the per-day total in its Overheads column; what the money actually
  // was only fits here.
  const oTotal = overheads.reduce((n, o) => n + o.amount, 0);
  const oWs = XLSX.utils.aoa_to_sheet([
    [`Outlet overheads — ${dayLabel(from)} to ${dayLabel(to)}`],
    ["Not part of any shift's short/excess — this money never passed through the till."],
    [],
    ["Date", "Category", "Note", "Amount"],
    ...overheads.map((o) => [dayLabel(o.date), o.category, o.note ?? "", o.amount]),
    ["Total", "", "", oTotal],
  ]);
  const oFirstRow = 4; // 0-based: title, caption, blank, header
  for (let r = oFirstRow; r < oFirstRow + overheads.length + 1; r++) {
    const cell = oWs[XLSX.utils.encode_cell({ r, c: 3 })];
    if (cell && typeof cell.v === "number") cell.z = FORMAT.money;
  }
  oWs["!cols"] = [{ wch: 14 }, { wch: 22 }, { wch: 40 }, { wch: 14 }];
  oWs["!freeze"] = { ySplit: "4" };
  XLSX.utils.book_append_sheet(wb, oWs, "Overheads");
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="daily-summary-${from}-to-${to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
