# Running OneDesk CRM

The application is two halves that ship as one: a React front end and a Node
API. In production a single process serves both from one port, so there is one
thing to start, one URL to give people, and no CORS to configure.

## The shape of it

```
shared/api.ts          The contract. Route names, request and response types.
                       Both halves import it, so a change that breaks one
                       stops the other compiling instead of failing in front
                       of a user.

server/
  index.ts             The process: reads settings, starts, stops cleanly.
  app.ts               Assembles the API and the static front end.
  config.ts            Every setting, validated once at boot.
  logger.ts            One JSON line per event in production.
  env.ts               Reads .env / .env.local when no real environment is set.
  http/                Request ids, logging, CORS, rate limiting, errors.
  modules/
    ai/                Robi's replies. The API key never leaves this process.
    excel/             The live workbooks. Paths never come from a request.
    health/            /api/health for liveness, /api/ready for dependencies.

src/lib/api-client.ts  The browser's only way of calling the server.
```

The same Express app runs in development (mounted into Vite by
`server/api-plugin.ts`) and in production. There is no separate dev
implementation to drift out of step.

## Settings

Copy `.env.example` to `.env.local` and fill in what you need. Nothing there
has a `VITE_` prefix, so no key or file path is ever bundled into the browser.
Real environment variables always win over the file.

The server starts with none of it configured and says on the way up what is
and is not connected. `GET /api/ready` reports the same thing at any time.

### The starting passwords

Nobody's password is in this repository. Before the **first** start on a new
machine, copy `server/modules/auth/initial-passwords.example.json` to
`.crm-auth/initial-passwords.json` and put the real ones in it, keyed by
account id (`admin-0`, `coord-1`, ...). That folder is git-ignored.

It is read **once**. After the first start the accounts file exists and the list
is never consulted again, so editing it later changes nothing — change a
password in the Admin Panel instead. Any account the list leaves out starts on
`Welcome@123`, so a forgotten one is never left open.

### The two Excel books

Each book is a file plus a tab. They are configured separately, so they can be
two files or — commonly — one file with a tab for each:

```
EXCEL_ACTIVE_PAYMENTS_PATH=C:\Users\np133\Downloads\CRM Book.xlsx
EXCEL_ACTIVE_PAYMENTS_SHEET=CRM ACTIVE PAYMENT
EXCEL_OVERDUE_PAYMENTS_PATH=C:\Users\np133\Downloads\CRM Book.xlsx
EXCEL_OVERDUE_PAYMENTS_SHEET=CRM OverDue
```

The same path twice is deliberate: the two modules read the same file and take
different tabs from it. Nothing is shared between them beyond the bytes — each
runs its own column mapping, its own validation, and its own import.

The tab name is matched ignoring case and extra spaces, and if the tab is not
there the error names the tabs that are. Leaving the `_SHEET` lines out is also
fine: each module then picks the tab whose columns it recognises — the ageing
buckets identify one, an invoice or due date the other — so a single-tab file
needs no setting at all.

Each tab needs its own columns. Active Payments cannot import without a company
name, a coordinator and an amount; Overdue Payments needs a BP code, a customer
name, a coordinator and a balance due. Header spelling is matched loosely
("Cust. Code", "Co-ordinator Name", "Payment Term Total Amount" all map), and a
sheet missing a required column is refused whole rather than half-imported.

## Running it

```bash
npm install
npm run dev            # development, http://localhost:5173

npm run build          # front end into dist/, server into dist-server/
npm start              # production, http://localhost:8080
```

On Windows, `Start_CRM.bat` does the build and the start together and opens
the browser.

Other commands:

```bash
npm test               # the whole suite
npm run typecheck      # both TypeScript projects
npm run start:dev      # the production server from source, no build step
```

## Deploying

Any host that runs Node 20 or later works. The process:

- listens on `PORT` (default 8080) and `HOST` (default 0.0.0.0);
- serves the built front end from `STATIC_DIR` (default `dist`) with an
  index.html that is never cached and hashed assets that are cached for a year;
- answers `GET /api/health` for liveness and `GET /api/ready` for readiness;
- logs one JSON object per line to stdout, with a request id on every line;
- shuts down on SIGTERM without cutting off a request in flight.

Behind a reverse proxy, forward `X-Forwarded-For` and `X-Forwarded-Proto`; the
app trusts one proxy hop, which is what the per-client rate limit depends on.

If the front end is ever hosted somewhere else, list its origin in
`CORS_ORIGINS`. Same-origin deployments need nothing.

## What is deliberately guarded

- **The model key.** The browser posts a prompt to our own origin and gets
  words back. It never learns which provider answered or what the key is.
- **The workbook paths.** A request may name which configured book it wants —
  `companies` or `overdue` — and nothing else. Only the file name reaches the
  browser, never the path.
- **The error messages.** A failure the server understands is explained in
  words the reader can act on. A failure it does not understand says only that
  something went wrong, and the detail goes to the log under the request id
  printed in the response.
- **The cost.** Model calls are rate limited per client, prompts are capped by
  size and turn count, and a closed tab aborts the call in flight.
- **The credentials and the customers.** Neither is in version control. The
  password hashes, the session secret and the starting-password list live in
  `.crm-auth/`, the whole CRM lives in `.crm-data/store.json`, and every one of
  those paths is in `.gitignore`. Back them up by copying the folders; do not
  commit them.

## Still to do before real users

Two things this layer does not solve, in the order they matter:

1. **The data lives in the browser.** Records are held in `localStorage` per
   machine, which is right for a demonstration and wrong for a team: two people
   do not see the same figures, and clearing site data loses the lot. The
   Supabase schema in `supabase/migrations/` is written and the API layer is
   already split by module; wiring it up is the next piece of work.
2. **There is no real sign-in.** Choosing a user on the login screen is enough
   to become them. Roles are enforced in the front end only, which is a
   convenience, not a control.
