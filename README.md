# Government Budget Management System (GBMS)

A full-stack application for preparing, reviewing, approving, publishing, executing
and reporting government budgets across Ministries, Departments and Agencies (MDAs).
It implements the official budget preparation forms (Forms A–H of *Foom 4 —
Foomamka Heerka Diyaarinta Miisaaniyadda*), their consistency checks, a multi-stage
approval workflow, budget execution, analysis, reporting and Excel import/export.
The interface is available in English and Somali; amounts are in US dollars and times
use the Africa/Mogadishu time zone (both configurable).

## Contents

- [Quick start](#quick-start)
- [Development accounts](#development-accounts)
- [Everyday commands](#everyday-commands)
- [Architecture](#architecture)
- [Modules](#modules)
- [Data integrity and security](#data-integrity-and-security)
- [Testing](#testing)
- [Initial data and Excel files](#initial-data-and-excel-files)
- [Production deployment](#production-deployment)

## Quick start

Requirements: Node.js 22 or later. No separate PostgreSQL installation is needed for
development — `npm run db:start` runs an embedded PostgreSQL 18 server from npm.

```bash
npm install
```

```bash
cp .env.example .env
```

Set `AUTH_SECRET` in `.env` to a random value:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Create the database, apply the migrations and load the seed data:

```bash
npm run setup
```

Start the application and open the URL it prints (http://localhost:3000 by default):

```bash
npm run dev
```

The embedded database keeps running in the background. Stop it with
`npm run db:stop`; after a reboot, start it again with `npm run db:start`.

## Development accounts

The seed creates 17 **development-only** accounts, one per role and several MDA
officers (for example `admin`, `budget.admin`, `officer.10101`, `reviewer`,
`director`, `approver`, `executive`, `auditor`). Usernames, roles and MDA assignments
are listed in [`prisma/seed/users.ts`](prisma/seed/users.ts), which also defines the
shared development password (override it with the `SEED_DEV_PASSWORD` environment
variable before seeding). These accounts are marked as development seed data in the
user list. **Never load the development seed into a production database** — use
`SEED_SKIP_DEV=true` (see below).

## Everyday commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run db:start` / `db:stop` / `db:status` | Embedded PostgreSQL (development) |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Load seed data (skips development data if budgets already exist) |
| `npm run db:reset` | Drop and recreate the development database, then seed (destructive) |
| `npm run create-admin -- --username … --email … --name "…"` | Create an administrator with a one-time temporary password |
| `npm test` | Unit and integration tests |
| `npm run test:unit` / `test:integration` / `test:e2e` | Individual test suites |

## Architecture

- **Next.js 16 (App Router)**, React 19, TypeScript, Tailwind CSS 4 and shadcn/ui
  components; Recharts for charts; TanStack Table for data tables; React Hook Form
  with Zod for forms.
- **PostgreSQL** with **Prisma 7** (driver adapter `@prisma/adapter-pg`). The generated
  client is in `src/generated/prisma`.
- **Business logic lives in services** (`src/lib/services`), which receive an `Actor`
  (the signed-in user with permissions and MDA assignments) and enforce authorisation,
  validation and auditing. Pages, server actions and route handlers are thin: they
  parse input with Zod and call a service.
- **Calculations** (`src/lib/calculations`) use `decimal.js` with round-half-up to 2
  decimals. All totals are recalculated on the server; no calculated value is
  accepted from the browser.

```
src/
  app/(app)/            Authenticated pages (dashboard, budget, execution, analysis,
                        reports, submissions, administration, audit, profile)
  app/api/              Route handlers (exports, reports, attachments, health)
  components/           UI: app (design system), charts, budget, reports, ui (shadcn)
  lib/auth/             Sessions, permissions, actor
  lib/calculations/     Money, budget formulas, Forms A–H summary, validation rules
  lib/services/         Domain services (submissions, workflow, execution, imports…)
  lib/imports/          Excel/CSV readers and import profiles
  lib/exports/          Form 4 workbook, PDF helpers, CSV
  lib/reports/          Report catalogue, renderers (PDF/Excel/CSV), report builder
  lib/i18n/             English and Somali dictionaries
prisma/                 Schema, migrations (incl. integrity triggers) and seed
tests/                  unit, integration and e2e tests
data/                   Reference workbook and the official Form 4 template
```

## Modules

| Area | What it does |
| --- | --- |
| Dashboard | Role-specific dashboards (agency, reviewer, executive, administrator, auditor) with management alerts and drill-down charts |
| Budget | Budget years, submissions, the Forms A–H workspace, Validation Center, certification, review, attachments, version history, revisions; cross-agency lists of items, revenue, expenditure, personnel, capital projects, procurement and cash flow |
| Submissions | Review queues: pending, under review, returned, approved, rejected |
| Workflow | Submit → budget officer review → director endorsement → final approval → publication, with return-for-correction lists and immutable approved versions |
| Execution | Published allocations, monthly actuals, revenue collections, commitments register (commitment → obligation → payment) |
| Analysis | Budget analysis, variance, MDA comparison, multi-year trends and a drill-down from government level to detailed codes |
| Reports | 15 standard reports and a report builder; print, PDF, Excel and CSV |
| Administration | MDAs, classification codes and crosswalks, budget years, users, roles and permissions, system settings, lookup lists, validation rules, Excel import wizard |
| Audit | Immutable audit trail with filters and CSV export |

## Data integrity and security

- **Approved budgets are immutable.** Database triggers reject changes to lines and
  forms of locked submissions, and make `audit_logs`, `approval_steps` and
  `budget_versions` append-only. Changes after approval go through a budget revision.
- **Validation errors block submission.** The Validation Center applies the same
  consistency checks as the official template (for example Form D personnel = Form E
  total, Form H cash flow = Form B total); the error message lists every blocking item.
- **Access control uses permissions, not role names.** Roles are editable
  collections of permissions; data is additionally scoped to a user's MDAs unless the
  role grants access to all MDAs, and executive viewers can be limited to approved
  data.
- **Sessions** are random tokens stored as HMAC hashes, with absolute and idle
  timeouts; passwords are hashed with bcrypt; sign-in is rate limited with account
  lockout. Users with a temporary password must change it before using the system.
- **Uploads** are checked by extension, size and file signature, stored outside the
  public folder and served only through an authorised route.
- **Security headers** (CSP, frame denial, no-sniff, referrer and permissions
  policies, HSTS in production) are set in `next.config.ts`.
- Every significant action (sign-in, change, workflow step, import, export,
  permission change) is recorded in the audit log.

## Testing

- **Unit tests** (`tests/unit`) cover the calculation engine, form summaries,
  validation rules and the workflow state machine.
- **Integration tests** (`tests/integration`) run the services against a real
  database: budget workflow and corrections, database-level locking, revisions, Form 4
  and PDF exports, Excel/CSV imports, execution and commitments, reports and the
  report builder, and deadline reminders. Each run creates a fresh database named
  `gbms_test_<timestamp>` on the server of `TEST_DATABASE_URL`, applies the migrations,
  loads the seed and drops that database afterwards; no existing database is reset.
  Set `TEST_DB_REUSE=true` to run against `TEST_DATABASE_URL` directly while iterating.
- **End-to-end tests** (`tests/e2e`, Playwright) exercise the main user journeys in a
  real browser (Microsoft Edge by default; set `E2E_CHANNEL=chrome` to use Chrome):
  sign-in, redirects, editing a draft budget, the Validation Center, access control,
  review queues, reports and exports, and switching to Somali. `npm run test:e2e`
  creates a throwaway `gbms_e2e_<timestamp>` database seeded with a random password,
  starts the production build against it and drops the database afterwards. Build
  first:

```bash
npm run build
```

```bash
npm run test:e2e
```

## Initial data and Excel files

- `data/reference/Final Draft Budget 2027.xlsx` is the reference workbook used for the
  initial load: the chart of accounts, the MDA register and the historical approved
  budgets are imported through the same import pipeline that users run from
  *Administration → Excel import*.
- `data/templates/Foom 4 - Foomamka Heerka Diyaarinta Miisaaniyadda.xlsx` is the
  official preparation template. The *Download forms (Excel)* action regenerates it
  from the database, row for row, including its formulas and consistency checks.
- Development-only data (sample users, the 2027 preparation cycle in every workflow
  state, execution records and the 2025 per-MDA split of government totals) is marked
  as development seed data. Load only system configuration and reference data with:

```bash
SEED_SKIP_DEV=true npm run db:seed
```

See [docs/excel-mapping.md](docs/excel-mapping.md) for how workbook sheets, columns
and codes map to the database and to the official forms.

## Production deployment

**Hostinger:** see [DEPLOYMENT.md](DEPLOYMENT.md) for a step-by-step guide to deploying
the demo as a Hostinger Node.js web app with a managed PostgreSQL database.

On any other server:

1. Provision PostgreSQL 16 or later and set `DATABASE_URL`.
2. Set a strong, unique `AUTH_SECRET`, `SECURE_COOKIES=true` and serve the application
   over HTTPS.
3. Set `STORAGE_DIR` to persistent storage that is backed up together with the
   database (attachments and uploaded import files).
4. Apply migrations and load configuration and reference data only:

```bash
npx prisma migrate deploy
```

```bash
SEED_SKIP_DEV=true npm run db:seed
```

5. Build and start:

```bash
npm run build
```

```bash
npm start
```

6. Create the first administrator account. A temporary password is printed once and
   must be changed at the first sign-in:

```bash
npm run create-admin -- --username jdoe --email jdoe@example.gov --name "Jane Doe"
```

7. Sign in, then review *Administration → Settings* (organisation names, currency,
   time zone, security and budget rules), the roles, the MDAs and the budget years.
8. Monitor `GET /api/health` (returns 503 when the database is unavailable).
