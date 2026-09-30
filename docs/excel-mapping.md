# Excel mapping

How the government's Excel workbooks map to the database, and how the official
forms are regenerated from it. Code references are to files under `src/lib`.

## 1. Consolidated budget workbook ("Final Draft Budget" format)

Import type **Government budget workbook** (`imports/profiles/budget-workbook.ts`).
The importer detects the role of every sheet; the user can change the roles and the
treatment of each year in the *Map* step of the import wizard.

| Sheet (example) | Role | Content | What is imported |
| --- | --- | --- | --- |
| `Shaxda 1.2` | Revenue detail | Hierarchical revenue codes, one column per year | Revenue lines (leaf codes only) attributed to the MDA chosen as *MDA that holds consolidated revenue* (default: the MDA that carried revenue in earlier approved budgets) |
| `Shaxda 1.1` | Summary | Revenue and expenditure summary by code and year | Nothing — used only to **reconcile** totals |
| `Shaxda 2.1` | MDA summary | One row per MDA, one column per summary expenditure code | Expenditure lines per MDA; column headers are translated to classification codes through the code crosswalk (scheme `SHAXDA_SUMMARY_2026`, see *Administration → Budget codes → Code mappings*) |
| `10101`, `10201`, … | MDA detail | One block per MDA with detailed economic codes per year | Expenditure lines per MDA at the detailed code level |

For each year found in the workbook the user chooses **Approved historical budget**
(written as an approved, locked submission — published when the year is already in
execution or closed), **Draft for preparation** (creates or updates a draft
submission) or **Do not import**.

Rules applied while parsing:

- Only **leaf rows** are imported; parent rows are totals. Parent totals are compared
  with the sum of their children and differences are reported as warnings.
- Rows whose amount cells are formulas that only add up other rows (`SUM(...)`,
  `=E199`, `=A1+B2`) are **hidden subtotals**: they are treated as totals, never as
  lines, and flagged with a warning.
- Monthly or derived columns such as *Qiyaas Bileed* (annual ÷ 12) are not imported;
  the system recalculates them.
- A code that appears twice in a section is merged when the amounts are compatible
  (the most complete row wins); conflicting duplicates are errors.
- Excel error values (`#REF!`, `#DIV/0!`) are errors on detail rows and warnings on
  total rows. Negative amounts are errors.
- Existing **approved budgets are never overwritten**: such rows are reported as
  duplicates. Budgets under review cannot be changed by an import. Draft budgets are
  updated only when the year is imported as *Draft*.
- Drafts can only be imported into a year in preparation; approved budgets only into
  years that are already approved, published, active or closed.

The **reconciliation** table compares imported totals with the summary sheet
(`Shaxda 1.1`) per year and per summary code, and shows every difference.

## 2. Tabular imports (CSV or Excel)

For these import types the first row with column titles is detected automatically
and columns are matched by their titles (English or Somali); every mapping can be
changed in the *Map* step. A year or an MDA can be fixed for the whole file instead of
being read from a column.

| Import type | Required columns | Optional columns | Result |
| --- | --- | --- | --- |
| Budget lines | code, amount (+ year and MDA unless fixed) | description, revenue/expenditure | Draft or approved budget lines (same rules as above) |
| Expenditure actuals | month, code, actual (+ year and MDA unless fixed) | planned, remarks | Monthly actual expenditure (replaces or adds to existing figures) |
| Revenue collections | month, code, amount (+ year and MDA unless fixed) | target, remarks | Monthly revenue collections |
| Chart of accounts | code, official name | English name, type, parent code, category code, effective-from year | New classification codes (placed under their parent) and name updates |

Months may be written as numbers (`1`–`12`), dates (`2026-08-15`) or names in English
or Somali (`Aug`, `August`, `Ogosto`). Amounts may contain thousands separators,
`$`/`US$` and accounting negatives in brackets (which are rejected as negative).

Every row is validated before anything is written; the preview shows the status of
each row (**valid**, **warning**, **error**, **duplicate**, **skipped**) with an
explanation. Rows with errors can be corrected in place (tabular imports) or skipped.
The import itself runs in one transaction: if any row fails, nothing is written.

## 3. Official preparation forms (Foom 4)

*Download forms (Excel)* in the budget workspace regenerates the official template
(`exports/form4.ts`) from the database for one submission.

| Template section | Source in the database |
| --- | --- |
| A — Agency summary | Submission header (allocation number, category, accounting officer, contact person, telephone, e-mail) |
| B — Budget summary | Calculated: personnel, goods and services, other recurrent (Form D categories) and capital (Form F), prior-year approved vs proposal |
| C — Revenue | Revenue lines by category: prior-year actual, prior-year approved, current-year estimate, proposal |
| D — Recurrent expenditure | Expenditure lines summed by budget category, with justifications |
| E — Personnel | Personnel records: establishment, filled positions, monthly and annual cost |
| F — Capital projects | Capital projects and their allocation for the year |
| G — Procurement plan | Procurement plan items by quarter and method |
| H — Cash flow | Quarterly cash-flow forecast |
| Consistency checks | Formulas identical to the template: Form D personnel = Form E total; Form B = Form D + Form F; Form H = Form B; Form G ≤ eligible Form D categories + Form F; revenue = expenditure. Each shows *WAAFAQSAN* or *KALA DUWAN - dib u eeg* |
| Certification | Names, titles and electronic signatures of the preparer, finance director and accounting officer |

Totals are written as formulas with their calculated values cached, so the workbook
shows the correct figures immediately and Excel recalculates them on opening. Extra
sheets list the detail behind the forms: **Faahfaahinta Kharashka** (expenditure
lines with baseline and change), **Faahfaahinta Dakhliga** (revenue lines),
**Hubinta** (every validation check with its result) and **Xogta Dukumentiga**
(document metadata: MDA, year, status, version, generated by and when).

## 4. Report exports

Every standard report and every report-builder result exports to PDF, Excel and CSV
from the same data as the screen. Excel keeps amounts numeric with the currency
format, so totals can be re-checked in the workbook; CSV files start with a UTF-8
byte-order mark so Excel opens Somali text correctly, and cells that could be read as
formulas are escaped.
