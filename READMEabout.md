# TIKKA Application Process and Request-Flow Map

This document maps the application as implemented in the repository on 2026-10-05. It is intended to be the baseline for later security hardening and application improvements.

It describes observed code paths, not an intended future architecture. No environment-secret values were inspected. Generated assets, screenshots, and `node_modules` are not part of the behavioral analysis.

## 1. Executive summary

TIKKA is currently one deployable application with:

- a React 19 single-page frontend built by Vite;
- a custom Node.js HTTP server with hand-written routing;
- same-origin JSON APIs under `/api/*`;
- cookie-based customer and admin sessions held in server memory;
- session-bound CSRF tokens for authenticated state-changing calls;
- a storage adapter that selects a JSON file in development or PostgreSQL in production;
- customer and TIKKA operations/admin experiences;
- workers as admin-managed records, not authenticated application users.

The implemented operational flow is:

```text
Public visitor
  -> Customer registration or login
  -> Customer submits a service request (NEW)
  -> Admin starts review (REVIEWING)
  -> Admin schedules the job (SCHEDULED)
  -> Admin assigns an active worker (ASSIGNED)
  -> Admin starts the job (IN_PROGRESS)
  -> Admin marks it complete (COMPLETED)
  -> Customer confirms completion (CONFIRMED)
  -> Customer submits one review
  -> Admin may hide or restore that review
```

There is no worker/provider login or worker-facing job workflow in the current application. The admin performs all operational state changes, including starting and completing jobs.

## 2. Repository map

| Path | Responsibility |
| --- | --- |
| `src/` | React source: routes, pages, components, client services, auth contexts, and UI status helpers. |
| `react/index.html` | The only Vite HTML entry document. |
| `apps/platform/server.js` | Node HTTP server, API router, auth enforcement, response shaping, static-file serving, and process startup/shutdown. |
| `apps/platform/lib/auth.js` | Password hashing, in-memory sessions, cookie creation/parsing. |
| `apps/platform/lib/validation.js` | Server-side input normalization and validation. |
| `apps/platform/lib/constants.js` | Job statuses and allowed admin transitions. |
| `apps/platform/lib/storage.js` | Selects the JSON or PostgreSQL storage implementation. |
| `apps/platform/lib/json-store.js` | Development/prototype persistence and business mutations over a JSON snapshot. |
| `apps/platform/lib/postgres-store.js` | PostgreSQL queries, transactions, row mapping, and business mutations. |
| `apps/platform/lib/db.js` | JSON database creation, seed categories, IDs, and request references. |
| `apps/platform/lib/postgres.js` | PostgreSQL pool and SSL configuration. |
| `apps/platform/db/migrations/` | Relational schema and migrations. |
| `apps/platform/data/services.json` | Initial service-category catalog. |
| `apps/platform/vite.react.config.js` | Frontend build and development proxy configuration. |
| `apps/platform/scripts/` | Build, tests, lint/type syntax checks, database migration, and seed scripts. |
| `apps/platform/public/` | Brand and hero image sources copied into the frontend build. |
| `apps/platform/dist/` | Generated production output; not committed in the scanned tree. |
| `docs/` | Existing sprint/readiness documentation. |
| `artifacts/` | Test and visual-comparison artifacts; not runtime application logic. |
| `infra/`, `packages/` | Reserved placeholders; no active runtime implementation. |

## 3. Runtime architecture

```text
Browser
  |
  | GET page/static asset
  | JSON fetch with credentials: include
  v
Node HTTP server (`apps/platform/server.js`)
  |-- `/health` --------------------------> fixed health JSON
  |-- `/api/*` ---------------------------> hand-written API dispatcher
  |     |-- input validation
  |     |-- customer/admin session checks
  |     |-- CSRF check on unsafe authenticated methods
  |     `-- response sanitization/shaping
  |
  `-- other known frontend/static paths --> `apps/platform/dist/`
                                                ^
                                                |
                                      Vite production build

API dispatcher
  -> storage interface
       |-- JSON store -> `apps/platform/storage/tikka-db.json`
       `-- PostgreSQL store -> `DATABASE_URL`
```

### 3.1 Production process

The root workspace delegates to `apps/platform`. `npm run build` runs the Vite frontend build and then copies the Node runtime files into `apps/platform/dist/`. `npm start` runs `apps/platform/server.js`.

At startup the server:

1. Loads the root `.env` through `dotenv`.
2. Chooses `postgres` by default in production and `json` otherwise, unless `TIKKA_STORAGE_DRIVER` overrides it.
3. Creates the selected storage adapter.
4. Requires configured admin credentials in production.
5. Creates or refreshes the configured admin representation in the selected store.
6. Starts listening only after admin setup completes.
7. Closes the PostgreSQL pool on `SIGTERM` or `SIGINT`.

The health endpoint is handled before the startup readiness promise is awaited and returns only `{ "status": "ok" }`.

### 3.2 Development process

- The Node API/static server defaults to port 3000.
- Vite runs separately for hot reload.
- Vite proxies `/api` and `/health` to `http://localhost:3000`.
- The development storage driver defaults to the JSON file store.

## 4. Frontend page and routing map

React Router serves one compiled document shell for all application pages.

| Browser path | React page | Purpose |
| --- | --- | --- |
| `/` | `PublicPage` | Marketing site and links into the customer request flow. |
| `/app.html` | `CustomerPage` | Customer authentication, request submission, tracking, confirmation, and review. |
| `/admin-login.html` | `AdminLoginPage` | Admin credential submission. |
| `/admin.html` | `AdminPage` | Authenticated operations dashboard. |
| Any unmatched React route | Redirect to `/` | Client-side fallback. |

The Node server recognizes exactly the four frontend entry paths above and maps each to `dist/index.html`. It does not use HTML access as an authorization boundary; authorization occurs at API endpoints.

Customer and admin sub-navigation uses URL hashes rather than additional server routes:

- customer: `#overview`, `#request`, `#requests`, `#profile`;
- admin: `#overview`, `#requests`, `#workers`, `#customers`, `#reviews`, `#categories`.

An optional customer query parameter, `?service=<name>`, preselects a service in the request experience.

## 5. Browser-to-backend request pipeline

All frontend API modules call the shared `apiFetch` function.

For each browser API call:

1. The frontend sets `Accept: application/json`.
2. Non-`FormData` bodies are JSON-stringified and receive `Content-Type: application/json`.
3. The current in-memory frontend CSRF token is added as `X-CSRF-Token` for methods other than `GET` and `HEAD`.
4. `fetch` uses `credentials: "include"`, so same-origin session cookies are sent and `Set-Cookie` is honored.
5. The response body is read as text and parsed as JSON when possible.
6. Any `csrfToken` in a successful response replaces the frontend module's token.
7. Non-2xx responses become `ApiError` objects. For 5xx responses, detailed response content is deliberately replaced with a generic UI message.

On the server:

1. The request URL is parsed using the incoming `Host` header as the base.
2. `/health` is handled directly.
3. `/api/*` enters the API dispatcher.
4. Other paths enter static-file handling.
5. API handlers read JSON bodies, validate fields, authorize the actor, invoke the store, sanitize output, and return JSON.
6. Unmatched API routes return 404 JSON.
7. Exceptions inside the API dispatcher are logged and currently returned as status 400 with the exception message.

The JSON body reader rejects a body after its accumulated string length exceeds 1,000,000 characters. There is no multipart upload pipeline.

## 6. Authentication, sessions, and CSRF flow

### 6.1 Passwords

- Customer passwords and the configured admin password are hashed with PBKDF2-HMAC-SHA256.
- Each hash uses a random 16-byte salt, 120,000 iterations, and a 32-byte derived key.
- The stored format is `<hex salt>:<hex hash>`.
- Verification uses `crypto.timingSafeEqual` for the derived hashes.

### 6.2 Customer session

1. Registration or login succeeds.
2. The server creates a random 24-byte session ID and random 32-byte CSRF token.
3. The session is stored in a process-local `Map` with `customerId`, token, and creation timestamp.
4. The session ID is returned in the `tikka_session` cookie.
5. The response JSON returns the sanitized customer and CSRF token.
6. `CustomerAuthContext` calls `GET /api/auth/me` at page startup to restore the authenticated UI state and CSRF token.

### 6.3 Admin session

The admin flow is equivalent but uses `adminId`, `tikka_admin_session`, and `/api/admin/me`. Admin identity is configured from `TIKKA_ADMIN_EMAIL` and `TIKKA_ADMIN_PASSWORD`; there is no admin-registration endpoint.

### 6.4 Cookie properties

Both cookies are:

- `HttpOnly`;
- `SameSite=Lax`;
- scoped to `Path=/`;
- issued with `Max-Age=604800` (seven days);
- marked `Secure` only when `NODE_ENV === "production"`.

### 6.5 Authenticated request enforcement

`requireCustomer` and `requireAdmin`:

1. read the appropriate cookie;
2. find its session in process memory;
3. for `POST`, `PUT`, `PATCH`, and `DELETE`, compare the request CSRF header with the session token using a timing-safe comparison;
4. load the actor from storage;
5. reject missing or stale authentication with 401, missing admin configuration with 503, and invalid CSRF with 403.

Logout also checks CSRF when a session exists, deletes the server-side session, and expires the cookie.

### 6.6 Login throttling

Customer registration, customer login, and admin login maintain separate in-memory failure buckets. Each attempt is keyed by both:

- the client IP, derived first from the first `X-Forwarded-For` value and otherwise the socket address; and
- the normalized account email.

Defaults are five failures within fifteen minutes. Successful authentication clears the relevant buckets. State is local to one Node process.

## 7. Public and customer processes

### 7.1 Browse service categories

```text
Customer page loads
  -> GET /api/services
  -> store.listCategories({ enabledOnly: true })
  -> sanitized category list
  -> request form/service UI
```

This endpoint is public. Only enabled categories are returned.

### 7.2 Register a customer

```text
Registration form
  -> POST /api/auth/register
  -> registration rate-limit check
  -> validate name, phone, email, password
  -> hash password
  -> create customer (unique email)
  -> create in-memory session + CSRF token
  -> Set-Cookie + 201 response
  -> authenticated customer UI
```

Server validation includes name, phone, email, and a password of at least eight characters. A duplicate email returns 409.

### 7.3 Log in a customer

```text
Login form
  -> POST /api/auth/login
  -> login rate-limit check
  -> normalize email
  -> load customer by email
  -> verify PBKDF2 hash
  -> create session + CSRF token
  -> Set-Cookie + response
  -> authenticated customer UI
```

Invalid credentials return one generic message.

### 7.4 Create a service request

```text
Authenticated request form
  -> POST /api/requests + customer cookie + CSRF header
  -> requireCustomer
  -> load all categories
  -> validate submitted fields and enabled service name
  -> store.createRequest
  -> generate internal ID and public-style reference
  -> persist status NEW
  -> shape customer-safe response
  -> refresh customer's request list
```

Submitted fields are:

- service category;
- title;
- description;
- customer/contact name;
- phone;
- email;
- service address/location;
- preferred date;
- preferred time;
- up to six photo strings.

Important implementation detail: the current frontend converts selected photo files to their file names only. The server accepts an array of strings and stores those names. Image bytes are not uploaded or stored.

The request reference format is `TIKKA-YYYYMMDD-<6 random uppercase hex characters>`.

### 7.5 List and view customer requests

- `GET /api/requests` loads only rows whose `customerId` matches the authenticated customer.
- `GET /api/requests/:id` also requires both the request ID and authenticated customer ID to match.
- Customer responses include request details, schedule, sanitized assigned worker, and a public review projection.
- Customer responses do not include admin identity, raw customer records, password hashes, or moderation history.

### 7.6 Confirm completion

```text
Customer views own request in COMPLETED
  -> POST /api/requests/:id/confirm + CSRF
  -> ownership check
  -> status must be COMPLETED
  -> status becomes CONFIRMED
  -> confirmation timestamp stored
  -> refreshed request returned
```

### 7.7 Submit a review

```text
Customer views own request in CONFIRMED
  -> POST /api/requests/:id/review + CSRF
  -> validate rating 1..5 and comment <= 600 characters
  -> ownership and CONFIRMED-status checks
  -> enforce one review per request
  -> persist customer and assigned-worker links
  -> 201 response
```

The customer UI displays the submitted review after the request list is refreshed.

## 8. Admin/operations processes

### 8.1 Admin login and dashboard bootstrap

```text
Admin login form
  -> POST /api/admin/login
  -> configured-credentials check
  -> rate-limit check
  -> validate email/password presence
  -> email must equal configured admin email
  -> verify configured admin hash in store/runtime
  -> create admin session + CSRF token
  -> redirect to /admin.html

/admin.html loads
  -> GET /api/admin/me
  -> redirect back to login if unauthorized
  -> six parallel GETs:
       dashboard, requests, workers,
       customers, categories, reviews
  -> render operations areas
```

All admin data and mutation endpoints require the admin session. All admin mutations also require its CSRF token.

### 8.2 Review and search requests

`GET /api/admin/requests` supports:

- exact `status` filtering;
- case-insensitive free-text `q` search across reference, title, service, status, customer name, email, phone, and address.

Each admin request projection adds customer/contact details, photo-name strings, assignment information, and review/moderation data.

### 8.3 Schedule a request

The expected path is:

1. Admin changes `NEW` to `REVIEWING` through the status endpoint.
2. From `REVIEWING`, admin submits a future date/time to `/schedule`.
3. The store records `scheduledAt` and changes `REVIEWING` to `SCHEDULED`.
4. A `SCHEDULED` or `ASSIGNED` request can be rescheduled without another status change.

The frontend converts the browser `datetime-local` value to an ISO timestamp before sending it. Server validation rejects an invalid or non-future time.

### 8.4 Assign a worker

```text
SCHEDULED request + selected worker
  -> POST /api/admin/requests/:id/assign-worker
  -> require admin + CSRF
  -> worker ID required
  -> request must be SCHEDULED
  -> worker must exist and be active
  -> set assigned worker/admin/time
  -> status becomes ASSIGNED
```

The implementation checks worker `active` state, but does not require `availabilityStatus === AVAILABLE`, a matching skill, matching category, or matching service area.

### 8.5 Advance or close a job

The general status endpoint is `POST /api/admin/requests/:id/status`. The equivalent `/api/operator/requests/:id/status` path is also accepted by the backend, although the React client uses the admin path.

The server validates both that the target is a known status and that it is allowed from the current status. Setting `ASSIGNED` through this endpoint additionally requires an existing assigned worker, but the normal UI assigns via the dedicated assignment endpoint.

### 8.6 Manage workers

Workers are internal operational records. Admins can:

- list or get a worker;
- create and update name, phone, service area, notes, skills, and services;
- toggle active/inactive state;
- change availability status.

Workers do not have credentials, sessions, or API routes of their own. Assignment does not notify a worker inside this application.

### 8.7 Manage categories

Admins can list, create, and update categories. The backend also exposes a category toggle endpoint, although the current React category form updates the `enabled` property through the general update endpoint.

Only enabled categories appear in the public/customer service list and pass request validation.

### 8.8 Review moderation

Admins can list reviews and post `hide` or `restore` actions. Each action changes the review's `hidden` flag and appends a moderation event containing action, optional note, admin ID, and time.

The customer's own request response currently includes its review whether or not it is hidden. There is no separate public reviews feed in the scanned application.

## 9. Job state machine

The implemented normal path is:

```text
NEW -> REVIEWING -> SCHEDULED -> ASSIGNED -> IN_PROGRESS -> COMPLETED -> CONFIRMED
```

Allowed admin transitions are:

| Current status | Allowed admin target(s) | How the normal forward move occurs |
| --- | --- | --- |
| `NEW` | `REVIEWING`, `CANCELLED`, `REJECTED` | Status endpoint. |
| `REVIEWING` | `CANCELLED`, `REJECTED` | Scheduling endpoint creates `SCHEDULED`; this is not a general status transition. |
| `SCHEDULED` | `CANCELLED`, `REJECTED` | Assignment endpoint creates `ASSIGNED`; this is not a general status transition. |
| `ASSIGNED` | `IN_PROGRESS`, `CANCELLED`, `REJECTED` | Status endpoint. |
| `IN_PROGRESS` | `COMPLETED`, `CANCELLED` | Status endpoint. |
| `COMPLETED` | none for admin | Customer confirmation endpoint creates `CONFIRMED`. |
| `CONFIRMED` | none | Terminal. |
| `CANCELLED` | none | Terminal. |
| `REJECTED` | none | Terminal. |

The code does not implement `ACCEPTED`, even though it remains in the original migration's historical status list. Migration 003 adds `SCHEDULED`; runtime constants and the UI omit `ACCEPTED`.

## 10. API inventory

Legend: Public = no session; Customer/Admin = matching session required; CSRF = required for an authenticated unsafe method.

### 10.1 Public and authentication endpoints

| Method and path | Access | Main result |
| --- | --- | --- |
| `GET /health` | Public | `{ status: "ok" }`. |
| `GET /api/services` | Public | Enabled service categories. |
| `POST /api/auth/register` | Public, rate-limited | Creates customer and session. |
| `POST /api/auth/login` | Public, rate-limited | Creates customer session. |
| `POST /api/auth/logout` | Session optional; CSRF if session exists | Deletes session and expires customer cookie. |
| `GET /api/auth/me` | Customer | Sanitized customer and CSRF token. |
| `POST /api/admin/login` | Public, configured admin only, rate-limited | Creates admin session. |
| `POST /api/admin/logout` | Session optional; CSRF if session exists | Deletes session and expires admin cookie. |
| `GET /api/admin/me` | Admin | Sanitized admin and CSRF token. |

### 10.2 Customer request endpoints

| Method and path | Access | Main result |
| --- | --- | --- |
| `POST /api/requests` | Customer + CSRF | Creates a `NEW` request. |
| `GET /api/requests` | Customer | Lists only the customer's requests. |
| `GET /api/requests/:id` | Customer/owner | Gets one owned request. |
| `POST /api/requests/:id/confirm` | Customer/owner + CSRF | `COMPLETED` to `CONFIRMED`. |
| `POST /api/requests/:id/review` | Customer/owner + CSRF | Creates one review after confirmation. |

### 10.3 Admin request and dashboard endpoints

| Method and path | Access | Main result |
| --- | --- | --- |
| `GET /api/admin/dashboard` | Admin | Aggregate operational metrics. |
| `GET /api/admin/customers` | Admin | Sanitized customer list. |
| `GET /api/admin/requests` | Admin | Filterable full request list. |
| `GET /api/admin/requests/:id` | Admin | One full operational request. |
| `POST /api/admin/requests/:id/schedule` | Admin + CSRF | Sets schedule; may create `SCHEDULED`. |
| `POST /api/admin/requests/:id/assign-worker` | Admin + CSRF | Assigns active worker and creates `ASSIGNED`. |
| `POST /api/admin/requests/:id/status` | Admin + CSRF | Applies an allowed status transition. |
| `POST /api/operator/requests/:id/status` | Admin + CSRF | Alias of admin status endpoint. |

### 10.4 Admin worker, category, and review endpoints

| Method and path | Access | Main result |
| --- | --- | --- |
| `GET /api/admin/workers` | Admin | Lists workers. |
| `GET /api/admin/workers/:id` | Admin | Gets worker. |
| `POST /api/admin/workers` | Admin + CSRF | Creates worker. |
| `POST /api/admin/workers/:id` | Admin + CSRF | Updates worker. |
| `POST /api/admin/workers/:id/toggle-active` | Admin + CSRF | Toggles active state. |
| `POST /api/admin/workers/:id/availability` | Admin + CSRF | Sets availability string. |
| `GET /api/admin/categories` | Admin | Lists all categories. |
| `POST /api/admin/categories` | Admin + CSRF | Creates category. |
| `POST /api/admin/categories/:id` | Admin + CSRF | Updates category. |
| `POST /api/admin/categories/:id/toggle` | Admin + CSRF | Toggles enabled state. |
| `GET /api/admin/reviews` | Admin | Lists reviews with moderation history. |
| `POST /api/admin/reviews/:id/moderate` | Admin + CSRF | Hides or restores review. |

There are no `PUT`, `PATCH`, or `DELETE` routes despite support for those methods in the shared client and CSRF helper.

## 11. Data model and relationships

### 11.1 Active application entities

```text
Customer 1 ---- * ServiceRequest * ---- 0..1 Worker
                         |
                         | 1
                         |
                       0..1 Review
                         |
                         `---- * ReviewModerationEvent

ServiceCategory 1 ---- * ServiceRequest
ServiceCategory * ---- * Worker (through worker_services)
Worker 1 ----------- * WorkerSkill
```

### 11.2 Customer

Stores ID, name, phone, normalized email, password hash, and timestamps. Email is unique in PostgreSQL and checked for duplicates in JSON storage.

### 11.3 Service request

Stores identity/reference, customer relationship, service category and name snapshot, description/contact/location/preference data, status, legacy provider relationship, worker assignment, schedule, operational actor/time fields, and lifecycle timestamps.

Photo metadata is stored separately in PostgreSQL and inline as strings in JSON.

### 11.4 Worker

Stores contact and service-area information, free-form notes, active state, availability, rating, completed-job counter, skills, and category relationships. The application does not automatically change availability or completed-job count as jobs progress.

### 11.5 Review

Stores a unique request relationship, customer, optional legacy provider, optional worker, rating, comment, hidden flag, and timestamps. Moderation events are separate PostgreSQL rows and inline arrays in JSON.

### 11.6 Legacy provider schema

PostgreSQL migration 001 contains provider, provider-skill, and provider-service tables and an `ACCEPTED` request status. Migration 002 introduces workers and copies existing provider data/relationships into the worker domain. Current APIs and UI use workers, not providers. Provider registration, verification, login, acceptance, and job handling are not implemented in the current runtime.

## 12. JSON and PostgreSQL behavior

### 12.1 JSON store

- Default outside production.
- Uses synchronous whole-file reads and writes.
- Creates and seeds a database snapshot when missing.
- Stores the configured admin record and its password hash in the JSON database.
- Has no cross-process locking or transactional isolation.
- Returns request lists in stored insertion order.

### 12.2 PostgreSQL store

- Default in production.
- Requires `DATABASE_URL`.
- Uses parameterized queries through `pg`.
- Uses explicit transactions for multi-table operations such as request/photo creation, worker creation, review creation, and moderation.
- Maps database snake_case rows to the application's camelCase objects.
- Keeps the configured admin only in the running `PostgresStore` instance; there is no admins table in the migrations.
- Orders requests by newest submission and reviews by newest submission.

### 12.3 Intentional adapter contract

The server depends on the same conceptual methods from either adapter: actor lookup, category CRUD, customer creation/listing, worker management, request lifecycle mutations, review operations, and dashboard metrics.

### 12.4 Observable adapter differences relevant to future review

- JSON mutations are whole-file read/modify/write operations; PostgreSQL uses row queries and selected transactions.
- PostgreSQL enforces several relationships, uniqueness rules, and check constraints at the database layer; JSON relies on application logic.
- PostgreSQL `confirmRequest` itself requires current status `COMPLETED`; JSON `confirmRequest` does not repeat that status check and relies on the server handler's prior check.
- PostgreSQL review creation itself requires `CONFIRMED`; JSON review creation relies on the server handler's prior check.
- Worker service/skill replacement behavior is not fully symmetric: PostgreSQL worker update changes core worker fields but does not update skill/service link tables, while JSON update can replace the arrays.
- PostgreSQL records `updated_at` for many mutations; JSON does so inconsistently across request status/confirmation/review actions.

## 13. Response-data boundaries

The server deliberately shapes records before returning them:

- customer output omits `passwordHash`;
- admin output omits `passwordHash`;
- customer request output includes only a sanitized assigned worker;
- admin request output adds customer/contact, assignment/admin, photo-name, and moderation context;
- customer-facing review output includes rating, comment, and submission time only;
- admin review output includes IDs, hidden status, and moderation history.

The frontend renders ordinary React text nodes for user-entered data; no `dangerouslySetInnerHTML` usage was found in the scanned React source.

## 14. Current security controls

This is an inventory, not a claim of complete security.

- PBKDF2 password hashing with per-password random salt.
- Timing-safe hash and CSRF-token comparisons.
- HttpOnly, SameSite cookies; Secure cookies in production mode.
- Separate customer and admin cookie names and actor checks.
- Server-side authorization on every protected API route.
- Ownership checks for customer request reads, confirmation, and review.
- Session-bound CSRF headers for authenticated unsafe methods.
- Generic invalid-credential responses.
- Failure throttling for registration and login by IP and normalized identifier.
- Server-side validation and normalization for major customer/admin forms.
- Parameterized PostgreSQL queries.
- Transaction use for selected multi-step database operations.
- Output sanitization/projection rather than returning storage records directly.
- Static path resolution checks intended to prevent escaping the build directory.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Frame-Options: SAMEORIGIN` on server responses.
- Generic frontend messages for HTTP 5xx failures.
- Production startup failure when database or admin configuration is absent.

## 15. Hardening and improvement review inventory

The following items are observed boundaries or gaps to investigate in a dedicated security phase. They are not fixes made by this documentation task.

### 15.1 Session and authentication lifecycle

- Sessions are process-local, are lost on restart, and do not work across multiple instances.
- Server-side sessions have creation timestamps but no expiry enforcement or cleanup; cookie expiry alone does not remove the map entry.
- Password policy is only a minimum length of eight characters.
- No password reset, email verification, MFA, session listing/revocation, or credential-change flow exists.
- Admin identity is a single environment-configured account; PostgreSQL keeps it only in memory.
- Rate-limit counters are per process and reset on restart.
- `X-Forwarded-For` is trusted directly for rate-limit identity; deployment proxy trust rules should be defined.

### 15.2 HTTP and browser protections

- No Content Security Policy was found.
- No HSTS header was found.
- No explicit Permissions Policy was found.
- No explicit cache policy was found for authenticated JSON or the shared HTML shell.
- No explicit CORS headers are set; the intended model is same-origin.
- Host-header and reverse-proxy assumptions should be documented for production.
- Cookie prefixes and narrower cookie paths/domains are not used.

### 15.3 Input handling and API error behavior

- Worker update and availability endpoints do not use a dedicated validator; arbitrary availability strings can reach JSON storage, while PostgreSQL relies on its check constraint.
- Worker skills/services and several worker text fields do not have explicit server length/count limits.
- Admin request `status` query filtering is not validated against the status allowlist before storage access.
- The API catch-all logs an error and returns status 400 with `error.message`, including for unexpected internal or database errors; error classification and disclosure should be reviewed.
- Body size is tracked as JavaScript string length rather than raw byte count, and the request stream is not explicitly destroyed after rejection.
- Content type is not checked before parsing JSON.
- No request ID/correlation ID or structured audit event system was found.

### 15.4 Business authorization and workflow integrity

- There is one admin role; no granular authorization or separation of duties exists.
- The backend accepts an undocumented `/api/operator/.../status` alias using the same admin authorization.
- Worker assignment checks only active state, not availability, skills, category, or area.
- Worker update behavior differs between JSON and PostgreSQL for skills/services.
- Worker completed-job count and availability are not automatically synchronized with job transitions.
- Most state changes do not persist a complete immutable audit trail. Assignment, cancellation, and review moderation capture some actor/time data; other transitions do not.
- JSON state precondition checks are less defensive than PostgreSQL for confirmation/review and rely on the server handler sequence.
- Concurrent updates can race between the server's read/check and mutation, especially in JSON storage and in the general status update query.

### 15.5 Data and privacy

- Customer contact data, service addresses, request descriptions, and review content are visible to the single admin role.
- Data retention, deletion, export, consent, and privacy policies are not represented in code.
- JSON storage contains credentials and personal data in one local file without application-level encryption.
- Database backup, restore, key/secret rotation, and at-rest encryption procedures are outside this repository.
- Request photo selection stores filenames only, but filenames themselves may contain sensitive information.
- Review `hidden` status does not suppress the review in the owning customer's request response.

### 15.6 Operations and resilience

- The health endpoint reports process reachability, not storage readiness.
- No readiness endpoint, metrics export, tracing, centralized logging, or alert integration was found.
- JSON storage has no file locking, atomic replacement, or multi-process safety.
- There is no background queue, retry mechanism, notification delivery, or idempotency-key support.
- The build packages runtime source beneath `dist`; deployment layout and dependency installation need to match that design.
- Static files have no explicit fingerprint-aware cache headers in the Node server.

### 15.7 Schema and domain consistency

- Repository product rules describe a lifecycle without `SCHEDULED`, while current runtime and migration 003 require it.
- The initial schema includes `ACCEPTED`, but runtime state handling omits it.
- Legacy provider tables and columns remain alongside the active worker model.
- Several lifecycle timestamps exist in PostgreSQL, but the general status update currently sets only status, cancellation fields, and `updated_at`; for example, `completed_at` is not set when changing to `COMPLETED`.
- JSON and PostgreSQL adapters should be contract-tested for identical validation, mutation, ordering, and returned shapes.

## 16. Validation summary

| Input | Main server rules |
| --- | --- |
| Customer registration | Name <= 120, phone <= 30 and phone pattern, valid normalized email, password >= 8. |
| Login | Email and password must be present; email normalized to lowercase. |
| Service request | Enabled known category; title <= 140; description <= 1200; contact name <= 120; phone pattern; valid email; address <= 400; preferred date/time required; at most six nonempty photo strings. |
| Scheduling | Required parseable date/time strictly later than server `Date.now()`. |
| Status | Must be in the runtime `JOB_STATUSES` allowlist, then pass transition rules. |
| Review | Integer rating 1-5; required comment <= 600. |
| Category | Name <= 80; optional uppercase alphanumeric code length 2-8; description <= 240. |
| Moderation | Action must be `hide` or `restore`; note truncated to 400 characters. |
| Worker create | Only nonempty trimmed name and phone are explicitly checked in the route. |
| Worker update/availability | No dedicated route-level schema validator. |

Browser-native validation exists for many forms, but the server is the authoritative validation boundary.

## 17. Operational metrics

The backend dashboard computes:

- total customers;
- total workers;
- active workers;
- `NEW` requests;
- active jobs (`REVIEWING`, `SCHEDULED`, `ASSIGNED`, `IN_PROGRESS`);
- completed jobs (`COMPLETED`, `CONFIRMED`);
- cancelled jobs.

The current React overview also derives its visible metric cards from the loaded request and worker collections rather than relying only on the returned backend metrics.

## 18. Important non-features and external boundaries

No implementation was found for:

- online payments;
- automated or AI matching;
- real-time GPS;
- real-time chat;
- worker/provider authentication or portal;
- native mobile applications;
- email/SMS/push notifications;
- actual photo upload or object storage;
- customer profile editing;
- customer cancellation;
- provider acceptance/rejection of assigned work;
- public review browsing;
- accounting, payroll, commissions, or subscriptions.

These absences matter when threat-modeling because any real-world coordination around them currently occurs outside this codebase.

## 19. Primary code trace index

For future audits, start at these boundaries:

1. `src/services/api.js` — every frontend API request and error response.
2. `src/services/customer.js` and `src/services/admin.js` — frontend endpoint inventory.
3. `src/features/auth/*AuthContext.jsx` — browser session bootstrap.
4. `src/pages/CustomerPage.jsx` and customer components — customer workflow triggers.
5. `src/pages/AdminPage.jsx` — operations workflow triggers and parallel data loading.
6. `apps/platform/server.js` — routing, auth checks, CSRF, response exposure, and static serving.
7. `apps/platform/lib/auth.js` — credential/session/cookie implementation.
8. `apps/platform/lib/validation.js` — server-side trust boundary for submitted data.
9. `apps/platform/lib/constants.js` — runtime state machine.
10. `apps/platform/lib/json-store.js` and `postgres-store.js` — mutation invariants and adapter differences.
11. `apps/platform/db/migrations/` — database-enforced relationships and constraints.
12. `apps/platform/scripts/test*.js` — existing behavioral and integration expectations.

## 20. Required security implementations before production

The controls below are the minimum implementation plan for processing real customer data. They should be treated as release requirements, not optional enhancements. Completing the list does not replace a deployment review, threat model, or independent penetration test.

### 20.1 Release priority

| Priority | Meaning | Release rule |
| --- | --- | --- |
| `P0` | Direct risk to authentication, customer data, administrative control, or transport security. | Must be implemented and verified before any public production launch with real data. |
| `P1` | Important defense-in-depth, detection, privacy, and resilience control. | Must be completed before general availability; a tightly controlled pilot requires a documented exception and compensating control. |
| `P2` | Longer-term maturity and operational assurance. | Schedule immediately after the initial hardened release and track to completion. |

### 20.2 P0: transport and deployment security

Required implementation:

- Serve the public application only through HTTPS and redirect plain HTTP before it reaches authenticated content.
- Add HSTS after confirming that the production domain and required subdomains work exclusively over HTTPS. Begin with a safe rollout period before considering a long duration or preload.
- Authenticate the PostgreSQL server certificate. Do not use `rejectUnauthorized: false` as the normal production configuration.
- Obtain the database provider's CA requirements and configure an explicit trust chain.
- Use a dedicated, least-privilege database user. The application account should not own the database or have permission to create/drop unrelated schemas and roles.
- Keep production secrets in the hosting platform's secret manager, never in source control, images, frontend bundles, logs, or test artifacts.
- Separate production, staging, and development databases and credentials.
- Fail startup when required production security settings are absent or unsafe.

Primary implementation areas:

- `apps/platform/lib/postgres.js`;
- `apps/platform/server.js`;
- deployment/reverse-proxy configuration outside this repository;
- `.env.example` and deployment documentation, using placeholders only.

Acceptance criteria:

- An external TLS scan shows only approved protocols/ciphers and a valid certificate chain.
- HTTP requests are redirected to HTTPS and the application sends the intended HSTS policy.
- A connection using an untrusted database certificate fails closed.
- Application database credentials cannot create roles, access other databases, or perform unnecessary administrative operations.
- No secret appears in the Git history, built frontend assets, logs, or test artifacts.

### 20.3 P0: persistent session security

Replace the process-local session `Map` with a shared server-side session store, such as PostgreSQL or a dedicated managed session store.

Each session record should include:

- an opaque lookup identifier and a one-way hash/verifier for the secret token where practical;
- actor type and actor ID;
- creation time;
- last-used time;
- absolute expiry time;
- idle expiry time;
- revocation time and reason;
- optional security metadata needed for incident review without storing excessive personal data.

Required behavior:

- Enforce idle and absolute expiration on the server for every authenticated request.
- Delete or revoke expired sessions and periodically clean up expired records.
- Rotate the session identifier after login, credential changes, privilege changes, and other sensitive authentication events.
- Support logout of the current session and administrative revocation of all sessions for an account.
- Use independent customer and admin session policies; admin sessions should be shorter and more strictly controlled.
- Preserve `HttpOnly`, `Secure`, and an appropriate `SameSite` policy in production.
- Consider `__Host-` cookie prefixes when the final domain/path design supports them.
- Never expose session IDs, CSRF tokens, or password material in logs.
- Add automated tests for expiry, rotation, logout, revocation, restart persistence, and multi-instance access.

Primary implementation areas:

- `apps/platform/lib/auth.js`;
- a new session persistence migration/store interface;
- `apps/platform/server.js` authentication helpers;
- customer/admin authentication tests.

Acceptance criteria:

- An expired or revoked session is rejected even if the browser still sends its cookie.
- Restarting or scaling the application does not invalidate valid sessions or make revocation inconsistent.
- A session stolen before rotation cannot be used after rotation/revocation.
- Session cleanup can be observed and monitored.

### 20.4 P0: administrative identity and access control

Replace the single shared environment-configured admin identity with individual administrative accounts.

Required implementation:

- Store individual admin accounts with unique IDs, normalized unique emails, status, role, credential metadata, and timestamps.
- Require MFA for all admin accounts, preferably phishing-resistant WebAuthn/passkeys where deployment constraints allow it.
- Define explicit roles and permissions. At minimum distinguish account/security administration from day-to-day operations if both responsibilities exist.
- Apply authorization checks at each backend endpoint; hiding UI controls is not authorization.
- Provide secure invitation, activation, suspension, credential reset, and account-recovery processes.
- Require recent re-authentication for high-impact actions such as changing admin access or exporting customer data.
- Prevent the last active security administrator from being accidentally removed without a recovery procedure.
- Rate-limit and alert on admin authentication failures separately from customer authentication.
- Remove shared credentials after individual accounts are active.

Primary implementation areas:

- PostgreSQL migrations and admin storage methods;
- `apps/platform/lib/auth.js`;
- `apps/platform/server.js` authorization middleware/helpers;
- admin login and administration UI;
- audit logging.

Acceptance criteria:

- Every administrative action can be attributed to one individual account.
- A suspended administrator immediately loses access, including existing sessions.
- Permission tests demonstrate that each role can perform only its approved actions.
- MFA enrollment, recovery, reset, and lost-device scenarios have documented and tested procedures.

### 20.5 P0: safe errors, validation, and request handling

Required implementation:

- Introduce typed application errors with explicit safe HTTP mappings: validation 400, unauthenticated 401, forbidden 403, not found 404, conflict 409, rate limit 429, and unexpected failure 500.
- Return generic messages for unexpected failures and database errors. Preserve detailed diagnostics only in protected server logs.
- Generate a correlation/request ID and return it with safe error responses so support can locate the corresponding log event.
- Require `application/json` for JSON endpoints and reject unsupported media types.
- Enforce request body limits by bytes at the HTTP/parser layer and stop consuming oversized requests safely.
- Add dedicated allowlist validators for worker creation/update, worker availability, query filters, route identifiers, and every other mutation.
- Apply consistent maximum lengths, array limits, normalization, and accepted enum values.
- Reject unknown security-sensitive fields rather than silently persisting them.
- Keep PostgreSQL queries parameterized and add tests for injection-shaped inputs.
- Ensure logs encode untrusted values and exclude passwords, cookies, tokens, connection strings, and unnecessary PII.

Primary implementation areas:

- `apps/platform/server.js`;
- `apps/platform/lib/validation.js`;
- storage error mapping;
- API integration tests.

Acceptance criteria:

- Forced database/runtime failures return a generic 500 response without stack traces, SQL, paths, credentials, or internal messages.
- Invalid content types, oversized bodies, invalid enums, excessive arrays, and unexpected fields are rejected consistently.
- Security tests cover malformed JSON, boundary sizes, invalid UTF-8 handling at the server boundary, injection strings, and repeated parameters.

### 20.6 P0: atomic authorization and workflow integrity

Move critical state preconditions into atomic database operations or transactions. A separate read/check followed by an unconditional update is not sufficient under concurrent requests.

Required implementation:

- Update a job only when its current status is an allowed source status in the same SQL statement/transaction.
- Lock or conditionally update request rows during scheduling, assignment, completion, and confirmation.
- Require customer ownership in the mutation query itself, not only in a prior lookup.
- Enforce one review per request through both application logic and the database constraint.
- Record lifecycle timestamps such as `completed_at` when the corresponding transition occurs.
- Decide and enforce assignment policy for worker active state, availability, service/category qualification, and service area.
- Update worker availability and completed-job counts consistently, or explicitly remove those derived fields until reliable.
- Make JSON and PostgreSQL adapters follow identical preconditions; prohibit JSON storage in production.
- Add concurrency tests that send conflicting transitions simultaneously.

Acceptance criteria:

- Two concurrent incompatible transitions cannot both succeed.
- A customer cannot read, confirm, or review another customer's request even when IDs are guessed or replayed.
- Every persisted status is reachable only through an allowed transition.
- Database constraints and adapter contract tests prevent invalid terminal-state changes.

### 20.7 P0: customer-data protection and privacy operations

TIKKA stores names, telephone numbers, email addresses, service addresses, job descriptions, scheduling details, and reviews. These fields should be formally classified as customer data and protected throughout their lifecycle.

Required implementation:

- Create a data inventory identifying each personal-data field, its purpose, storage location, authorized users, retention period, and deletion method.
- Collect only information needed to deliver and support the service.
- Publish an accurate privacy notice and obtain appropriate legal review for the jurisdictions in which TIKKA operates.
- Establish retention schedules for accounts, requests, reviews, audit logs, backups, and abandoned registrations.
- Implement verified account/data access, correction, export, and deletion workflows where legally and operationally applicable.
- Define exceptions where records must be retained, and separate deletion from irreversible anonymization.
- Encrypt production storage and backups using provider-managed or organization-managed keys with documented access and rotation.
- Restrict database, backup, and support-tool access to authorized personnel and review it periodically.
- Mask customer data in non-production environments. Do not copy production PII into developer databases or screenshots.
- Do not place customer details in URLs, analytics events, exception trackers, or ordinary application logs.
- Treat future photo uploads as a separate high-risk feature requiring private object storage, randomized object keys, strict MIME/content checks, size/dimension limits, malware scanning, access authorization, retention/deletion, and metadata handling.
- Create an incident-response and breach-escalation process with named owners and preserved audit evidence.

Acceptance criteria:

- The data inventory maps every customer-data field to a purpose and retention rule.
- A test customer can be exported and deleted/anonymized without leaving active copies outside documented retention exceptions.
- Restored backups preserve required protection and do not silently resurrect data beyond policy.
- Non-production systems and test artifacts contain no production customer information.

### 20.8 P1: browser and API response protections

Required implementation:

- Add a restrictive Content Security Policy. Begin with `Content-Security-Policy-Report-Only`, resolve violations, then enforce it.
- Prefer CSP `frame-ancestors` and retain an appropriate `X-Frame-Options` fallback.
- Add `Cache-Control: no-store` to authentication responses and authenticated customer/admin API responses unless a reviewed endpoint has a different safe policy.
- Define safe caching for hashed static assets and prevent shared caching of the application shell when it could expose user-specific state.
- Add an appropriate Permissions Policy.
- Keep `X-Content-Type-Options: nosniff` and an explicit Referrer Policy.
- Maintain same-origin APIs unless cross-origin access becomes a real requirement. If CORS is added, use an explicit origin allowlist and never combine wildcard origins with credentials.
- Validate `Origin`/Fetch Metadata for sensitive browser mutations as defense-in-depth alongside CSRF tokens.
- Review whether admin pages should use `frame-ancestors 'none'`/`DENY` rather than `SAMEORIGIN`.

Acceptance criteria:

- Automated header tests cover HTML, static assets, public JSON, authenticated JSON, and errors.
- CSP is enforced without unsafe broad source allowances and without breaking required application behavior.
- Authenticated responses are not stored by shared caches or browser disk caches contrary to policy.

### 20.9 P1: shared abuse protection

Required implementation:

- Move authentication throttling to shared storage with atomic counters and expiration.
- Configure an explicit trusted-proxy policy; do not accept arbitrary client-supplied forwarding headers as authoritative.
- Rate-limit by a balanced combination of verified source address, normalized account identifier, route, and risk signal.
- Add bounded throttles for registration, request creation, review submission, and expensive admin searches where abuse could affect availability.
- Avoid permanent account lockouts that attackers can intentionally trigger.
- Add alerting for credential stuffing, repeated CSRF failures, authorization failures, unusual admin access, and high-volume data access.
- Document safe operational procedures for investigating and clearing limits.

Acceptance criteria:

- Limits behave consistently across multiple application instances and survive restarts.
- Spoofed forwarding headers cannot bypass limits in the production proxy topology.
- Load tests confirm that throttling protects the service without exposing whether an account exists.

### 20.10 P1: audit logging, monitoring, and incident response

Create append-oriented security and business audit events separate from ordinary diagnostic logs.

Events should cover:

- authentication success/failure, logout, session revocation, MFA and credential changes;
- admin account/role/status changes;
- denied authorization and CSRF failures;
- customer-data reads that are high-volume, exported, or performed by administrators;
- request creation, scheduling, assignment, and every status transition;
- worker/category changes and review moderation;
- security configuration changes, startup failures, and backend TLS failures.

Each event should contain a timestamp, event type, outcome, correlation ID, actor ID/type, target ID/type, and minimal operational context. Do not store passwords, raw session/CSRF tokens, database URLs, or full unnecessary customer content.

Required operational controls:

- Centralize logs with restricted access, tamper resistance, retention, searchable correlation IDs, and time synchronization.
- Alert on defined high-risk patterns and route alerts to named responders.
- Maintain incident severity definitions, containment steps, credential/session revocation procedures, evidence handling, recovery steps, and notification decision paths.
- Test the incident process with tabletop exercises before launch.

Acceptance criteria:

- A reviewer can reconstruct who changed a request, what changed, when, and whether it succeeded.
- Security alerts are exercised in staging and reach the responsible person.
- Log inspection confirms that secrets and prohibited PII are not recorded.

### 20.11 P1: backup, recovery, and service resilience

Required implementation:

- Use automated encrypted PostgreSQL backups with a documented retention schedule and protected deletion policy.
- Test restoration into an isolated environment and record recovery time and recovery point results.
- Create a readiness endpoint that verifies critical dependencies without exposing configuration details.
- Keep liveness and readiness semantics separate.
- Add graceful timeout handling for HTTP requests and database operations.
- Set database pool limits appropriate to the hosting plan.
- Monitor error rates, latency, authentication failures, database saturation, storage capacity, and backup failures.
- Define rollback procedures for application and database migrations.

Acceptance criteria:

- A restore drill succeeds using documented steps and produces a usable, access-controlled database.
- The deployment platform stops routing traffic to instances that cannot reach required dependencies.
- Failed migrations and releases have tested recovery/rollback paths.

### 20.12 P1: secure development and supply chain

Required implementation:

- Run dependency vulnerability scanning, secret scanning, static analysis, tests, and the production build in CI for every change.
- Pin and review runtime/toolchain versions and keep dependencies within supported security lifecycles.
- Review lockfile changes and restrict who can modify build/deployment workflows.
- Generate and retain a software bill of materials for production releases where practical.
- Protect the source repository with MFA, least privilege, branch protection, required review, and protected deployment environments.
- Separate build and runtime permissions; production should run as a non-administrative OS/container user with a read-only filesystem except for explicitly required paths.
- Do not include development secrets, local JSON databases, test artifacts, or unnecessary source files in the production image/package.

Acceptance criteria:

- CI blocks releases on failing required checks or accepted-severity vulnerabilities without an approved exception.
- A clean production artifact can be traced to a reviewed commit and dependency lockfile.
- Secret-scanning tests detect seeded test secrets and confirm alert routing.

### 20.13 P2: assurance and recurring review

Required implementation:

- Produce a threat model covering customers, admins, workers, the hosting platform, PostgreSQL, backups, support access, and future uploads.
- Perform an independent penetration test against a production-like staging environment before public launch and after major authentication/storage changes.
- Create misuse-case tests for IDOR, privilege escalation, CSRF, session theft/replay, race conditions, mass assignment, injection, and administrative abuse.
- Review access rights, audit events, dependency risk, restoration results, and retention/deletion outcomes on a recurring schedule.
- Establish vulnerability intake, severity, remediation deadlines, disclosure handling, and emergency release procedures.

### 20.14 Recommended implementation order

```text
1. Freeze production launch with real customer data
2. Confirm data inventory and production hosting boundaries
3. Fix PostgreSQL TLS, HTTPS, secrets, and least privilege
4. Implement persistent expiring sessions and individual admin MFA
5. Implement safe errors, complete validation, and atomic transitions
6. Add customer-data lifecycle controls and durable audit logging
7. Add browser headers, shared throttling, monitoring, and alerts
8. Verify backups, restores, readiness, and rollback
9. Add CI security gates and complete the threat model
10. Run an independent penetration test and remediate findings
11. Hold a documented go-live security review
```

### 20.15 Production security verification checklist

The application is not ready for real customer data until every applicable release-blocking item has evidence attached.

- [ ] Production uses PostgreSQL; JSON storage is disabled.
- [ ] HTTPS and authenticated database TLS are verified.
- [ ] Secrets are stored and rotated through an approved secret manager.
- [ ] Sessions persist safely, expire server-side, rotate, and can be revoked.
- [ ] Every admin has an individual account, MFA, and an approved role.
- [ ] All protected endpoints have automated authentication, authorization, ownership, and CSRF tests.
- [ ] Critical job transitions and customer mutations are atomic under concurrency.
- [ ] Unexpected failures return generic responses and a correlation ID.
- [ ] Validation and body limits cover every endpoint and query parameter.
- [ ] CSP, HSTS, cache controls, framing controls, and Permissions Policy are verified in the deployed environment.
- [ ] Shared rate limits and trusted-proxy handling are verified.
- [ ] Security/audit logs and alerts are operational without leaking secrets or unnecessary PII.
- [ ] Customer-data inventory, privacy notice, retention, export, correction, and deletion procedures are approved.
- [ ] Production data is excluded from development and test systems.
- [ ] Encrypted backups and a restore drill are complete.
- [ ] Dependency, secret, and static security scans pass.
- [ ] Production-like load, abuse, concurrency, and failure tests pass.
- [ ] Independent penetration-test findings are remediated or formally accepted by the accountable owner.
- [ ] Incident response, rollback, and emergency credential/session revocation have been exercised.
- [ ] A named security owner signs the go-live decision and records any time-bound exceptions.

### 20.16 Security reference baseline

Implementation and review should use current primary guidance rather than treating this document as a complete security standard:

- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Exact privacy, breach-notification, employment, consumer-protection, and data-residency obligations require qualified legal review for the jurisdictions and business model in which TIKKA operates.

## 21. Scope and confidence notes

This map was produced by static inspection of the repository. It covers committed source files that define application behavior, build flow, storage, migrations, and tests. It does not assert the state of any deployed environment, reverse proxy, PostgreSQL instance, secrets manager, CDN, firewall, or hosting dashboard.

The repository was not functionally changed. `READMEabout.md` is documentation only.
