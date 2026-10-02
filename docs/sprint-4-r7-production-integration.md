# TIKKA Sprint 4.R7 — Production integration and legacy retirement

R7 was completed locally only. No deployment, DNS/CDN/Railway change or production database mutation was performed.

## A–C. Final architecture and build

Node remains the only application server. It now serves the single Vite React build in `apps/platform/dist/`; `npm run build` runs `vite build` and then copies only `server.js`, `package.json`, `lib/` and `db/` runtime packaging into that same output. `dist-react/` and the cutover preview adapter were retired. API and authentication logic remain in the source server.

Server precedence is health, API handling, backend authorization, static React assets and four known document aliases. `/`, `/app.html`, `/admin-login.html` and `/admin.html` all resolve the same React document shell. `/public/brand/*` and `/public/hero/*` remain compatibility aliases to the canonical built `/brand/*` and `/hero/*` assets.

## D–F. URL, API and security verification

`node apps/platform/scripts/test-react-cutover.js` passes 39 assertions against the actual `createApp` server and built `dist/` output. It covers direct documents and query/hash URLs, assets, robots/sitemap, encoded traversal rejection, `/health`, `/api/services`, JSON unknown-API 404, login/session separation, CSRF rejection and authorized mutation. The test bundle confirms test credentials and crash markers are absent. React interaction tests continue to pass (37 cases).

The admin document is intentionally not an authorization boundary. Protected admin data remains protected by `/api/admin/*`; React redirects when `/api/admin/me` is unauthorized. Cookies, `credentials: include`, CSRF headers, customer/admin separation, rate limiting and endpoint contracts were not replaced.

## G. Legacy files removed

The obsolete runtime files were deleted from `apps/platform/`:

- `index.html`, `script.js`
- `app.html`, `app.js`
- `admin-login.html`, `admin.html`, `admin.js`
- `forms.js`, `ui.js`

The generated legacy contents under the tracked `apps/platform/dist/` were replaced by the React build; the old copied HTML/JS/CSS/public/data artifacts are no longer recreated by the build script. The Vite shell at `react/index.html` is a different, retained source file.

## H. Retained files and rationale

`apps/platform/styles.css` remains the shared approved design-system stylesheet and is bundled into React. `apps/platform/public/` remains the canonical asset source. `server.js`, `lib/`, `db/`, validation, storage, auth and backend tests remain. React regression scripts and the visual evidence are retained because they provide ongoing release value. `vite.react.config.js` remains the real build/dev configuration; its output is now `dist/`.

## I–J. Scripts and tests

The legacy copy-only build was replaced with React build plus Node-runtime packaging. Typecheck no longer syntax-checks deleted vanilla files. The content test was migrated from legacy markup assertions to React shell/asset/retirement assertions while preserving API, auth, lifecycle, storage and security coverage. No test was removed merely to hide a behavior regression.

Passing checks:

- `npm run build`
- `npm run test:react`
- `node apps/platform/scripts/test-react-cutover.js` — 39 assertions
- `npm run typecheck`
- `npm run lint`
- `npm test` — content/backend/worker tests and PostgreSQL adapter test passed in the available environment
- `git diff --check`

The separate R6.1 visual evidence remains at `artifacts/r6-1/` and recorded 128 React layouts, 32 legacy comparisons and 13 zoom-equivalent layouts before retirement.

## K–M. Assets, SEO and workflow

Vite preserves `lang="en"`, viewport, title, description, canonical and robots metadata, and copies `robots.txt` and `sitemap.xml` into `dist/`. Public body content remains client-rendered; SSR/prerendering was not added. The README now documents React/Vite/React Router, Node production serving, `npm start`, `npm run dev:react` and the real `npm run build` workflow.

## N–Q. Dead code, limitations and rollback

There are no active production imports of the deleted vanilla runtime files. Remaining filename matches are intentional route compatibility strings, tests that assert deleted URLs return 404, React module names such as `src/services/admin.js`, or historical R6.1 documentation. No `dist-react` output or preview adapter remains.

Lighthouse and external deployment verification were not run, as required by scope. PostgreSQL adapter tests pass locally; no production database was touched. Cross-browser and manual toolbar-zoom checks remain deployment smoke-test work.

Rollback is source-control/deployment based: restore the last pre-R7 revision/artifact, including its original `server.js`, legacy frontend files and `dist/`, without rebuilding from memory or changing the database. Verify `/health`, public home, customer session and admin authorization after restoration.

## R–U. Status and verdict

R7-related source/build/test/documentation changes are confined to the React integration, Node static routing, build/test migration and retirement listed above. The repository is **READY FOR PRODUCTION DEPLOYMENT REVIEW**. It has not been deployed, and live traffic has not been switched.
