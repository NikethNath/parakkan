import { describe, it, expect } from "vitest";
import { checkDuDays, placeSheets as place, type DuNozzle, type DuSheet } from "./duCheck";

/** Placement as DU names, which is what most tests care about. */
const placeSheets = (n: DuNozzle[], s: DuSheet[]) =>
  new Map([...place(n, s)].map(([id, v]) => [id, v.map((x) => x?.du ?? null)]));

// Three DUs, each one MS and one HSD nozzle, totalizers far apart.
const NOZZLES: DuNozzle[] = [
  { id: 1, du: "DU1", product: "MS", reading: 100_000, readOn: "2026-11-01" },
  { id: 2, du: "DU1", product: "HSD", reading: 400_000, readOn: "2026-11-01" },
  { id: 3, du: "DU2", product: "MS", reading: 200_000, readOn: "2026-11-01" },
  { id: 4, du: "DU2", product: "HSD", reading: 500_000, readOn: "2026-11-01" },
  { id: 5, du: "DU3", product: "MS", reading: 300_000, readOn: "2026-11-01" },
  { id: 6, du: "DU3", product: "HSD", reading: 600_000, readOn: "2026-11-01" },
];
const DUS = [
  { name: "DU1", posId: "DU1" },
  { name: "DU2", posId: "DU2" },
  { name: "DU3", posId: "DU3" },
];

let nextId = 0;
/** One staff member's MS sheet: nozzle 1 is the given reading range, nozzle 2 unused. */
const sheet = (
  date: string,
  shift: "MORNING" | "EVENING",
  staffId: number,
  product: "MS" | "HSD",
  open: number,
  close: number,
  gpay: number,
  second: { open: number; close: number } = { open: 0, close: 0 },
): DuSheet => ({
  id: ++nextId,
  date,
  shift,
  product,
  staffId,
  by: `Staff ${staffId}`,
  gpay,
  nozzles: [{ open, close }, second],
});

const run = (sheets: DuSheet[], qr: { date: string; posId: string; amount: number }[], phonepe = new Map<string, number>()) =>
  checkDuDays({
    dus: DUS,
    sheets,
    placement: place(NOZZLES, sheets),
    qr,
    phonepe,
    reportDays: new Set(qr.map((q) => q.date)),
    from: "2026-11-01",
    to: "2026-11-30",
  });

describe("placeSheets", () => {
  it("follows each nozzle forward day by day as its totalizer climbs", () => {
    const s = [
      sheet("2026-11-01", "MORNING", 1, "MS", 100_000, 100_800, 0),
      sheet("2026-11-01", "EVENING", 2, "MS", 100_800, 101_500, 0),
      // Weeks later the reading is >10,000 past where it was bound — only the
      // day-by-day trail still connects it.
      ...Array.from({ length: 20 }, (_, i) =>
        sheet(`2026-11-${String(i + 2).padStart(2, "0")}`, "MORNING", 1, "MS", 101_500 + i * 800, 102_300 + i * 800, 0),
      ),
    ];
    const p = placeSheets(NOZZLES, s);
    expect(s.every((x) => p.get(x.id)![0] === "DU1")).toBe(true);
    expect(s.at(-1)!.nozzles[0].open).toBeGreaterThan(100_000 + 10_000);
  });

  it("follows backward for days before the reading was taken", () => {
    const s = [sheet("2026-10-30", "EVENING", 1, "MS", 199_000, 199_700, 0)];
    expect(placeSheets(NOZZLES, s).get(s[0].id)).toEqual(["DU2", null]);
  });

  it("puts each nozzle of a two-nozzle sheet on its own DU", () => {
    const s = [sheet("2026-11-02", "MORNING", 1, "MS", 100_000, 100_500, 0, { open: 300_000, close: 300_200 })];
    expect(placeSheets(NOZZLES, s).get(s[0].id)).toEqual(["DU1", "DU3"]);
  });

  it("matches on the reading that's filled in when the other is blank", () => {
    const s = [sheet("2026-11-02", "MORNING", 1, "MS", 0, 200_400, 0)];
    expect(placeSheets(NOZZLES, s).get(s[0].id)).toEqual(["DU2", null]);
  });

  it("places two sheets on one nozzle in the same shift, whichever comes first", () => {
    // 06 Nov: the evening sheet was filed as a second morning sheet.
    for (const order of [0, 1]) {
      const a = sheet("2026-11-02", "MORNING", 1, "MS", 100_000, 100_500, 0);
      const b = sheet("2026-11-02", "MORNING", 2, "MS", 100_500, 101_100, 0);
      const s = order ? [b, a] : [a, b];
      const p = placeSheets(NOZZLES, s);
      expect([p.get(a.id)![0], p.get(b.id)![0]]).toEqual(["DU1", "DU1"]);
    }
  });

  it("leaves a reading near no bound nozzle unplaced", () => {
    const s = [sheet("2026-11-02", "MORNING", 1, "MS", 900_000, 900_500, 0)];
    expect(placeSheets(NOZZLES, s).get(s[0].id)).toEqual([null, null]);
  });

  it("isn't thrown off for good by one closing typed with an extra digit", () => {
    const s = [
      sheet("2026-11-02", "MORNING", 1, "MS", 100_000, 1_000_800, 0), // meant 100,800
      sheet("2026-11-02", "EVENING", 2, "MS", 100_800, 101_600, 0),
      sheet("2026-11-03", "MORNING", 1, "MS", 101_600, 102_200, 0),
    ];
    const p = placeSheets(NOZZLES, s);
    expect(s.map((x) => p.get(x.id)![0])).toEqual(["DU1", "DU1", "DU1"]);
  });
});

describe("checkDuDays", () => {
  const D = "2026-11-02";

  it("passes a DU whose morning + evening GPay equals its QR's day total", () => {
    const days = run(
      [
        sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 3000),
        sheet(D, "EVENING", 2, "MS", 100_500, 101_000, 2000),
      ],
      [{ date: D, posId: "DU1", amount: 5000 }],
    );
    const g = days[0].groups;
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ dus: ["DU1"], paytm: 5000, staffGpay: 5000, delta: 0, status: "ok" });
    expect(g[0].staff.map((s) => s.shift)).toEqual(["MORNING", "EVENING"]);
  });

  it("flags the pair when they wrote less than the QR took", () => {
    const days = run(
      [
        sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 3000),
        sheet(D, "EVENING", 2, "MS", 100_500, 101_000, 1500),
      ],
      [{ date: D, posId: "DU1", amount: 5000 }],
    );
    expect(days[0].groups[0]).toMatchObject({ delta: -500, status: "short" });
  });

  it("hides DU gaps that cancel out when the day's total matches the report", () => {
    const days = run(
      [
        sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 3500), // took 500 of DU2's
        sheet(D, "MORNING", 2, "MS", 200_000, 200_500, 1500),
      ],
      [
        { date: D, posId: "DU1", amount: 3000 },
        { date: D, posId: "DU2", amount: 2000 },
      ],
    );
    expect(days[0].balanced).toBe(true);
    expect(days[0].groups.map((g) => [g.status, g.mirror])).toEqual([
      ["ok", undefined],
      ["ok", undefined],
    ]);
  });

  it("still hides it with a few paise off on each DU", () => {
    const days = run(
      [
        sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 85_178),
        sheet(D, "MORNING", 2, "MS", 200_000, 200_500, 75_171.27),
      ],
      [
        { date: D, posId: "DU1", amount: 85_177.77 },
        { date: D, posId: "DU2", amount: 75_170.27 },
      ],
    );
    expect(days[0].balanced).toBe(true);
  });

  it("clears 'not on any DU' when the day balances anyway", () => {
    const days = run(
      [
        sheet(D, "MORNING", 1, "MS", 900_000, 900_500, 700),
        sheet(D, "EVENING", 2, "MS", 100_000, 100_500, 1000),
      ],
      [{ date: D, posId: "DU1", amount: 1700 }],
    );
    expect(days[0]).toMatchObject({ balanced: true, unplaced: [] });
    expect(days[0].groups[0].status).toBe("ok");
  });

  it("spots money written on the wrong DU's sheet when the day is off too", () => {
    const days = run(
      [
        sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 3500), // took 500 of DU2's
        sheet(D, "MORNING", 2, "MS", 200_000, 200_500, 1500),
        sheet(D, "MORNING", 3, "MS", 300_000, 300_500, 900), // DU3 is ₹100 short
      ],
      [
        { date: D, posId: "DU1", amount: 3000 },
        { date: D, posId: "DU2", amount: 2000 },
        { date: D, posId: "DU3", amount: 1000 },
      ],
    );
    expect(days[0].balanced).toBe(false);
    const [du1, du2] = days[0].groups;
    expect(du1).toMatchObject({ dus: ["DU1"], delta: 500, status: "over", mirror: "DU2" });
    expect(du2).toMatchObject({ dus: ["DU2"], delta: -500, status: "short", mirror: "DU1" });
    expect(days[0].groups[2]).toMatchObject({ dus: ["DU3"], delta: -100, status: "short" });
  });

  it("checks DUs together when one person worked both", () => {
    const days = run(
      [
        // Staff 1 sold MS from DU1 and HSD from DU2 the same shift.
        sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 1000),
        sheet(D, "MORNING", 1, "HSD", 500_000, 500_300, 2000),
        sheet(D, "EVENING", 2, "MS", 200_000, 200_400, 500),
      ],
      [
        { date: D, posId: "DU1", amount: 1200 },
        { date: D, posId: "DU2", amount: 2300 },
      ],
    );
    expect(days[0].groups).toHaveLength(1);
    expect(days[0].groups[0]).toMatchObject({ dus: ["DU1", "DU2"], paytm: 3500, staffGpay: 3500, status: "ok" });
  });

  it("counts both same-shift sheets on a DU and says one may be the wrong shift", () => {
    const days = run(
      [
        sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 31_444.23),
        sheet(D, "MORNING", 2, "MS", 100_500, 101_100, 51_085.77),
      ],
      [{ date: D, posId: "DU1", amount: 82_529.28 }],
    );
    expect(days[0].unplaced).toEqual([]);
    const g = days[0].groups[0];
    expect(g).toMatchObject({ staffGpay: 82_530, status: "ok" });
    expect(g.sameShift).toEqual([{ du: "DU1", shift: "MORNING", names: ["Staff 1", "Staff 2"] }]);
  });

  it("doesn't call a normal morning/evening pair a same-shift clash", () => {
    const days = run(
      [
        sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 100),
        sheet(D, "EVENING", 2, "MS", 100_500, 101_000, 100),
      ],
      [{ date: D, posId: "DU1", amount: 200 }],
    );
    expect(days[0].groups[0].sameShift).toEqual([]);
  });

  it("treats an excess no bigger than the day's PhonePe money as possibly that", () => {
    const days = run(
      [sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 3400)],
      [{ date: D, posId: "DU1", amount: 3000 }],
      new Map([[D, 400]]),
    );
    expect(days[0].groups[0]).toMatchObject({ delta: 400, status: "untied" });
    expect(days[0].phonepe).toBe(400);
  });

  it("lists UPI on a QR that isn't a DU, and counts it as untied money", () => {
    const days = run(
      [sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 3100)],
      [
        { date: D, posId: "DU1", amount: 3000 },
        { date: D, posId: "OFFICE", amount: 200 },
      ],
    );
    expect(days[0].otherQr).toEqual([{ posId: "OFFICE", amount: 200 }]);
    expect(days[0].groups[0].status).toBe("untied");
    // Had the staff written the full 3,200 the report shows, the day balances.
    expect(
      run([sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 3200)], [
        { date: D, posId: "DU1", amount: 3000 },
        { date: D, posId: "OFFICE", amount: 200 },
      ])[0].balanced,
    ).toBe(true);
  });

  it("shows a DU that took money no sheet was placed on", () => {
    const days = run([], [{ date: D, posId: "DU3", amount: 900 }]);
    expect(days[0].groups[0]).toMatchObject({ dus: ["DU3"], staff: [], delta: -900, status: "short" });
  });

  it("calls out staff whose sheets sit on no bound nozzle, and marks partly-placed staff", () => {
    const days = run(
      [
        sheet(D, "MORNING", 1, "MS", 900_000, 900_500, 700),
        sheet(D, "EVENING", 2, "MS", 100_000, 100_500, 1000, { open: 950_000, close: 950_100 }),
      ],
      [{ date: D, posId: "DU1", amount: 1000 }],
    );
    expect(days[0].unplaced.map((s) => s.staffId)).toEqual([1]);
    expect(days[0].groups[0].unbound).toBe(true);
  });

  it("doesn't put staff at a DU whose nozzle didn't sell", () => {
    const days = run(
      [
        sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 1000, { open: 300_000, close: 300_000 }),
      ],
      [{ date: D, posId: "DU1", amount: 1000 }],
    );
    expect(days[0].groups.map((g) => g.dus)).toEqual([["DU1"]]);
  });

  it("waits for the Paytm report rather than flagging a day it doesn't cover", () => {
    const days = checkDuDays({
      dus: DUS,
      sheets: [sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 1000)],
      placement: place(NOZZLES, [sheet(D, "MORNING", 1, "MS", 100_000, 100_500, 1000)]),
      qr: [],
      phonepe: new Map(),
      reportDays: new Set(),
      from: D,
      to: D,
    });
    expect(days[0].groups.every((g) => g.status === "no-report")).toBe(true);
  });
});
