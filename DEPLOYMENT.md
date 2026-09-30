# Deploying the demo on Hostinger

This guide deploys the application as a **Hostinger Node.js web app** (Business or
Cloud hosting) from the private GitHub repository, with the demo accounts and demo
budget data. Hostinger's web hosting offers MySQL only, while this application
requires **PostgreSQL**, so the database runs on a free managed PostgreSQL service
(Neon, recommended; Supabase also works).

The first deployment creates the database tables and loads the demo data
automatically. Later deployments apply new migrations and keep the data.

## 1. Create the PostgreSQL database (Neon)

1. Sign up at [neon.tech](https://neon.tech) and create a project. Pick the region
   closest to your Hostinger server (for example *Europe (Frankfurt)* for an EU
   server). PostgreSQL 16 or later.
2. On the project dashboard, click **Connect**, turn **Connection pooling off** (use
   the direct connection) and copy the connection string. It looks like:
   `postgresql://USER:PASSWORD@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`
3. Keep this string private — it is the `DATABASE_URL` below.

> **Supabase instead of Neon:** in *Project Settings → Database → Connect*, use the
> **Session pooler** connection string (port 5432). The direct connection is IPv6-only
> and the transaction pooler (port 6543) does not support migrations. Note that free
> Supabase projects pause after a week without activity.

## 2. Prepare two secrets

- **AUTH_SECRET** — a random value. On any computer with Node.js:
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
   | `DATABASE_URL` | the Neon connection string from step 1 |
   | `AUTH_SECRET` | the random value from step 2 |
   | `SEED_DEV_PASSWORD` | your private demo password from step 2 |
   | `DEPLOY_DB_SETUP` | `true` |
   | `SECURE_COOKIES` | `true` |
   | `STORAGE_DIR` | a folder outside the app, e.g. `/home/<your-user>/gbms-storage` (see note) |

5. Click **Deploy**. The first build takes several minutes: it creates the tables,
   then loads the reference data and the demo data set over the network before
   building the application. Watch the build log for `✓ Seed completed`.

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

**Start the demo from scratch:** in Neon, delete and recreate the database (or create
a new branch and use its connection string), then redeploy in hPanel.

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
| Build times out while loading the demo data | Run the database step once from your computer (inside the project folder, after `npm install`): `DATABASE_URL="<connection string>" SEED_DEV_PASSWORD="<password>" npm run db:deploy`, then redeploy — the build sees the data and skips the seed |
| Build fails with a database connection error | Check `DATABASE_URL` (direct connection, `?sslmode=require`) and that the Neon project is active |
| Sign-in returns to the sign-in page | The site must be served over HTTPS when `SECURE_COOKIES=true`; enable SSL for the domain in hPanel |
| Saving a form fails with an "invalid origin" error | Set `SERVER_ACTIONS_ALLOWED_ORIGINS` to your domain, e.g. `budget.example.com`, and redeploy |
| A page shows "Something went wrong" | Open the runtime logs of the Node.js app in hPanel; `GET /api/health` reports whether the database is reachable |
