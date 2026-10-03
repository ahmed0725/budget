# Deploying the demo on Hostinger

This guide deploys the application as a **Hostinger Node.js web app** (Business or
Cloud hosting) from the private GitHub repository, with the demo accounts and demo
budget data, using the **MySQL database included with the hosting plan**.

The first deployment creates the database tables and loads the demo data
automatically. Later deployments apply new migrations and keep the data.

## 1. Create the MySQL database

1. In hPanel go to **Websites → (your site) → Databases → Management** and create a
   database with its own user and a strong password. Hostinger prefixes both names
   with your account number, e.g. database `u123456789_bms` and user `u123456789_bms`.
2. Build the connection string from those values:

   `mysql://USER:PASSWORD@localhost:3306/DATABASE`

   e.g. `mysql://u123456789_bms:<password>@localhost:3306/u123456789_bms`.
   Use `localhost` — the database runs on the same server as the app. If the password
   contains special characters, URL-encode them: `@` → `%40`, `#` → `%23`, `/` → `%2F`,
   `:` → `%3A`, `?` → `%3F`, `%` → `%25`, space → `%20` (or choose a password of
   letters and digits only).
3. Keep this string private — it is the `DATABASE_URL` below.

The application works with MySQL 8 or later and MariaDB 10.4 or later. On the first
deployment it creates the tables and installs database triggers that make approved
budgets and the audit trail tamper-proof. If the host does not allow triggers, the
build log shows a warning and the application's own checks still protect that data.

## 2. Prepare two secrets

- **AUTH_SECRET** — a random value of at least 32 characters (not a password anyone
  types). On any computer with Node.js:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- **SEED_DEV_PASSWORD** — the password you will use for all demo accounts (at least
  10 characters). Only people you give it to can sign in.

## 3. Create the Node.js web app in hPanel

1. In hPanel go to **Websites → Add Website → Node.js web app**.
2. Choose **Import Git repository → Connect with GitHub**, authorise the Hostinger
   GitHub app for the private repository `ahmed0725/budget`, then select it and the
   branch **main**.
3. Build settings:

   | Setting | Value |
   | --- | --- |
   | Framework preset | Next.js |
   | Node.js version | 22 |
   | Package manager | npm |
   | Build command | `npm run build` |
   | Output directory | `.next` |
   | Start command (if asked) | `npm start` |

4. Environment variables:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the MySQL connection string from step 1 |
   | `AUTH_SECRET` | the random value from step 2 |
   | `SEED_DEV_PASSWORD` | your private demo password from step 2 |
   | `DEPLOY_DB_SETUP` | `true` |
   | `SECURE_COOKIES` | `true` |
   | `SERVER_ACTIONS_ALLOWED_ORIGINS` | your site's domain, e.g. `budget.example.gov` |
   | `STORAGE_DIR` | a folder outside the app, e.g. `/home/<your-user>/gbms-storage` (see note) |

5. Click **Deploy**. The first build takes several minutes: it creates the tables,
   then loads the reference data and the demo data set before building the
   application. Watch the build log for `▶ Applying database migrations`
   and `✓ Seed completed`.

**Why the log says "Building with webpack":** Hostinger's build servers run an older
Linux (glibc below 2.29) that cannot load Next.js's native compiler, so Next.js uses
its WebAssembly compiler, and the build script switches to the webpack bundler
automatically. The site works the same; the build is just slower (a few minutes). Warnings
such as `Attempted to load @next/swc-linux-x64-gnu` in the log are expected.

**STORAGE_DIR:** attachments and uploaded Excel files are stored here. Use a folder
that survives redeployments (outside the application folder). If you are unsure of
the path, you can leave it unset for a demo: files are then kept in `./storage`
inside the app folder and may be lost when the app is redeployed.

## 4. Sign in

Open the website address shown in hPanel (or connect your domain in hPanel) and sign
in with any of these demo accounts, using your `SEED_DEV_PASSWORD`:

| Username | Role | What to try |
| --- | --- | --- |
| `admin` | System administrator | Everything, including Administration and Excel import |
| `budget.admin` | Budget administrator | Budget years, codes, MDAs, publishing |
| `officer.10101` | MDA budget officer (Presidency) | The 2027 draft budget, Forms A–H, Validation Center |
| `finance.10101` | MDA finance officer (Presidency) | Certification |
| `accounting.10101` | MDA accounting officer (Presidency) | Certification and submission |
| `officer.10301`, `officer.40101`, `officer.40201`, `officer.20501`, `officer.30201`, `officer.30501` | MDA budget officers | Budgets in each workflow state (40101 uses Somali) |
| `reviewer` | Budget reviewer | Review queues, recommend or return with corrections |
| `director` | Director / senior reviewer | Endorse budgets |
| `approver` | Approval authority | Final approval |
| `analyst` | Budget analyst | Analysis and reports |
| `executive` | Executive viewer | Executive dashboard (approved data only) |
| `auditor` | Auditor | Audit logs and reports |

## 5. Updating the site

Push to `main`; Hostinger rebuilds and redeploys automatically. New database
migrations are applied during the build and existing data is kept. The demo data is
loaded only into an empty database.

**Start the demo from scratch:** in hPanel → Databases, delete the database and create
it again with the same name and user (or open phpMyAdmin and drop all its tables),
then redeploy.

**Real use instead of a demo:** use a new, empty database with `SEED_SKIP_DEV=true`
(no demo accounts or budgets). Hostinger has no terminal for Node.js apps, so create
the first administrator from your own computer against that database:

```bash
DATABASE_URL="<connection string>" npm run create-admin -- --username jdoe --email jdoe@example.gov --name "Jane Doe"
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Build fails with `SEED_DEV_PASSWORD must be set` | Add the variable (or `SEED_SKIP_DEV=true`) and redeploy |
| Build fails with `Environment settings need attention` | The log lists what is missing or too short; fix it in the environment variables and redeploy |
| Build fails with `Access denied for user` | User name or password in `DATABASE_URL` is wrong, or special characters in the password are not URL-encoded |
| Build fails with `Unknown database` | The database name in `DATABASE_URL` does not match the one in hPanel → Databases (include the `u…_` prefix) |
| Build times out while loading the demo data | Enable *Remote MySQL* for your IP in hPanel and run the database step once from your computer (inside the project folder, after `npm install`), with the server's host name instead of `localhost`: `DATABASE_URL="<connection string>" SEED_DEV_PASSWORD="<password>" npm run db:deploy`; then redeploy — the build sees the data and skips the seed |
| Sign-in returns to the sign-in page | The site must be served over HTTPS when `SECURE_COOKIES=true`; enable SSL for the domain in hPanel |
| Saving a form fails with an "invalid origin" error | Set `SERVER_ACTIONS_ALLOWED_ORIGINS` to your domain, e.g. `budget.example.com`, and redeploy |
| A page shows "Something went wrong" | Open the runtime logs of the Node.js app in hPanel; `GET /api/health` reports whether the database is reachable |
