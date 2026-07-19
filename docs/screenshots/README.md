# Screenshot shot list

**Regenerate everything with `npm run screenshots`** (needs the local Postgres
container up and Chrome installed). The script — [scripts/screenshots.ts](../../scripts/screenshots.ts) —
seeds a throwaway database with demo data, drives headless Chrome through every
page below, and overwrites these PNGs. Run it after any visual change so the
README stays current.

The filenames are referenced from the root README. If you ever capture one by
hand instead: **use seeded demo data only** — never real figures, and never any
page showing customer names, phone numbers, or vehicle numbers.

| File | Page | Viewport |
|------|------|----------|
| `admin-dashboard.png` | `/admin` with a date range picked, submissions table + verification queue visible | desktop |
| `employee-sheet.png` | the entry form (e.g. editing an unverified sheet), live short/excess bar at the bottom | phone (~390px) |
| `denominations.png` | the currency-note counter section of the entry form | phone (~390px) |
| `entry-review.png` | `/admin/entries/<id>` in edit mode | desktop |
| `audit-trail.png` | the "Edit history" card on a sheet that has admin edits | desktop |
| `meter-cris.png` | `/admin/meter` with CRIS subscripts, at least one red flag + "Fix → CRIS" button | desktop |
| `cris-compare.png` | `/admin/cris` sales comparison | desktop |
| `bank-reconcile.png` | `/admin/reconcile` after a statement upload | desktop |
| `salary.png` | `/admin/shortexcess` with a staff member + date range selected | desktop |

Tips: light theme reads best on GitHub; crop the browser chrome; keep files
under ~300 KB each (GitHub renders faster).
