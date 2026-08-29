# Bank statement format (SBI corporate export) — parsing reference

Used by the Phase 3 reconciliation parser (`src/services/statement.ts`).

## Two accounts, two statements

Card money moved off SBI's own POS in Aug 2026, so a complete month now needs
**two exports**, uploaded together on the reconcile page:

| Account | Holds | Date format in rows |
| --- | --- | --- |
| main current a/c (`…4074`) | GPay (PhonePe) daily **until 26 Aug 2026**; card as `BULK POSTING` **until 19 Jul 2026** | `07/08/2026` |
| Paytm settlement a/c (`…0613`) | card **from Aug 2026**; card **and UPI combined from 25 Aug 2026** | `7 Aug 2026` |

> **The bank statement upload is hidden in the app.** Since 25 Aug 2026 a
> statement can no longer supply either figure (see below). GPay/POS now come
> from the **Paytm for Business transaction report** — imported as CSV, or typed
> per day — on the reconcile page. `StatementUpload` and `/api/statements` still
> work and can be re-enabled from `src/app/admin/reconcile/page.tsx` if an older
> month ever needs importing.

The two exports are formatted slightly differently — same tab-separated shape
and same column order, but the Paytm account writes dates as `7 Aug 2026` and
uses a narrower header block. The parser accepts both date forms; a file whose
rows it can't date parses to zero transactions rather than failing loudly, so
that difference is worth remembering if an upload ever reports "nothing
recognised".

## File shape
- Despite the `.xls` extension, the export is **tab-separated ASCII text**, not a binary workbook. Parse as UTF-8/latin1 text, split on `\n`, split each row on `\t`. (SheetJS is not needed.)
- A **header block** precedes the table: Account Number, Description, Name, Currency, Address, Branch, IFSC, Book/Available Balance, Opening Balance, Start/End dates.
- The table starts at the row whose first cell is `Txn Date`. Columns:
  `Txn Date | Value Date | Description | Ref No./Cheque No. | Branch Code | Debit | Credit | Balance`
- Dates are `DD/MM/YYYY` on the main account and `D MMM YYYY` on the Paytm one — the parser takes either. Amounts use `.` decimals; a blank/space cell means no value in that column. The file ends with a `**This is a computer generated statement…` footer line — skip it.

## Classification rules
Only **Credit** rows are collections. Match on the Description text:

### GPay / UPI  → channel `GPAY`
- Description contains **`PhonePe Limited`** (full pattern: `BY TRANSFER-NEFT*YESB0000001*YESAP…*PhonePe Limited*--`), Branch Code `4430`.
- One credit per day; amount = that day's total UPI collection.
- **T+1 settlement:** money collected on day *D* is credited on *D+1* morning.
  → `businessDate = creditTxnDate − 1 day`. (Confirmed: 12 Jun collection ₹1,82,420.04 posts 13 Jun.)

### Combined UPI + card, Paytm (25 Aug 2026 →)  → **not attributable**
- One credit covers UPI *and* card with no split anywhere in the row, so it is
  **skipped** — counted in `skippedCombined` — rather than guessed at. The day's
  GPay/POS figures are typed in by hand from the Paytm Business app and stored
  as `BankTxn` rows with `enteredById` set.
- The cut-off is the constant `PAYTM_COMBINED_FROM` in `src/services/statement.ts`.
  It has to be a **date**, not a narration test: the two eras differ only in NEFT
  vs RTGS (`BY TRANSFER-RTGS UTR NO: YESBR1…--PAYTM PAYMENTS SERVICES`), which
  merely reflects the ₹2L RTGS threshold, not what the money was.
- Evidence for 25 Aug 2026 as the boundary: PhonePe's last credit (26 Aug,
  ₹71,082.92) is a part-day covering 25 Aug, and Paytm's first large credit
  (26 Aug, ₹3,59,124.78) covers the same day.
- **Settlement is no longer one-per-day** — nothing arrived on 27 Aug 2026. Days
  are reconciled from the typed figures, so a gap in the bank is not a shortfall.
- That account now also carries unrelated traffic (a personal UPI credit, and
  outgoing reimbursements/bill payments). Non-Paytm credits fall to `OTHER` and
  debits are ignored, as before.

### POS / card swipe, Paytm (Aug 2026 → 24 Aug 2026)  → channel `POS`
- Description contains **`PAYTM`** (full pattern:
  `BY TRANSFER-NEFT*UTIB0000022*AXNPM…*PAYTM PAYMENTS S--`), Branch Code `4430`,
  in the `…0613` account. Both UTIB and YESB routing appear.
- One credit per day, no DDMM tail — nothing in the row says which day it
  collected. Treated as **T+1**, the same as PhonePe: `businessDate = txnDate − 1`.
  **Confirmed** from the Paytm report: every 28 Aug 2026 transaction carries
  settlement UTR `YESBR1`**`20260829`**`…`, while the bank's own 28 Aug credit is
  `YESBR1`**`20260828`**`…` — the UTR embeds the credit date, one day after
  collection.

### POS / card swipe, SBI (until 19 Jul 2026)  → channel `POS`
- Description contains **`BULK POSTING-SBIP_CR_PARAKKAN PETROLEUM`**, Branch Code `16899`.
- Pattern tail: `… 0220000000nnnnn <DDMM>--`. The **`DDMM`** token is the real business date (e.g. `2306` = 23 Jun). Use it, **not** the Txn Date (which is the +1 posting day).
- A single day can have **multiple** BULK POSTING rows (settlement catch-up), each tagged with its own DDMM — aggregate by DDMM.
- Year: inherit from the statement period; handle Dec→Jan rollover (DDMM `3112` posting in early Jan belongs to the prior year).

### Excluded (not collections)
- `DEBIT-…Pos Rent for TID-…`, `DEBIT-…Pos Basic_Service_Fee…` → POS charges (debits). Optionally surface as POS fees, never as collections.
- `TO TRANSFER-INB Edfs` → outgoing HPCL fuel payments (EDFS sweep).
- `TO TRANSFER-IMPS…`, insurance, `…Tds`, `EC CHARGE`, other NEFT → `OTHER`.

## Reconciliation against employee entries
- For a given business date, sum employee-entered `gpay` across both shifts → compare to that date's bank `GPAY` credit.
- Same for `pos` vs the aggregated `POS` (BULK POSTING) for that DDMM.
- Flag variances beyond a small tolerance (rounding / pending settlements).


## Paytm for Business transaction report (CSV) — the current source

Parsed by `src/services/paytmReport.ts`, imported at `/api/reconcile/paytm-report`.

- One row per customer payment, ~115 columns. Values are wrapped in a **literal
  apostrophe** (`'2026-08-28 09:41:52'`), so strip quotes before use, and look
  columns up **by name** — the order is not worth depending on.
- Daily, weekly and monthly exports are all available, and a long one arrives
  **split into numbered parts** (`…_001.csv`, `…_002.csv`). Parts must be
  imported **together**: a day routinely straddles two of them, and a day is
  stored by replacement, so importing parts one at a time leaves the boundary
  day holding only the last part's share. `parsePaytmReports()` sums the parts
  before anything is written, and de-duplicates on `Transaction_ID` so an
  overlapping weekly and monthly export can safely go in at once. The response
  names every day whose existing figures were replaced.
- Columns used, and only these: `Transaction_Date` (the collection moment → the
  business date), `Status`, `Transaction_Type`, `Amount`, `Payment_Mode`.
- Counted only when `Status = SUCCESS` **and** `Transaction_Type = ACQUIRING`, so
  failures, aborts and refunds stay out.
- `Amount` is used rather than `Settled_Amount` — the sheet records what the
  customer paid at the pump, before Paytm's commission. (Commission is currently
  ₹0, so they are equal.)

### Mode → channel

| `Payment_Mode` | Channel | Why |
| --- | --- | --- |
| `UPI`, `UPI_LITE`, `UPI_PPIWALLET`, `UPI_CREDIT_CARD` | **GPAY** | The customer scanned the QR. `UPI_CREDIT_CARD` is a RuPay credit card paid *over UPI* — staff record it as a UPI collection, not a swipe. **UPI is tested before CARD** for exactly this reason. |
| `DEBIT_CARD`, `CREDIT_CARD` | **POS** | Swiped on the machine. |
| anything else | *unclassified* | Never guessed at: counted, named in the response, and reported in the UI so the shortfall is visible. |

### The file is never kept

It carries customer VPAs, mobile numbers, card last-4 digits and employee names.
The route reads it from the request in memory, reduces it to two totals per day,
and drops it — no disk write, no `BankUpload` row, no raw rows in the database.
A real 491 KB / 746-transaction export leaves exactly **two** `BankTxn` rows; a
month of 23,250 payments across three parts leaves 62, and imports in ~0.5 s.
(The CRIS fetch does the same: `downloadXls` reads the export into memory and
calls `download.delete()` immediately.)

### How a day's figures combine

Every `BankTxn` carries a `source`, and `sumBankFigures()` uses it to decide
whether figures **add** or **supersede**:

| `source` | Meaning | Combining |
| --- | --- | --- |
| `STATEMENT` | Parsed from a bank statement, money that isn't Paytm's (PhonePe UPI, SBI BULK POSTING card) | **Adds** |
| `PAYTM_BANK` | Parsed from a bank statement, a Paytm settlement credit | **Dropped** on any day a `PAYTM_REPORT` row exists — same money, told better |
| `PAYTM_REPORT` | Imported from the Paytm transaction report | **Adds** |

Adding is what makes the changeover day right: 25 Aug 2026 GPay is PhonePe's
₹71,082.92 **plus** Paytm's share from the report. The `PAYTM_BANK` exception is
what stops 7–24 Aug card money being counted twice — once from the Paytm NEFT
credits already imported, once from the report covering the same days.

Superseded `PAYTM_BANK` rows are skipped on read, never deleted, so re-uploading
a statement can't double anything. An import replaces only previous
`PAYTM_REPORT` rows for the days it covers.

> Editing a day's GPay/POS by hand was removed — the report is the source.
