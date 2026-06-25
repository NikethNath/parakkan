# Bank statement format (SBI corporate export) — parsing reference

Used by the Phase 3 reconciliation parser (`src/services/statement.ts`).

## File shape
- Despite the `.xls` extension, the export is **tab-separated ASCII text**, not a binary workbook. Parse as UTF-8/latin1 text, split on `\n`, split each row on `\t`. (SheetJS is not needed.)
- A **header block** precedes the table: Account Number, Description, Name, Currency, Address, Branch, IFSC, Book/Available Balance, Opening Balance, Start/End dates.
- The table starts at the row whose first cell is `Txn Date`. Columns:
  `Txn Date | Value Date | Description | Ref No./Cheque No. | Branch Code | Debit | Credit | Balance`
- Dates are `DD/MM/YYYY`. Amounts use `.` decimals; a blank/space cell means no value in that column. The file ends with a `**This is a computer generated statement…` footer line — skip it.

## Classification rules
Only **Credit** rows are collections. Match on the Description text:

### GPay / UPI  → channel `GPAY`
- Description contains **`PhonePe Limited`** (full pattern: `BY TRANSFER-NEFT*YESB0000001*YESAP…*PhonePe Limited*--`), Branch Code `4430`.
- One credit per day; amount = that day's total UPI collection.
- **T+1 settlement:** money collected on day *D* is credited on *D+1* morning.
  → `businessDate = creditTxnDate − 1 day`. (Confirmed: 12 Jun collection ₹1,82,420.04 posts 13 Jun.)

### POS / card swipe  → channel `POS`
- Description contains **`BULK POSTING-SBIP_CR_PARAKKAN PETROLEUM`**, Branch Code `16899`.
- Pattern tail: `… 022000000318564 <DDMM>--`. The **`DDMM`** token is the real business date (e.g. `2306` = 23 Jun). Use it, **not** the Txn Date (which is the +1 posting day).
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
