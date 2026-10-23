import { inr, dayLabel } from "@/lib/format";
import type { HandoverRow } from "@/lib/meterHandover";
import MeterQuickFix from "@/components/MeterQuickFix";

/**
 * The midday handover disagreements for the loaded range, each with the two
 * one-click repairs.
 *
 * A morning closing and the evening opening after it are one reading of one
 * dial, taken with both attendants present — so a difference is always a typo
 * in one of the two sheets, and the day's litres are out by it until fixed.
 *
 * Which sheet is wrong can't be read off the meters (both stories fit equally),
 * but the cash settles it: the mis-typed sheet carries a short or excess of
 * about gap × rate, while the other balances. That verdict is a recommendation,
 * never applied on its own.
 */

const L = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function HandoverTable({
  items,
  from,
  to,
}: {
  items: { date: string; product: "MS" | "HSD"; row: HandoverRow }[];
  from: string;
  to: string;
}) {
  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Midday handover · {dayLabel(from)} – {dayLabel(to)}
        </h2>
        <p className="text-xs text-muted">
          {items.length} {items.length === 1 ? "nozzle disagrees" : "nozzles disagree"}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-emerald-700 dark:text-emerald-300">
          Every morning closing matches the evening opening after it. Nothing to fix.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            Both attendants read the same dial at changeover, so these must agree — a
            difference means one of the two sheets was typed wrong, and the day is out by that
            many litres. <strong>Likely wrong</strong> is worked out from the cash: the
            mis-typed sheet carries a short or excess of about the gap&apos;s value while the
            other balances. Each button rewrites one reading, recalculates that sheet&apos;s
            litres and short/excess, and logs the change.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="px-2 py-1.5 font-medium">Fuel</th>
                  <th className="px-2 py-1.5 text-right font-medium">Morning closing</th>
                  <th className="px-2 py-1.5 text-right font-medium">Evening opening</th>
                  <th className="px-2 py-1.5 text-right font-medium">Gap</th>
                  <th className="px-2 py-1.5 font-medium">Likely wrong</th>
                  <th className="px-2 py-1.5 font-medium">Fix</th>
                </tr>
              </thead>
              <tbody>
                {items.map(({ date, product, row }) => {
                  const { morning, evening, gap, blame } = row;
                  // Blaming a sheet means replacing ITS reading with the other
                  // side's, so the recommended button is the opposite one.
                  const expected = blame === "MORNING" ? row.expectedMorning : row.expectedEvening;
                  const culprit = blame === "MORNING" ? morning : evening;
                  const key = `${date}-${product}-${morning.entryId}-${morning.field}`;
                  return (
                    <tr key={key} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                        {dayLabel(date)}
                      </td>
                      <td className="px-2 py-1.5 text-muted">{product}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                        {L(morning.value)}
                        <div className="text-[10px] leading-tight text-faint">{morning.by}</div>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                        {L(evening.value)}
                        <div className="text-[10px] leading-tight text-faint">{evening.by}</div>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium text-red-600 dark:text-red-400">
                        {gap > 0 ? "+" : "−"}
                        {L(Math.abs(gap))} L
                        <div className="text-[10px] font-normal leading-tight text-faint">
                          {inr(Math.abs(gap * culprit.rate))}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        {blame === "UNCLEAR" ? (
                          <span className="text-xs text-muted">
                            Can&apos;t tell — neither sheet&apos;s cash points at it. Check the
                            dial or CRIS.
                          </span>
                        ) : (
                          <>
                            <span className="font-medium text-foreground">
                              {blame === "MORNING" ? "Morning" : "Evening"} · {culprit.by}
                            </span>
                            <div className="text-[10px] leading-tight text-faint">
                              that sheet is {culprit.shortExcess < 0 ? "short" : "over"} by{" "}
                              {inr(Math.abs(culprit.shortExcess))}, which is about the gap&apos;s
                              value ({inr(Math.abs(expected))})
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-col items-start gap-1">
                          <MeterQuickFix
                            entryId={row.useEvening.entryId}
                            writes={[{ field: row.useEvening.field, value: row.useEvening.value }]}
                            label={`Morning → ${L(evening.value)}`}
                            tone={blame === "MORNING" ? "recommended" : "fix"}
                            disabledReason={row.useEvening.blocked}
                            message={`Correct ${morning.by}'s morning sheet: set its closing reading to the evening's ${L(
                              evening.value,
                            )}?`}
                          />
                          <MeterQuickFix
                            entryId={row.useMorning.entryId}
                            writes={[{ field: row.useMorning.field, value: row.useMorning.value }]}
                            label={`Evening → ${L(morning.value)}`}
                            tone={blame === "EVENING" ? "recommended" : "fix"}
                            disabledReason={row.useMorning.blocked}
                            message={`Correct ${evening.by}'s evening sheet: set its opening reading to the morning's ${L(
                              morning.value,
                            )}?`}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-faint">
            The highlighted button is the recommended one — it corrects the sheet the cash
            points at. Neither is applied until you click it.
          </p>
        </>
      )}
    </section>
  );
}
