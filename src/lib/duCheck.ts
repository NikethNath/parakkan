/**
 * GPay per dispensing unit: does what the staff on a DU wrote down match what
 * that DU's Paytm QR took?
 *
 * Each DU has its own QR (the Paytm report's POS_ID: DU1, DU2, DU3), so the
 * report says how much UPI each DU took in a day. The sheets don't say which DU
 * they were for — only nozzle readings. So each DU's two nozzles are bound once
 * by a meter reading, and followed from there: a totalizer only counts up and
 * every one sits far from the others, so a sheet's reading near where a nozzle
 * was last seen *is* that nozzle. That says which staff worked which DU.
 *
 * The handover time varies, so a DU's day is checked as a whole: its morning
 * and evening staff's GPay together against its QR's day total. A gap says
 * that pair has a mistake, not which half of it. A staff member who worked two
 * DUs ties them together, and they are checked as one group.
 *
 * Pure — the page loads the rows, src/app/admin/reconcile/page.tsx.
 */

import { MAX_PAIR_DIFF } from "@/lib/meterAlign";

export type Product = "MS" | "HSD";
export type Shift = "MORNING" | "EVENING";

/** ₹ — GPay amounts are exact, so anything past a rupee is a real difference. */
export const DU_TOLERANCE = 1;

/** A bound nozzle: on `readOn` its totalizer showed `reading`. */
export interface DuNozzle {
  id: number;
  du: string;
  product: Product;
  reading: number;
  readOn: string; // YYYY-MM-DD
}

export interface DuSheet {
  id: number;
  date: string;
  shift: Shift;
  product: Product;
  /** Whose sheet — the owner's id. Their GPay for a shift spans both products. */
  staffId: number;
  by: string;
  gpay: number;
  /** Nozzle 1 and nozzle 2 as written. 0 = not filled in. */
  nozzles: { open: number; close: number }[];
}

/** For each sheet, which DU each of its nozzles was — null when unknown. */
export type Placement = Map<number, (string | null)[]>;

const readings = (n: { open: number; close: number }) => [n.open, n.close].filter((v) => v > 0);

/** How far a nozzle last seen at `at` is from a sheet nozzle's readings. A
 *  reading range containing it is distance 0. */
function distance(at: number, vals: number[]): number {
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return at < lo ? lo - at : at > hi ? at - hi : 0;
}

/**
 * Follow every bound nozzle through the sheets, shift by shift: forward from
 * the day it was bound, and backward for the days before. Each shift, sheet
 * nozzles go to the bound nozzle they sit nearest, closest pair first, within
 * the same window the Meter tab trusts — a misread digit, not another pump.
 */
export function placeSheets(nozzles: DuNozzle[], sheets: DuSheet[]): Placement {
  const placement: Placement = new Map(sheets.map((s) => [s.id, s.nozzles.map(() => null)]));
  const slot = (s: DuSheet) => s.date + (s.shift === "MORNING" ? "0" : "1");
  const keys = [...new Set(sheets.map(slot))].sort();
  const byKey = new Map<string, DuSheet[]>();
  for (const s of sheets) byKey.set(slot(s), [...(byKey.get(slot(s)) ?? []), s]);

  for (const product of ["MS", "HSD"] as const) {
    const bound = nozzles.filter((n) => n.product === product);
    if (bound.length === 0) continue;

    for (const forward of [true, false]) {
      const at = new Map(bound.map((n) => [n.id, n.reading]));
      for (const key of forward ? keys : [...keys].reverse()) {
        const date = key.slice(0, 10);
        const active = bound.filter((n) => (forward ? date >= n.readOn : date < n.readOn));
        if (active.length === 0) continue;

        const open: { sheet: DuSheet; i: number; vals: number[] }[] = [];
        for (const sheet of byKey.get(key) ?? []) {
          if (sheet.product !== product) continue;
          sheet.nozzles.forEach((n, i) => {
            const vals = readings(n);
            if (vals.length && placement.get(sheet.id)![i] === null) open.push({ sheet, i, vals });
          });
        }

        const pairs = open
          .flatMap((o, oi) => active.map((n) => ({ oi, n, d: distance(at.get(n.id)!, o.vals) })))
          .filter((p) => p.d <= MAX_PAIR_DIFF)
          .sort((a, b) => a.d - b.d);
        const usedSlot = new Set<number>();
        const usedNozzle = new Set<number>();
        for (const p of pairs) {
          if (usedSlot.has(p.oi) || usedNozzle.has(p.n.id)) continue;
          usedSlot.add(p.oi);
          usedNozzle.add(p.n.id);
          const o = open[p.oi];
          placement.get(o.sheet.id)![o.i] = p.n.du;
          // Move on to where this shift left the nozzle — but not to a reading
          // that leapt past the window, which is a typo rather than litres.
          const cur = at.get(p.n.id)!;
          const ahead = o.vals.filter((v) => Math.abs(v - cur) <= MAX_PAIR_DIFF);
          if (ahead.length) at.set(p.n.id, forward ? Math.max(cur, ...ahead) : Math.min(cur, ...ahead));
        }
      }
    }
  }
  return placement;
}

export interface DuStaff {
  staffId: number;
  shift: Shift;
  by: string;
  gpay: number;
}

export type DuStatus =
  | "ok"
  /** Staff wrote less GPay than the DU's QR took. */
  | "short"
  /** Staff wrote more than the DU's QR took — and more than any untied money could explain. */
  | "over"
  /** Staff wrote more, but no more than the day's money that isn't tied to a DU
   *  (the old PhonePe QR, a QR not set up as a DU) — it may be that. */
  | "untied"
  | "no-report";

export interface DuGroup {
  dus: string[];
  staff: DuStaff[];
  paytm: number;
  staffGpay: number;
  /** staff − Paytm */
  delta: number;
  status: DuStatus;
  /** A staff member here also sold from a nozzle that isn't bound to any DU,
   *  so part of their GPay may belong elsewhere. */
  unbound: boolean;
  /** Another group the same day whose gap is the exact opposite — the money
   *  was most likely written on the wrong DU's sheet. */
  mirror?: string;
}

export interface DuDay {
  date: string;
  groups: DuGroup[];
  /** UPI on QR codes that aren't a set-up DU. */
  otherQr: { posId: string; amount: number }[];
  /** The day's PhonePe statement GPay — old QR, tied to no DU. */
  phonepe: number;
  /** Staff with GPay but no nozzle placed on any DU. */
  unplaced: DuStaff[];
  hasReport: boolean;
}

export interface DuCheckInput {
  dus: { name: string; posId: string }[];
  sheets: DuSheet[];
  placement: Placement;
  qr: { date: string; posId: string; amount: number }[];
  phonepe: Map<string, number>;
  /** Days the Paytm report covers. */
  reportDays: Set<string>;
  from: string;
  to: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function checkDuDays(input: DuCheckInput): DuDay[] {
  const { dus, sheets, placement, qr, phonepe, reportDays, from, to } = input;
  const inRange = (d: string) => d >= from && d <= to;
  const duByPos = new Map(dus.map((d) => [d.posId.toUpperCase(), d.name]));
  const order = new Map(dus.map((d, i) => [d.name, i]));

  const dates = [
    ...new Set([...sheets.map((s) => s.date), ...qr.map((q) => q.date)].filter(inRange)),
  ].sort();

  return dates.map((date) => {
    const daySheets = sheets.filter((s) => s.date === date);

    // A staff member's shift is one node: their GPay covers every sheet they
    // filed that shift, whichever product.
    const staff = new Map<string, DuStaff & { dus: Set<string>; unbound: boolean }>();
    for (const s of daySheets) {
      const k = `${s.staffId}|${s.shift}`;
      const node = staff.get(k) ?? {
        staffId: s.staffId, shift: s.shift, by: s.by, gpay: 0, dus: new Set<string>(), unbound: false,
      };
      node.gpay += s.gpay;
      const placed = placement.get(s.id) ?? [];
      s.nozzles.forEach((n, i) => {
        // Only a nozzle that sold puts its staff at that DU.
        if (Math.abs(n.close - n.open) <= 0 || n.open <= 0 || n.close <= 0) return;
        if (placed[i]) node.dus.add(placed[i]!);
        else node.unbound = true;
      });
      staff.set(k, node);
    }

    const paytmBy = new Map<string, number>();
    const otherQr: { posId: string; amount: number }[] = [];
    for (const q of qr.filter((q) => q.date === date)) {
      const du = duByPos.get(q.posId.toUpperCase());
      if (du) paytmBy.set(du, (paytmBy.get(du) ?? 0) + q.amount);
      else otherQr.push({ posId: q.posId, amount: q.amount });
    }

    // Group DUs joined by a shared staff member (union-find on DU names).
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      if (!parent.has(x)) parent.set(x, x);
      const p = parent.get(x)!;
      if (p === x) return x;
      const root = find(p);
      parent.set(x, root);
      return root;
    };
    for (const du of paytmBy.keys()) find(du);
    for (const node of staff.values()) {
      const list = [...node.dus];
      list.forEach((d) => find(d));
      for (let i = 1; i < list.length; i++) parent.set(find(list[i]), find(list[0]));
    }

    const hasReport = reportDays.has(date);
    const untied = r2((phonepe.get(date) ?? 0) + otherQr.reduce((n, q) => n + q.amount, 0));

    const roots = [...new Set([...parent.keys()].map(find))];
    const groups: DuGroup[] = roots.map((root) => {
      const members = [...parent.keys()]
        .filter((d) => find(d) === root)
        .sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99) || a.localeCompare(b));
      const people = [...staff.values()]
        .filter((n) => [...n.dus].some((d) => find(d) === root))
        .sort((a, b) => (a.shift === b.shift ? a.by.localeCompare(b.by) : a.shift === "MORNING" ? -1 : 1));
      const paytm = r2(members.reduce((n, d) => n + (paytmBy.get(d) ?? 0), 0));
      const staffGpay = r2(people.reduce((n, p) => n + p.gpay, 0));
      const delta = r2(staffGpay - paytm);
      const status: DuStatus = !hasReport
        ? "no-report"
        : Math.abs(delta) <= DU_TOLERANCE
          ? "ok"
          : delta < 0
            ? "short"
            : delta <= untied + DU_TOLERANCE
              ? "untied"
              : "over";
      return {
        dus: members,
        staff: people.map(({ staffId, shift, by, gpay }) => ({ staffId, shift, by, gpay: r2(gpay) })),
        paytm,
        staffGpay,
        delta,
        status,
        unbound: people.some((p) => p.unbound),
      };
    });
    groups.sort((a, b) => (order.get(a.dus[0]) ?? 99) - (order.get(b.dus[0]) ?? 99));

    // A short on one DU matched by an equal excess on another is the classic
    // "wrote it on the wrong sheet" — say so.
    for (const g of groups) {
      if (g.status === "ok" || g.status === "no-report") continue;
      const other = groups.find(
        (o) => o !== g && o.status !== "ok" && Math.abs(o.delta + g.delta) <= DU_TOLERANCE,
      );
      if (other) g.mirror = other.dus.join(" + ");
    }

    const unplaced = [...staff.values()]
      .filter((n) => n.dus.size === 0 && n.gpay > 0)
      .map(({ staffId, shift, by, gpay }) => ({ staffId, shift, by, gpay: r2(gpay) }));

    return { date, groups, otherQr, phonepe: phonepe.get(date) ?? 0, unplaced, hasReport };
  });
}
