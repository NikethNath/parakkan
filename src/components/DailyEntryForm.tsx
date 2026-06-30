"use client";

import { useMemo, useState, type FocusEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  computeEntry,
  DENOMINATIONS,
  denomKey,
  PRODUCTS,
  SHIFTS,
  shortExcessLabel,
} from "@/lib/calc";
import { inr, litres, istToday, istHour } from "@/lib/format";

type FormState = {
  businessDate: string;
  shift: (typeof SHIFTS)[number];
  product: (typeof PRODUCTS)[number];
  rate: string;
  n1Open: string;
  n1Close: string;
  n2Open: string;
  n2Close: string;
  testLitres: string;
  q2000: string;
  q500: string;
  q200: string;
  q100: string;
  q50: string;
  q20: string;
  q10: string;
  q5: string;
  coins: string;
  gpay: string;
  pos: string;
};

const emptyForm = (): FormState => {
  const h = istHour();
  return {
  businessDate: istToday(),
  // Default to the shift most likely in progress: morning from 3am–6pm IST,
  // evening from 6pm through to 3am — so staff usually don't have to touch it.
  shift: h >= 18 || h < 3 ? "EVENING" : "MORNING",
  product: "MS",
  rate: "",
  n1Open: "",
  n1Close: "",
  n2Open: "",
  n2Close: "",
  testLitres: "",
  q2000: "",
  q500: "",
  q200: "",
  q100: "",
  q50: "",
  q20: "",
  q10: "",
  q5: "",
  coins: "",
  gpay: "",
  pos: "",
  };
};

type OilRow = { name: string; amount: string };
type ExpenseRow = { description: string; amount: string };
type CreditRow = { customer: string; amount: string };

export type DailyEntryInitial = {
  form: Partial<FormState>;
  oil: OilRow[];
  expenses: ExpenseRow[];
  credit: CreditRow[];
};

const n = (v: string) => (v === "" ? 0 : Number(v));

export default function DailyEntryForm({
  mode = "create",
  entryId,
  initial,
  redirectTo = "/employee",
  admin = false,
  startLocked = false,
  deleteSlot,
}: {
  mode?: "create" | "edit";
  entryId?: number;
  initial?: DailyEntryInitial;
  redirectTo?: string;
  admin?: boolean;
  startLocked?: boolean;
  deleteSlot?: React.ReactNode;
} = {}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => ({
    ...emptyForm(),
    ...(initial?.form ?? {}),
  }));
  const [oil, setOil] = useState<OilRow[]>(initial?.oil ?? []);
  const [expenses, setExpenses] = useState<ExpenseRow[]>(initial?.expenses ?? []);
  const [credit, setCredit] = useState<CreditRow[]>(initial?.credit ?? []);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // Admin entries open read-only so a value can't be nudged by accident; the
  // Edit button unlocks the form.
  const [locked, setLocked] = useState(startLocked);
  // Employees get a "review before submit" confirmation step (catches accidental
  // and incomplete submits); admins save directly.
  const needsConfirm = !admin;
  const [confirming, setConfirming] = useState(false);
  // Employees may fix the figures on an existing sheet but not move it to another
  // day (cross-month payroll impact). The server enforces this too.
  const lockDate = mode === "edit" && !admin;

  const set = (k: keyof FormState, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  function resetToInitial() {
    setForm({ ...emptyForm(), ...(initial?.form ?? {}) });
    setOil(initial?.oil ?? []);
    setExpenses(initial?.expenses ?? []);
    setCredit(initial?.credit ?? []);
    setError(null);
    setIssues([]);
  }

  const computed = useMemo(
    () =>
      computeEntry({
        ...form,
        oilLines: oil,
        expenseLines: expenses,
        creditLines: credit,
      }),
    [form, oil, expenses, credit],
  );

  const label = shortExcessLabel(computed.shortExcess);
  const dateLabel = form.businessDate
    ? new Date(`${form.businessDate}T00:00:00.000Z`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";
  const shiftLabel = form.shift === "MORNING" ? "Morning" : "Evening";

  function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (locked) return; // safety — Save is hidden while locked
    if (needsConfirm) {
      setConfirming(true); // show the review step instead of submitting outright
      return;
    }
    void doSubmit();
  }

  // Mobile: when a field is focused the on-screen keyboard shrinks the viewport
  // and can hide the field (or it ends up under the sticky total bar). Once the
  // keyboard has had a moment to open, pull the focused field to the middle.
  function handleFieldFocus(e: FocusEvent<HTMLFormElement>) {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const el = e.target as HTMLElement;
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement
    ) {
      window.setTimeout(
        () => el.scrollIntoView({ block: "center", behavior: "smooth" }),
        250,
      );
    }
  }

  async function doSubmit() {
    setSaving(true);
    setError(null);
    setIssues([]);
    const payload = {
      ...form,
      oilLines: oil
        .filter((l) => l.name.trim() && n(l.amount) > 0)
        .map((l) => ({ name: l.name.trim(), amount: l.amount })),
      expenseLines: expenses
        .filter((l) => l.description.trim() && n(l.amount) > 0)
        .map((l) => ({ description: l.description.trim(), amount: l.amount })),
      creditLines: credit
        .filter((l) => l.customer.trim() && n(l.amount) > 0)
        .map((l) => ({ customer: l.customer.trim(), amount: l.amount })),
    };
    try {
      const res = await fetch(
        mode === "edit" ? `/api/entries/${entryId}` : "/api/entries",
        {
          method: mode === "edit" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConfirming(false); // close the dialog so the error below is visible
        setError(data.error ?? "Could not save");
        if (Array.isArray(data.issues)) {
          setIssues(data.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`));
        }
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setConfirming(false);
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onFormSubmit}
      onFocus={handleFieldFocus}
      className="mx-auto max-w-2xl space-y-4 p-4 pb-40"
    >
      {mode === "edit" && (
        <div
          className={
            "flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-sm ring-1 " +
            (locked
              ? "bg-surface text-muted ring-border"
              : "bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30")
          }
        >
          {locked ? (
            <>
              <span>🔒 View only — values are locked so nothing changes by accident.</span>
              <button
                type="button"
                onClick={() => setLocked(false)}
                className="rounded-lg bg-accent px-4 py-1.5 font-semibold text-white hover:bg-accent-strong"
              >
                Edit
              </button>
            </>
          ) : (
            <>
              <span>✏️ Editing — make your changes, then “Save changes” below.</span>
              <button
                type="button"
                onClick={() => {
                  resetToInitial();
                  setLocked(true);
                }}
                className="rounded-lg border border-border px-4 py-1.5 font-medium text-foreground hover:bg-surface-2"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      <fieldset disabled={locked} className="m-0 min-w-0 space-y-4 border-0 p-0">
      {/* Shift / product / date / rate */}
      <Section title="Shift details">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              value={form.businessDate}
              onChange={(e) => set("businessDate", e.target.value)}
              className={inputCls + (lockDate ? " bg-surface-2 text-muted" : "")}
              required
              disabled={lockDate}
            />
            {lockDate && (
              <span className="mt-1 block text-xs text-faint">
                🔒 Date is fixed — ask the admin to change it.
              </span>
            )}
          </Field>
          <Field label="Shift">
            <select
              value={form.shift}
              onChange={(e) => set("shift", e.target.value as FormState["shift"])}
              className={inputCls}
            >
              <option value="MORNING">Morning</option>
              <option value="EVENING">Evening</option>
            </select>
          </Field>
          <Field label="Product">
            <select
              value={form.product}
              onChange={(e) =>
                set("product", e.target.value as FormState["product"])
              }
              className={inputCls}
            >
              <option value="MS">MS (Petrol)</option>
              <option value="HSD">HSD (Diesel)</option>
            </select>
          </Field>
          <Field label="Rate (₹/L)">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={form.rate}
              onChange={(e) => set("rate", e.target.value)}
              className={inputCls}
              placeholder="0.00"
              required
            />
          </Field>
        </div>
      </Section>

      {/* Nozzle readings */}
      <Section title={`${form.product} meter readings`}>
        <div className="space-y-3">
          <NozzleRow
            n={1}
            open={form.n1Open}
            close={form.n1Close}
            onOpen={(v) => set("n1Open", v)}
            onClose={(v) => set("n1Close", v)}
          />
          <NozzleRow
            n={2}
            open={form.n2Open}
            close={form.n2Close}
            onOpen={(v) => set("n2Open", v)}
            onClose={(v) => set("n2Close", v)}
          />
          <Field label="Test litres (returned to tank — not a sale)">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={form.testLitres}
              onChange={(e) => set("testLitres", e.target.value)}
              className={inputCls}
              placeholder="0.00"
            />
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-3 text-center text-sm">
          <Stat label="Dispensed" value={litres(computed.grossLitres)} />
          <Stat label="Salable" value={litres(computed.netSalableLitres)} />
          <Stat label="Fuel expected" value={inr(computed.fuelExpected)} strong />
        </div>
      </Section>

      {/* Cash denominations */}
      <Section title="Cash counted">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Note</th>
                <th className="px-3 py-1.5 text-left font-medium">Qty</th>
                <th className="px-3 py-1.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {DENOMINATIONS.map((d) => {
                const key = denomKey(d);
                const qty = n(form[key]);
                return (
                  <tr key={d} className="border-t border-border">
                    <td className="px-3 py-1 font-medium text-foreground">₹{d}</td>
                    <td className="px-3 py-1">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={form[key]}
                        onChange={(e) => set(key, e.target.value)}
                        className="w-24 rounded border border-border px-2 py-1"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums text-muted">
                      {inr(d * qty)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-border">
                <td className="px-3 py-1 font-medium text-foreground">Coins</td>
                <td className="px-3 py-1" colSpan={1}>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={form.coins}
                    onChange={(e) => set("coins", e.target.value)}
                    className="w-24 rounded border border-border px-2 py-1"
                    placeholder="0"
                  />
                </td>
                <td className="px-3 py-1 text-right tabular-nums text-muted">
                  {inr(n(form.coins))}
                </td>
              </tr>
              <tr className="border-t border-border bg-surface-2 font-semibold">
                <td className="px-3 py-2" colSpan={2}>
                  Cash total
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {inr(computed.cashTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Digital */}
      <Section title="Digital collections">
        <div className="grid grid-cols-2 gap-3">
          <Field label="GPay / UPI (₹)">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={form.gpay}
              onChange={(e) => set("gpay", e.target.value)}
              className={inputCls}
              placeholder="0.00"
            />
          </Field>
          <Field label="POS / card swipe (₹)">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={form.pos}
              onChange={(e) => set("pos", e.target.value)}
              className={inputCls}
              placeholder="0.00"
            />
          </Field>
        </div>
      </Section>

      {/* Oil */}
      <LineSection
        title="Oil & lubricants"
        addLabel="+ Add oil"
        rows={oil}
        onAdd={() => setOil((r) => [...r, { name: "", amount: "" }])}
        onRemove={(i) => setOil((r) => r.filter((_, j) => j !== i))}
        total={computed.oilTotal}
        render={(row, i) => (
          <>
            <input
              placeholder="Name"
              value={row.name}
              onChange={(e) =>
                setOil((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
              }
              className={lineInput + " col-span-3"}
            />
            <input
              type="number"
              inputMode="decimal"
              placeholder="₹"
              value={row.amount}
              onChange={(e) =>
                setOil((r) => r.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
              }
              className={lineInput}
            />
            <span className="self-center text-right text-sm tabular-nums text-muted">
              {inr(n(row.amount))}
            </span>
          </>
        )}
      />

      {/* Credit */}
      <LineSection
        title="Credit (khata) sales"
        addLabel="+ Add credit"
        rows={credit}
        onAdd={() => setCredit((r) => [...r, { customer: "", amount: "" }])}
        onRemove={(i) => setCredit((r) => r.filter((_, j) => j !== i))}
        total={computed.creditTotal}
        render={(row, i) => (
          <>
            <input
              placeholder="Customer"
              value={row.customer}
              onChange={(e) =>
                setCredit((r) => r.map((x, j) => (j === i ? { ...x, customer: e.target.value } : x)))
              }
              className={lineInput + " col-span-3"}
            />
            <input
              type="number"
              inputMode="decimal"
              placeholder="₹"
              value={row.amount}
              onChange={(e) =>
                setCredit((r) => r.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
              }
              className={lineInput}
            />
            <span className="self-center text-right text-sm tabular-nums text-muted">
              {inr(n(row.amount))}
            </span>
          </>
        )}
      />

      {/* Expenses */}
      <LineSection
        title="Expenses"
        addLabel="+ Add expense"
        rows={expenses}
        onAdd={() => setExpenses((r) => [...r, { description: "", amount: "" }])}
        onRemove={(i) => setExpenses((r) => r.filter((_, j) => j !== i))}
        total={computed.expensesTotal}
        render={(row, i) => (
          <>
            <input
              placeholder="Description"
              value={row.description}
              onChange={(e) =>
                setExpenses((r) => r.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
              }
              className={lineInput + " col-span-3"}
            />
            <input
              type="number"
              inputMode="decimal"
              placeholder="₹"
              value={row.amount}
              onChange={(e) =>
                setExpenses((r) => r.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
              }
              className={lineInput}
            />
            <span className="self-center text-right text-sm tabular-nums text-muted">
              {inr(n(row.amount))}
            </span>
          </>
        )}
      />
      </fieldset>

      {!locked && deleteSlot}

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          <p className="font-medium">{error}</p>
          {issues.length > 0 && (
            <ul className="mt-1 list-inside list-disc">
              {issues.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Sticky summary + submit */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="text-sm">
            <p className="text-muted">
              Collected {inr(computed.collected)} · Expected {inr(computed.fuelExpected)}
            </p>
            <p
              className={
                "text-lg font-bold " +
                (label === "SHORT"
                  ? "text-red-600 dark:text-red-400"
                  : label === "EXCESS"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-foreground")
              }
            >
              {label === "BALANCED"
                ? "Balanced"
                : `${label} ${inr(Math.abs(computed.shortExcess))}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {locked ? (
              <button
                type="button"
                onClick={() => setLocked(false)}
                className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-white transition hover:bg-accent-strong"
              >
                Edit
              </button>
            ) : (
              <>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
                >
                  {saving
                    ? "Saving…"
                    : mode === "edit"
                      ? "Save changes"
                      : "Submit sheet"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-soft ring-1 ring-border">
            <h3 className="text-base font-bold text-foreground">
              {mode === "edit" ? "Save these changes?" : "Check before you submit"}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {dateLabel} · {shiftLabel} · {form.product}
            </p>
            <div className="mt-3 space-y-1.5 rounded-xl bg-surface-2 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Collected</span>
                <span className="tabular-nums text-foreground">{inr(computed.collected)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Fuel expected</span>
                <span className="tabular-nums text-foreground">{inr(computed.fuelExpected)}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2">
                <span className="font-semibold text-foreground">
                  {label === "BALANCED" ? "Balanced" : label === "SHORT" ? "Short" : "Excess"}
                </span>
                <span
                  className={
                    "text-lg font-bold tabular-nums " +
                    (label === "SHORT"
                      ? "text-red-600 dark:text-red-400"
                      : label === "EXCESS"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground")
                  }
                >
                  {label === "BALANCED" ? "—" : inr(Math.abs(computed.shortExcess))}
                </span>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">
              Double-check your meter readings and cash count. Once the admin verifies this
              sheet you won&apos;t be able to edit it.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={saving}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 font-medium text-foreground hover:bg-surface-2 disabled:opacity-60"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={() => void doSubmit()}
                disabled={saving}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
              >
                {saving ? "Saving…" : mode === "edit" ? "Confirm & save" : "Confirm & submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

// --- small presentational helpers -----------------------------------------

const inputCls =
  "w-full min-w-0 rounded-lg border border-border px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
const lineInput = "rounded border border-border px-2 py-1 text-sm";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={strong ? "font-semibold text-foreground" : "text-foreground"}>{value}</p>
    </div>
  );
}

function NozzleRow({
  n: idx,
  open,
  close,
  onOpen,
  onClose,
}: {
  n: number;
  open: string;
  close: string;
  onOpen: (v: string) => void;
  onClose: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={`Nozzle ${idx} opening`}>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={open}
          onChange={(e) => onOpen(e.target.value)}
          className={inputCls}
          placeholder="0.00"
        />
      </Field>
      <Field label={`Nozzle ${idx} closing`}>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={close}
          onChange={(e) => onClose(e.target.value)}
          className={inputCls}
          placeholder="0.00"
        />
      </Field>
    </div>
  );
}

function LineSection<T>({
  title,
  addLabel,
  rows,
  onAdd,
  onRemove,
  total,
  render,
}: {
  title: string;
  addLabel: string;
  rows: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  total: number;
  render: (row: T, i: number) => React.ReactNode;
}) {
  return (
    <Section title={title}>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-5 items-center gap-2">
            {render(row, i)}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="col-span-5 justify-self-end text-xs text-red-500 hover:underline sm:col-span-5"
            >
              remove
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md border border-border px-3 py-1 text-sm text-foreground hover:bg-surface-2"
        >
          {addLabel}
        </button>
        <span className="text-sm font-medium text-foreground">{inr(total)}</span>
      </div>
    </Section>
  );
}
