# TIKKA CI/CD setup

The workflow at `.github/workflows/ci-cd.yml` provides the essential continuous-integration and Railway production-deployment path.

## Pipeline behavior

Pull requests targeting `main` and pushes to `main` run the `Verify` job. Manual runs can be started from GitHub Actions.

Verification performs:

1. locked dependency installation with `npm ci` on the Node version in `.nvmrc`;
2. a high/critical production-dependency vulnerability gate;
3. type checking and linting;
4. migrations and seed data against an isolated PostgreSQL service container;
5. the complete unit, API, integration, React browser, and PostgreSQL test suite;
6. the production build;
7. production routing/artifact boundary checks;
8. upload of the resulting `apps/platform/dist/` artifact for seven days.

Only a successful push to `main` can enter the `Deploy production` job. Pull requests, forks, manual workflow runs, and failed verification jobs cannot deploy. Production deployments are serialized to avoid two releases being applied concurrently.

## GitHub repository setup

Create a GitHub Environment named `production`. Configure required reviewers for that environment if production releases need manual approval.

Add these values to the `production` environment:

| Type | Name | Value |
| --- | --- | --- |
| Secret | `RAILWAY_TOKEN` | A Railway project token scoped to the production environment. Do not use a personal/account token. |
| Variable | `RAILWAY_PROJECT_ID` | The Railway project ID. |
| Variable | `RAILWAY_SERVICE_ID` | The web service ID or unambiguous service name. |
| Variable | `PRODUCTION_URL` | The canonical HTTPS origin, without a trailing path, for example `https://tikka.example`. |

Recommended `main` branch protection:

- require a pull request before merging;
- require at least one approving review;
- require the `CI/CD / Verify` status check;
- require branches to be current before merging;
- dismiss stale approvals when code changes;
- block force pushes and branch deletion;
- restrict direct pushes to trusted maintainers.

Do not enable Railway's GitHub automatic deployment for the same service when this workflow owns deployment. Running both creates duplicate, unordered releases.

## Railway service setup

Set the Railway service root directory to the repository root. Configure:

| Setting | Required value |
| --- | --- |
| Build command | `npm run build` |
| Pre-deploy command | `npm run db:migrate && npm run db:seed` |
| Pre-deploy timeout | `300` seconds initially; adjust only from observed migration duration. |
| Start command | `npm start` |
| Health-check path | `/health` |
| Health-check timeout | `300` seconds |
| Restart policy | On failure |

The pre-deploy command runs inside Railway's private environment. A migration or seed failure must stop the deployment before the new release receives traffic.

Required Railway production variables remain:

- `NODE_ENV=production`;
- `TIKKA_STORAGE_DRIVER=postgres`;
- `DATABASE_URL` using the private PostgreSQL service reference;
- `TIKKA_ADMIN_EMAIL`;
- `TIKKA_ADMIN_PASSWORD`;
- the provider-appropriate PostgreSQL TLS configuration;
- `TIKKA_LOGIN_LIMIT_WINDOW_MS=900000`;
- `TIKKA_LOGIN_LIMIT_MAX_FAILURES=5`.

Railway supplies `PORT`; do not hardcode it. Review the security limitations and release blockers in `READMEabout.md` before enabling public production traffic.

## Deployment and rollback

The workflow installs Railway CLI `5.63.1` and runs `railway up --ci` against the explicit production project, environment, and service. Railway builds the verified `main` source and reports failure to GitHub if build, pre-deploy, startup, or configured health checks fail.

After Railway reports success, GitHub checks `PRODUCTION_URL/health` for `{ "status": "ok" }`. This confirms basic reachability only; it is not a database-readiness check.

For rollback, select the last known-good deployment in Railway and redeploy it. Database migrations must be backward compatible with the previously deployed application. Destructive schema changes require a separate reviewed expand/migrate/contract plan and must not be bundled into an ordinary release.

## Dependency maintenance

Dependabot checks npm dependencies and GitHub Actions weekly. Its pull requests go through the same verification pipeline and cannot deploy until reviewed and merged.
