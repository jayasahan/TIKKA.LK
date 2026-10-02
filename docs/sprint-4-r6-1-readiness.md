# Sprint 4.R6.1 — React production cutover readiness

> Superseded for implementation decisions by [Sprint 4.R7 production integration](sprint-4-r7-production-integration.md). This file remains the historical readiness evidence and pre-cutover plan.

Date: 2026-10-02. Local verification only; production routing and legacy source remain unchanged. No dependencies installed. Existing worktree changes from previous sprints were preserved.

## A. Responsive visual QA

The production Vite output, not isolated page components, is served through an explicit local Node adapter with temporary JSON fixtures. Edge headless renders 16 states at 320, 375, 640, 768, 900, 1024, 1280 and 1440 CSS pixels. States cover public home/hero, services, menus; customer authentication, overview, service form, requests, completed detail and confirmation; admin login, overview, requests, NEW detail, workers, deactivation dialog and menu.

Evidence: `artifacts/r6-1/visual-results.json` and adjacent PNGs. Screenshots use reduced motion to keep hero imagery stable. The measurement pass records document width, controls outside the viewport, failed visible images, dialog dimensions and visible headings. Table-region scrolling is excluded from the control-overflow test, not from document-width measurement.

Final result: **PASS — 128 React layouts, zero measured page-level overflows, zero off-screen non-scrolling controls and zero failed image URLs.** Thirty-two legacy comparison layouts and thirteen zoom-equivalent layouts also completed. The final run used Edge 154.0.4258.48. Intentional filter-region scrolling is excluded like table scrolling. Empty lazy carousel slots without a source are not failed downloads. At 375px the legacy customer pages measure 454px document width; this pre-existing legacy overflow is absent in React and was not changed in legacy code.

Actual cutover defects found and fixed:

- `src/main.jsx` wrapped the application's existing RouterProvider in a second BrowserRouter. The real entry could fail even though individual page tests passed. Removed only the redundant router.
- React admin omitted the operations grid shell. Desktop navigation stacked above the page. `src/pages/AdminPage.jsx` now uses the existing shell, with a small React-only stylesheet for the header's spanning grid placement.
- The admin mobile menu used black ghost-button text on the black header. React-only scoped styling gives the label white text. No legacy stylesheet changed.
- The React operations grid allowed table min-content width to widen the whole Workers page at 320–640px. Explicit zero-minimum grid tracks/main sizing now confine scrolling to table regions; the header title can wrap at 320px without pushing controls outside the page.

This is a fixture-based layout check, not exhaustive validation of every record length, device, browser or screen-reader combination.

## B. Legacy/React screenshot comparison

Equivalent legacy and React fixtures are captured at 375 and 1280 pixels. The legacy server uses the same temporary store and retains its normal authorization/static routing.

| Surface | Classification | Findings |
| --- | --- | --- |
| Public home/hero/services and mobile menu | PARITY | Same branding, image, hierarchy, strong type, rounded actions and service-grid structure. |
| Customer authentication and service form | ACCEPTABLE IMPLEMENTATION DIFFERENCE | Same intent, labeled fields, category selection, time guidance and explicitly unavailable photo input; neutral page background and small heading/card differences. |
| Customer overview | ACCEPTABLE IMPLEMENTATION DIFFERENCE | Summary text/weight and neutral background differ slightly; primary actions and information hierarchy remain intact. |
| Customer requests/detail/progress | ACCEPTABLE IMPLEMENTATION DIFFERENCE | Component/card ordering and selection presentation differ; seven-step lifecycle, details and completion action remain available. |
| Admin login | ACCEPTABLE IMPLEMENTATION DIFFERENCE | Minor card/action spacing; same labeled credentials and primary action. |
| Admin overview/requests/detail | ACCEPTABLE IMPLEMENTATION DIFFERENCE after fixes | Desktop sidebar restored; mobile filters stack; tables stay internally scrollable. React selected rows retain aria-pressed/detail-reference context but have a weaker visual selection highlight than legacy; a non-blocking polish follow-up. |
| Workers | ACCEPTABLE IMPLEMENTATION DIFFERENCE | React puts availability/activation actions in table rows and opens editing from the worker name; legacy places these actions in the worker detail panel. Horizontal table scrolling is intentional. |
| Admin menu | REGRESSION fixed | Low-contrast label corrected in React only. |

Do not treat a few pixels of spacing, font rasterization or timestamp wrapping as redesign requests. Existing aggressive table-cell word wrapping is a usability-polish candidate, not a new React-only defect.

## C. 200% zoom

The automated pass uses a 640 × 450 CSS viewport with device scale 2: the reflow dimensions of a 1280 × 900 display at 200%. It covers public header/menu/actions; customer auth/form/filters/detail/confirmation; admin login/navigation/filters/request actions/workers/deactivation. PNGs are named `zoom-*.png`.

This is zoom-equivalent emulation, not a claim that the browser toolbar was manually set to 200%. Vertical page/dialog scrolling and intentional table/filter scrolling remain acceptable. A manual toolbar-zoom and keyboard-only check on the actual deployment browser is recommended in the R7 release smoke test.

Final result: **PASS — all 13 measured reflow layouts remain horizontally contained; opened dialogs fit the effective viewport.** Screenshot review confirms wrapping/stacking and readable dialog actions. Forms extend below the viewport and remain page-scrollable; table actions remain reachable through their intentionally scrollable region.

## D. Runtime error boundary

Two real React render failures are exercised in `test-react-admin.browser.jsx`: one in the actual AppErrorBoundary and one under a memory router using the actual production route error element. Both produce the safe `AppFailure` UI without the thrown confidential marker or stack in visible content. Both tests pass under StrictMode.

React Router can catch route rendering errors before an outer application boundary, so all four real routes now have the safe error element. The fallback supplies a main landmark and tells the user to refresh. Crash components exist only in the test bundle; there is no production query parameter, environment flag or reachable crash action. Production output is scanned for the crash markers.

## E. 409 / 422 / 500 responses

All 37 React browser interaction checks pass. Additional cases verify contextual conflict and validation feedback, unchanged data after failed mutations and re-enabled retry actions. HTTP 500/503 responses are normalized at the API boundary to a generic temporary-unavailability message, including discarding server field-error payloads. A deliberately malicious 500 response containing database/stack details does not expose those details in UI. Supported 4xx validation payloads remain intact. No backend response model was invented.

## F. Local cutover preview

`apps/platform/scripts/react-cutover-preview.js` is separate from `server.js`. Its CLI requires `--preview-react`, binds only 127.0.0.1:4173 and uses a unique temporary JSON database. Programmatic use requires an explicit test store/database. It is not wired into normal production startup.

Routing precedence is health/API forwarding to the existing backend, followed by approved static assets and exactly four frontend document aliases. Unknown paths return 404, not an SPA catch-all. The preview allows an unauthenticated admin HTML shell; protected data remains backend-authorized, which is explicitly permitted by the cutover architecture.

The current Vite build copies `public/brand` and `public/hero` to `/brand` and `/hero`, while React retains legacy `/public/brand` and `/public/hero` URLs. The adapter explicitly resolves both asset namespaces. R7 must retain this mapping or deliberately standardize asset URLs before release. Vite's generic preview alone is not the API-routing proof.

Run the integrated proof with:

```text
npm.cmd run build:react
node apps/platform/scripts/test-react-cutover.js --visual
```

## G. API precedence

Forty routing/security assertions pass: backend `/health`, `/api/services`; JSON 404 for unknown GET and POST APIs; real test customer/admin login POSTs; missing-CSRF rejection; successful authorized availability POST; customer-session rejection on admin API. Unknown static/document paths and encoded traversal do not return HTML. The normal legacy home and admin-document guard remain unchanged.

## H. Direct routes

Direct HTTP loads resolve `/`, `/app.html`, `/app.html#requests`, `/app.html?service=Plumbing#request`, `/admin-login.html`, `/admin.html` and `/admin.html#requests`. HTTP ignores fragments; the browser matrix separately renders hash-selected views and query-selected Plumbing forms after full document loads. Compiled JS/CSS, both asset URL namespaces, robots and sitemap resolve through the adapter. Old frontend scripts are not served by this preview.

## I. Admin security

The preview's admin shell is public code, not an authorization boundary. Unauthenticated admin data gets 401; customer cookies do not authorize admin; mutations require the existing admin cookie and CSRF token. React's unauthenticated redirect is covered by the browser run. The bundle marker check finds no test credentials, crash triggers or examined server-secret identifiers. This is targeted verification, not a comprehensive secrets/security audit.

## J. SEO

The React production document retains title, description, canonical, robots metadata, `lang="en"` and viewport. `robots.txt` and `sitemap.xml` are copied from existing platform sources and served correctly. Sitemap lists the public home. Public body content is client-rendered: source HTML contains the root container, not complete service copy. SSR/prerendering is deferred.

The shared document currently uses the public title/canonical/robots for portal routes too. Route-specific document identity/indexing policy is a documented follow-up, not solved with new SEO architecture here. The existing JPG brand asset was preserved; the instructed official SVG is absent from this repository and was not invented.

## K. Performance baseline

Lighthouse is not readily installed. No dependency was added, no score/Core Web Vitals number is claimed and no performance optimization was performed.

| Asset | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| JS, `index-BCrlgeZc.js` | 347,739 | 104,316 |
| CSS, `index-DSOGV3PK.css` | 44,805 | 9,083 |
| Eight hero JPGs, total | 6,408,443 | Not measured |
| Brand JPG | 410,213 | Not measured |

Hero JPGs range from 648,867 to 1,052,919 bytes; Plumbing is 817,857 bytes. These are file-size baselines, not a claim that all are downloaded on first paint. Google Fonts remains an external dependency. The approved branded splash remains untouched; hard-duration/resource-failure/CWV measurements belong to Sprint 5.

## L. Exact legacy dependency analysis

| Consumer | Actual dependency |
| --- | --- |
| React `src/main.jsx` | Imports `apps/platform/styles.css`; this source must remain. CSS is bundled into output, not fetched from a legacy stylesheet at runtime. |
| React source | No import of platform `script.js`, `app.js`, `admin.js`, `forms.js` or `ui.js`. `src/services/admin.js` is a different React API module, not legacy admin code. |
| React router, links and redirects | `/app.html`, `/admin-login.html`, `/admin.html` are compatibility URLs, not old HTML-body dependencies. |
| Vite | Uses `react/index.html`; copies public assets plus existing robots/sitemap. Does not compile platform HTML bodies. |
| Built React document | References hashed JS/CSS only, not legacy scripts. |
| Normal backend `server.js` | Still maps `/` to legacy `/index.html`, serves platform static files and guards `/admin.html` and `/admin.js`. This is a real legacy dependency until R7. |
| Legacy `index.html` | Loads `ui.js` and `script.js`. |
| Legacy `app.html` | Loads `ui.js`, `script.js`, `forms.js`, `app.js`. |
| Legacy `admin-login.html` | Loads `forms.js` and its inline login code. |
| Legacy `admin.html` | Loads `forms.js`, `ui.js`, `admin.js`. |
| `scripts/build.js` | Copies all legacy entries/scripts/CSS and backend `server.js`, `lib`, `db`, public/data into `dist`. Must be replaced before removing inputs. |
| Legacy lint/typecheck/content tests | Still read/check legacy files. Must retarget frontend assertions while preserving backend, worker, authorization and lifecycle coverage. |

Do not delete `dist` wholesale and accidentally lose packaged backend files before a replacement release package exists.

## M. Exact proposed R7 plan — not executed

Recommend **B: keep `dist-react/` as the dedicated Node-served frontend build**. It avoids mixing compiled browser output with the legacy dist's copied backend files.

| Item | R7 classification/action |
| --- | --- |
| Platform `index.html` | REMOVE legacy body after Node `/` serves compiled React `index.html`. |
| Platform `script.js` | REMOVE after confirming zero deployed consumers. |
| Platform `app.html` | REPLACE physical legacy body with Node compatibility alias; KEEP `/app.html` URL. |
| Platform `app.js` | REMOVE. |
| Platform `admin-login.html` | REPLACE physical body with Node alias; KEEP URL. |
| Platform `admin.html` | REPLACE physical body with Node alias; KEEP URL. |
| Platform `admin.js` | REMOVE, including obsolete static-file guard; keep API authorization. |
| Platform `forms.js`, `ui.js` | REMOVE once all legacy HTML consumers are removed. |
| Legacy `dist/` | REMOVE from the new release after replacement backend packaging is verified; retain previous deployment artifact as rollback insurance. |
| `dist-react/` | KEEP AS COMPATIBILITY build/output path, served by Node; regenerate per release rather than using stale bundles. |
| `react/index.html`, `src/`, stylesheet, public assets | KEEP PERMANENTLY as maintained frontend sources/assets. |
| `server.js`, `lib/`, `db/`, metadata sources | KEEP PERMANENTLY; modify only the required frontend-serving/build integration. |

Sequence:

1. Save the last-known-good deployment/revision and immutable artifact; inventory current hosting/start command and data locations. No DB migration is required by this frontend cutover.
2. Replace the production static-serving branch with a confined `dist-react` resolver following the tested precedence. Keep every `/api/*` and health route authoritative. Decide explicitly to allow the admin shell while retaining all backend API guards.
3. Add only known entry aliases and static namespaces. Preserve query/hash behavior; keep `/public/brand` and `/public/hero` aliases. Unknown API/static/document paths remain 404.
4. Change the release build/package to build React and ship Node backend sources/dependencies plus `dist-react`. Keep production data/secrets outside rebuildable output. Update package scripts, legacy-dependent lint/typecheck/tests and deployment docs together; keep JSON/worker/API tests intact.
5. Run the current full matrix against the actual new server/package, not only this adapter. Check HEAD/content types, asset paths, direct reloads, customer/admin auth, CSRF, lifecycle actions, errors and metadata.
6. Remove only the inventoried legacy bodies/scripts/dist from the new revision after replacement consumers and tests are verified. Do not remove stylesheet/assets/backend fixtures just because they live under the old platform directory.
7. Deploy a candidate, perform manual keyboard and toolbar-zoom smoke tests, then switch traffic under the normal release procedure. No permanent frontend toggle/dual architecture.

## N. Rollback

Redeploy the previous immutable revision/artifact and its original Node startup/static routing. Preserve the existing database and session configuration; this sprint makes no schema/data migration. Verify health, public home, customer sign-in and admin authorization after rollback. Do not rebuild a deleted legacy tree from memory, retain the old deployment artifact instead. This preview adapter is not a production rollback switch.

## O. Files changed in R6.1

Modified React files: `src/main.jsx`, `src/app/App.jsx`, `src/app/router.jsx`, `src/pages/AdminPage.jsx`, `src/services/api.js`.

New React files: `src/components/AppFailure.jsx`, `src/styles/operations-parity.css`.

Expanded test file: `apps/platform/scripts/test-react-admin.browser.jsx`.

New verification files: `apps/platform/scripts/react-cutover-preview.js`, `test-react-cutover.js`, `test-react-visual.js` in the same scripts directory; this report; screenshot/JSON evidence under `artifacts/r6-1`. React build output regenerated under `dist-react`.

No legacy frontend source, normal server, package manifest or lockfile was edited during R6.1. Existing uncommitted changes in those files predate this step. No dependencies added. Generated evidence contains deliberately fake QA identities, not production/customer records.

## P. Checks

- `npm.cmd run build:react`: PASS, 76 modules.
- `npm.cmd run test:react`: PASS, foundation checks and 37 StrictMode browser tests.
- `npm.cmd run build`: PASS in an isolated copied workspace, avoiding replacement of the existing legacy dist.
- `npm.cmd run typecheck`: PASS. The existing command is JavaScript syntax checking, not full React/TypeScript type analysis; Vite separately compiles JSX.
- `npm.cmd run lint`: PASS under the existing project rules, not a claim of comprehensive React ESLint coverage.
- Legacy content/backend/customer/admin tests and worker-store tests: PASS.
- Aggregate `npm.cmd test`: NOT fully passing in this environment; its PostgreSQL step attempts the configured external DB and fails. No external DB test writes are required or pursued. Separately invoked PostgreSQL test with dotenv/configuration intentionally disabled: SKIPPED, no DATABASE_URL. Do not report this as a database pass.
- Routing/security adapter: PASS, 40 assertions.
- Production-build browser matrix: PASS, 160 layouts (128 React/32 legacy), 13 zoom-equivalent layouts, and unauthenticated admin redirect. Screenshot evidence: 64 comparison PNGs and 13 zoom PNGs.
- New verification scripts: PASS `node --check`.
- `git diff --check`: PASS; Git emits existing line-ending conversion warnings, not whitespace errors.

## Q. Remaining limitations / blockers

No remaining blocker was found in the tested local React cutover scope. PostgreSQL integration and Lighthouse are not certified by this frontend verification; the aggregate test command is explicitly not reported as fully passing. Actual deployment routing remains deliberately unchanged and must be tested in R7. Cross-browser/device, screen-reader and manual toolbar-zoom checks are not claimed.

Minor inherited/follow-up issues are not redesigned here: the logged-out customer header shows a menu toggle despite the menu remaining hidden and exposing no authenticated sections; portal page metadata is shared; operations cells wrap aggressively; React selection highlighting is weaker. Keep these recorded separately from cutover blockers. Some failed/interrupted verification attempts left browser-locked, uniquely named temporary profiles; no user browser profile was deleted. Final screenshot results replace the earlier attempts.

## R. Verdict

**READY FOR R7 CUTOVER** — meaning ready to implement and verify the proposed R7 production integration, not authorization to switch traffic now. The local routing, full-entry rendering, failure-handling and responsive gates pass. Execute the R7 release/package smoke checks and rollback preparations before deployment. Legacy source/build remains rollback insurance; no deletion or production cutover was performed in R6.1.
