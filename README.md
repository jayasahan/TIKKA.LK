# TIKKA

TIKKA is a Sri Lankan handyman and skilled-services outsourcing platform.

The current MVP is a managed operations platform for customers and TIKKA staff. Customers submit service requests, and TIKKA operations schedules jobs and assigns internal workers or teams.

## Repository Layout

- `apps/platform/` - the deployable TIKKA application, including the Node server, React production output, public assets, local data, scripts, and runtime storage directory.
- `src/` - React application source, routed with React Router and bundled by Vite.
- `react/index.html` - the single Vite document shell used for `/`, `/app.html`, `/admin-login.html`, and `/admin.html`.
- `packages/` - reserved for future shared packages. No shared package exists yet.
- `infra/` - reserved for future Docker, cloud, and CI infrastructure.

## Local development

From the repository root(run these):

```powershell
cmd /c npm install
cmd /c npm start

# In a second terminal, for hot-reload React development:
cmd /c npm run dev:react
```

The Node server starts at:

```text
http://localhost:3000
```

Local environment configuration can be placed in a root `.env` file based on `.env.example`.

The Vite development server proxies `/health` and `/api/*` to the Node server. The production-style Node process serves the compiled React output from `apps/platform/dist/` and owns API routing.

## Testing

Run the complete essential suite from the repository root:

```powershell
cmd /c npm test
```

The complete suite includes:

- unit tests for authentication primitives, validation, identifiers, and lifecycle rules;
- JSON storage adapter contract tests;
- HTTP API, authorization, CSRF, ownership, validation, and lifecycle contract tests;
- existing customer/admin/worker integration tests;
- isolated headless-browser React interaction tests;
- PostgreSQL storage adapter tests when `DATABASE_URL` is configured.

Individual layers can be run with:

```powershell
cmd /c npm run test:unit
cmd /c npm run test:api
cmd /c npm run test:integration
cmd /c npm run test:react
cmd /c npm run test:postgres
```

The React layer requires an installed Chromium-based browser. Set `TIKKA_TEST_BROWSER` to its executable when it is not available at one of the test runner's standard paths. PostgreSQL tests create uniquely named test records and remove them after the run; they skip when `DATABASE_URL` is not configured or migrations have not been applied.

## Current Architecture

- Frontend: React, React Router and Vite; one compiled document shell and hashed assets in `apps/platform/dist/`.
- Backend: Node.js HTTP server in `apps/platform/server.js`.
- Authenticated actors: Customer and TIKKA Admin / Operations.
- Operational entity: Worker. Workers are internal records managed manually by TIKKA operations and do not register, log in, or hold passwords.
- Data: JSON-file prototype storage under `apps/platform/storage/`, with PostgreSQL migrations and adapter available for production migration work.
- Configuration: root `.env` loaded with `dotenv`; `.env.example` documents safe placeholders.
- Package management: npm workspaces with the deployable platform app in `apps/platform/`.

## Production Deployment

Railway should run the repository root commands:

```powershell
cmd /c npm install
cmd /c npm run build
cmd /c npm start
```

`npm run build` is the production build: it runs Vite and then adds the Node runtime packaging to `apps/platform/dist/`. `npm run build:react` is retained as a frontend-only development check. Do not run Vite's development server as production hosting.

Required production environment variables:

- `NODE_ENV=production`
- `TIKKA_STORAGE_DRIVER=postgres`
- `DATABASE_URL`
- `TIKKA_ADMIN_EMAIL`
- `TIKKA_ADMIN_PASSWORD`
- `PGSSLMODE=require` when the managed PostgreSQL provider requires SSL
- `TIKKA_LOGIN_LIMIT_WINDOW_MS=900000`
- `TIKKA_LOGIN_LIMIT_MAX_FAILURES=5`
- `PORT` if the hosting platform does not inject one automatically

Production startup fails clearly if `DATABASE_URL`, `TIKKA_ADMIN_EMAIL`, or
`TIKKA_ADMIN_PASSWORD` is absent. Development/test mode may run without admin
credentials for isolated backend tests, but admin authentication is disabled
until those variables are provided.

Before first production startup, run the database setup against the production database:

```powershell
cmd /c npm run db:migrate
cmd /c npm run db:seed
```

The seed command imports service categories idempotently. It does not create fake customers, workers, or admins.

The application exposes a minimal health endpoint:

```text
GET /health
```

It returns only `{ "status": "ok" }` and does not expose database details or secrets.

Login protection is in-memory for the single-instance MVP. The default policy allows five failed attempts per IP bucket and per normalized account identifier within fifteen minutes. Authenticated state-changing customer/admin requests require a session-bound CSRF token sent in the `X-CSRF-Token` header.

After deployment, verify real PostgreSQL connectivity, CDN HTML invalidation,
and hashed static asset loading. Those are environment checks, not build-time
React migration changes.

## CI/CD

GitHub Actions configuration is provided in `.github/workflows/ci-cd.yml`.
Pull requests and pushes to `main` run the complete verification suite against
an isolated PostgreSQL service, build the production artifact, and verify the
production routing contract. Successful pushes to `main` can deploy to the
protected GitHub `production` environment on Railway.

Deployment is inactive until the required GitHub environment secret and
variables are configured. See `docs/ci-cd.md` for Railway settings, secret and
variable names, branch protection, health checks, and rollback instructions.
