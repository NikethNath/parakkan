import { describe, it, expect } from "vitest";
import {
  addMonths,
  isArchiveFolder,
  DUE_SOON_DAYS,
  nextDue,
  renewalStatus,
  checkDriveUrl,
  normaliseTags,
  popularTags,
  searchDocuments,
  type DocFolderView,
  type DocumentView,
} from "./documents";

const folders: DocFolderView[] = [
  { id: 1, code: "12", name: "Licences", location: "Office cabinet, shelf 2" },
  { id: 2, code: "3", name: "Bank & loans", location: "Manager's desk" },
  { id: 3, code: "A-1", name: "Staff records", location: null },
];

const doc = (o: Partial<DocumentView> & { id: number; title: string; folderId: number }) => ({
  tags: [],
  driveUrl: null,
  notes: null,
  ...o,
});

const docs: DocumentView[] = [
  doc({ id: 1, title: "PESO Licence 2026", folderId: 1, tags: ["licence", "peso"] }),
  doc({ id: 2, title: "Fire NOC", folderId: 1, tags: ["fire noc", "safety"], notes: "Renew every March" }),
  doc({ id: 3, title: "Overdraft sanction letter", folderId: 2, tags: ["bank", "loan"] }),
  doc({ id: 4, title: "Electricity invoice August", folderId: 2, tags: ["kseb", "bill"] }),
  doc({ id: 5, title: "Rajesh appointment letter", folderId: 3, tags: ["staff"] }),
];

const ids = (q: string, folderId?: number) =>
  searchDocuments(docs, folders, q, folderId).map((h) => h.doc.id);

describe("normaliseTags", () => {
  it("cleans, lower-cases and de-duplicates", () => {
    expect(normaliseTags("Licence, PESO ,peso,  Fire   NOC ,")).toEqual(["licence", "peso", "fire noc"]);
  });
  it("accepts an array too", () => {
    expect(normaliseTags(["Bank", " bank ", ""])).toEqual(["bank"]);
  });
});

describe("checkDriveUrl", () => {
  it("accepts Drive and Docs links", () => {
    const r = checkDriveUrl("https://drive.google.com/file/d/abc123/view?usp=sharing");
    expect(r).toEqual({ ok: true, url: "https://drive.google.com/file/d/abc123/view?usp=sharing" });
    expect(checkDriveUrl("https://docs.google.com/document/d/xyz/edit").ok).toBe(true);
  });

  it("completes a link pasted without https://", () => {
    expect(checkDriveUrl("drive.google.com/file/d/abc/view")).toEqual({
      ok: true,
      url: "https://drive.google.com/file/d/abc/view",
    });
  });

  it("treats blank as not scanned yet", () => {
    expect(checkDriveUrl("   ")).toEqual({ ok: true, url: null });
  });

  it("refuses anything that isn't https to Google", () => {
    expect(checkDriveUrl("javascript:alert(1)").ok).toBe(false);
    expect(checkDriveUrl("http://drive.google.com/file/d/abc").ok).toBe(false);
    expect(checkDriveUrl("https://dropbox.com/s/abc").ok).toBe(false);
    // A look-alike host is not Google.
    expect(checkDriveUrl("https://drive.google.com.evil.example/x").ok).toBe(false);
    expect(checkDriveUrl("https://evil.example/drive.google.com").ok).toBe(false);
  });
});

describe("searchDocuments", () => {
  it("finds by title", () => {
    expect(ids("overdraft")).toEqual([3]);
  });

  it("finds by tag", () => {
    expect(ids("kseb")).toEqual([4]);
    expect(ids("safety")).toEqual([2]);
  });

  it("matches the start of a word, ignoring case", () => {
    // Doc 1 by its title; doc 2 only because its folder is "Licences" — so the
    // title hit comes first.
    expect(ids("LIC")).toEqual([1, 2]);
    // "ice" is inside "invoice" and "licence" but starts neither.
    expect(ids("ice")).toEqual([]);
  });

  it("needs every word to match, so more words narrow", () => {
    expect(ids("letter")).toEqual(expect.arrayContaining([3, 5]));
    expect(ids("letter rajesh")).toEqual([5]);
  });

  it("matches a multi-word tag by either word", () => {
    expect(ids("noc")).toEqual([2]);
    expect(ids("fire noc")).toEqual([2]);
  });

  it("lists a folder's contents by its code", () => {
    expect(ids("12").sort()).toEqual([1, 2]);
    expect(ids("a-1")).toEqual([5]);
  });

  it("finds by folder name and location", () => {
    expect(ids("licences").sort()).toEqual([1, 2]);
    expect(ids("cabinet").sort()).toEqual([1, 2]);
  });

  it("finds by a word in the notes", () => {
    expect(ids("march")).toEqual([2]);
  });

  it("ranks a title hit above a tag hit", () => {
    // "licence" is the title of 1 and only a folder-name prefix for 2.
    expect(ids("licence")[0]).toBe(1);
  });

  it("filters to one folder", () => {
    expect(ids("", 2).sort()).toEqual([3, 4]);
    expect(ids("letter", 2)).toEqual([3]);
  });

  it("lists everything in shelf order when nothing is typed", () => {
    // Folder codes sort numerically then alphabetically: 3, 12, A-1.
    expect(ids("")).toEqual([4, 3, 2, 1, 5]);
  });

  it("returns the folder alongside each hit", () => {
    const [hit] = searchDocuments(docs, folders, "overdraft");
    expect(hit.folder?.code).toBe("3");
    expect(hit.folder?.location).toBe("Manager's desk");
  });
});

describe("popularTags", () => {
  it("orders by use, then name", () => {
    const more = [...docs, doc({ id: 6, title: "x", folderId: 2, tags: ["bank"] })];
    expect(popularTags(more, 3)).toEqual(["bank", "bill", "fire noc"]);
  });
});

describe("addMonths", () => {
  it("adds whole months", () => {
    expect(addMonths("2026-03-15", 12)).toBe("2027-03-15");
    expect(addMonths("2026-11-10", 3)).toBe("2027-02-10");
  });
  it("clamps to the end of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"); // leap year
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
  });
});

describe("nextDue / renewalStatus", () => {
  const today = "2026-11-06";
  const base = { id: 9, title: "x", folderId: 1, tags: [], driveUrl: null, notes: null };

  it("derives the due date from the frequency and the last renewal", () => {
    expect(nextDue({ renewEveryMonths: 12, lastRenewedOn: "2026-03-01" })).toBe("2027-03-01");
  });

  it("uses the fixed date when there is no frequency", () => {
    expect(nextDue({ renewalDueOn: "2027-01-15" })).toBe("2027-01-15");
  });

  it("prefers the frequency when both are present", () => {
    expect(nextDue({ renewEveryMonths: 6, lastRenewedOn: "2026-06-01", renewalDueOn: "2030-01-01" })).toBe(
      "2026-12-01",
    );
  });

  it("has nothing due for a document that doesn't renew", () => {
    expect(renewalStatus(base, today)).toEqual({ due: null, days: null, level: "none" });
  });

  it("flags overdue, due soon and fine", () => {
    expect(renewalStatus({ ...base, renewalDueOn: "2026-11-01" }, today)).toEqual({
      due: "2026-11-01",
      days: -5,
      level: "overdue",
    });
    expect(renewalStatus({ ...base, renewalDueOn: today }, today).level).toBe("soon");
    expect(renewalStatus({ ...base, renewalDueOn: "2026-12-06" }, today)).toMatchObject({
      days: DUE_SOON_DAYS,
      level: "soon",
    });
    expect(renewalStatus({ ...base, renewalDueOn: "2026-12-07" }, today).level).toBe("ok");
  });
});

describe("searchDocuments — renewal order", () => {
  const f: DocFolderView[] = [{ id: 1, code: "1", name: "Licences", location: null }];
  const d = (id: number, title: string, extra: Partial<DocumentView> = {}): DocumentView => ({
    id,
    title,
    folderId: 1,
    tags: ["licence"],
    driveUrl: null,
    notes: null,
    ...extra,
  });
  const list = [
    d(1, "Trade licence"), // never renews
    d(2, "PESO licence", { renewEveryMonths: 12, lastRenewedOn: "2026-02-01" }), // due 2027-02-01
    d(3, "Fire NOC", { renewalDueOn: "2026-10-30" }), // already overdue
    d(4, "Calibration certificate", { renewEveryMonths: 12, lastRenewedOn: "2025-12-01" }), // 2026-12-01
  ];

  it("puts the soonest renewal first when nothing is typed, non-renewing last", () => {
    expect(searchDocuments(list, f, "").map((h) => h.doc.id)).toEqual([3, 4, 2, 1]);
  });

  it("leads with relevance when searching, then renewal among equals", () => {
    // Title hits ("licence" in the name) beat tag-only hits; within each
    // group the sooner renewal comes first.
    expect(searchDocuments(list, f, "licence").map((h) => h.doc.id)).toEqual([2, 1, 3, 4]);
  });
});

describe("archive folders", () => {
  const today = "2026-11-06";
  const overdue: DocumentView = {
    id: 1,
    title: "PESO licence 2024",
    folderId: 9,
    tags: ["peso"],
    driveUrl: null,
    notes: null,
    renewalDueOn: "2025-01-01",
  };

  it("recognises Z folders in either case, and only those", () => {
    for (const code of ["Z-1", "z-2", "Z", " z10", "Z-Old"]) expect(isArchiveFolder({ code })).toBe(true);
    for (const code of ["L-1", "12", "A-Z", "BZ-1"]) expect(isArchiveFolder({ code })).toBe(false);
    expect(isArchiveFolder(undefined)).toBe(false);
  });

  it("gives an archived document no renewal, even with dates on it", () => {
    expect(renewalStatus(overdue, today, { code: "Z-1" })).toEqual({ due: null, days: null, level: "none" });
    // The same document anywhere else is overdue.
    expect(renewalStatus(overdue, today, { code: "L-1" }).level).toBe("overdue");
  });

  it("sorts archived documents with the ones that never renew", () => {
    const fs: DocFolderView[] = [
      { id: 1, code: "L-1", name: "Licences", location: null },
      { id: 9, code: "Z-1", name: "Archive", location: null },
    ];
    const list: DocumentView[] = [
      overdue,
      { ...overdue, id: 2, title: "PESO licence 2026", folderId: 1, renewalDueOn: "2027-01-01" },
    ];
    // Without the archive rule the 2024 copy (due 2025) would come first.
    expect(searchDocuments(list, fs, "").map((h) => h.doc.id)).toEqual([2, 1]);
  });
});
