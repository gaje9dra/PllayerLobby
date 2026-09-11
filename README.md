# ArenaX — Esports Tournament Platform

Production-oriented esports tournament platform built with Next.js, React, TypeScript, Tailwind CSS, PostgreSQL, Prisma, and Auth.js.

## Requirements

- Node.js 22.12+ (22.16+ recommended)
- npm
- PostgreSQL 14+

## Install dependencies

```bash
npm install
```

## Environment configuration

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Set the following values for local development:

```env
APP_ENVIRONMENT=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_TIMEZONE=Asia/Kolkata
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?schema=public"
AUTH_SECRET="a-long-random-secret"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
PAYU_MERCHANT_KEY="your-payu-merchant-key"
PAYU_MERCHANT_SALT="your-payu-merchant-salt"
PAYU_ENVIRONMENT="test"
PAYU_PAYOUT_ENVIRONMENT="TEST"
PAYU_PAYOUT_MERCHANT_ID="your-test-payout-merchant-id"
PAYU_PAYOUT_CLIENT_ID="your-test-payout-client-id"
PAYU_PAYOUT_CLIENT_SECRET="your-test-payout-client-secret"
PAYU_PAYOUT_WEBHOOK_SECRET="your-test-payout-webhook-secret"
PAYOUT_ENCRYPTION_KEY="base64-encoded-32-byte-key"
PAYOUTS_ENABLED=true
```

Never commit `.env`, `.env.local`, `.env.production`, or real credentials. Server secrets must never use `NEXT_PUBLIC_*`. The PayU merchant salt, payout credentials, OAuth secret, database URL, encryption key, and webhook secret are server-only.

For production, set `APP_ENVIRONMENT=production`, use the real HTTPS application URL, production Google OAuth configuration, production database, production PayU payment/payout environments, and `PAYU_PAYOUT_PRODUCTION_ENABLED=true` only after payout launch approval. Production also requires `PAYOUTS_ENABLED=true` for new payout initiation.

Run the safe configuration checker with:

```bash
npm run config:check
npm run config:check:production
```

The production checker reports only configuration status; it never prints secret values.

Generate a strong Auth.js secret with:

```bash
npx auth secret
```

## Database setup

Create an empty PostgreSQL database using a local installation or a managed PostgreSQL provider, then set `DATABASE_URL` in `.env.local`.

Generate Prisma Client:

```bash
npm run prisma:generate
```

Validate the Prisma schema:

```bash
npm run db:validate
```

Apply development migrations:

```bash
npm run db:migrate -- --name auth
```

For production/staging deployments with committed migrations:

```bash
npm run db:migrate:deploy
```

Never use `prisma migrate reset` against production.

Check migration status:

```bash
npm run db:migrate:status
```

Verify PostgreSQL connectivity:

```bash
npm run db:check
```

## Google Cloud OAuth setup

1. Open Google Cloud Console and create or select a project.
2. Configure the OAuth consent screen.
3. Create an OAuth Client ID for a Web application.
4. Add this authorized redirect URI for local development:

```text
http://localhost:3000/api/auth/callback/google
```

5. For production, add the same callback path using the production HTTPS application origin, for example:

```text
https://your-domain.example/api/auth/callback/google
```

6. Copy the Client ID to `GOOGLE_CLIENT_ID`.
7. Copy the Client Secret to `GOOGLE_CLIENT_SECRET`.

Do not paste OAuth secrets into source control or chat.

## Authentication

Google is the only configured authentication provider. There is no username/password or email/password authentication.

The application uses Auth.js database sessions backed by Prisma/PostgreSQL. Google accounts are linked to the existing `User` model by email/account records. New users receive `USER` role and `ACTIVE` status through the database defaults.

Authentication API routes are available under `/api/auth/*` and the custom sign-in page is `/login`.

## Protected routes

- `/dashboard` requires an authenticated active user.
- `/admin` requires an authenticated active user with `ADMIN` role.

Roles and statuses are checked server-side against PostgreSQL. Client-visible session data is not trusted for authorization.

## Initial admin setup

There is intentionally no public mechanism to promote an account.

For local/development administration, first sign in with Google so the account exists, then use a trusted database administration workflow to set that user's role to `ADMIN`. For example, with Prisma Studio:

```bash
npm run db:studio
```

Locate the intended user and change only its `role` field to `ADMIN`. Do not expose or build a public role-management endpoint.

In production, perform this operation through your controlled database administration process with appropriate access controls and audit procedures.

## Start development server

```bash
npm run dev
```

Open `http://localhost:3000`.

## Production infrastructure

Phase 6.2 production hardening is documented in:

- `PRODUCTION_DEPLOYMENT_CHECKLIST.md`
- `docs/PRODUCTION_RECOVERY.md`
- `docs/production-infrastructure-phase-6.2.md`

The safe health endpoint is `/api/health` and returns only an application health status. The repository does not claim external backups, monitoring, TLS, DNS, secret-manager configuration, Google production OAuth settings, or PayU provider activation are configured; those require hosting/provider setup.

The application uses request correlation IDs through the Next.js Proxy and production security headers including CSP, HSTS, frame protection, referrer policy, and permissions policy.

## Application timezone

Tournament scheduling uses one explicit application timezone. The default is `Asia/Kolkata` for the India-focused platform and can be changed with `APP_TIMEZONE`.

Admin date/time inputs are interpreted as wall-clock times in this timezone and converted to JavaScript `Date` values before persistence. PostgreSQL stores the resulting timestamps in the timezone-aware `DateTime` representation used by Prisma. Tournament lists convert stored timestamps back to the application timezone for display.

Do not treat browser-local date/time strings as UTC. Keep all tournament scheduling on this explicit conversion path.

## CI verification

GitHub Actions verifies the application with Node 22, Prisma generation/validation/migrations, typecheck, lint, tests, and a production build against an ephemeral PostgreSQL service. Production deployment is intentionally not automatic.

## Phase 2.1 — Tournament database architecture

The database contains `Game` and `Tournament` models. Games have an `isActive` flag, while tournaments reference games through `gameId` and use the `TournamentFormat` and `TournamentStatus` enums. Tournament money uses PostgreSQL Decimal fields rather than floating-point values.

## Phase 2.2 — Admin tournament creation

Active administrators can create tournament records from `/admin/tournaments/create`. The server-side creation action re-checks the authenticated user's role and status, validates the selected active game, validates the slug and schedule, validates money and participant limits, and creates the tournament with `DRAFT` status.

The admin list at `/admin/tournaments` reads actual tournament records from PostgreSQL and shows the game, status, schedule, entry fee, prize pool, and participant limit. Tournament editing, deletion, publishing, registration, payments, room credentials, and participant workflows remain deferred to later phases.

## Current authentication database scope

Phase 1.3 adds only the database structures required by Auth.js:

- `User`
- `Account`
- `Session`
- `VerificationToken`
- `UserRole`
- `UserStatus`

## AUTHORIZATION SETUP — PHASE 1.4

Authorization is enforced server-side for protected application areas.

- `/dashboard` requires an authenticated user with `ACTIVE` status.
- `/admin` requires an authenticated `ADMIN` with `ACTIVE` status.
- Suspended and banned accounts are redirected to `/access-denied`.
- Unauthenticated protected requests are redirected to `/login`.
- Role and status are re-read from PostgreSQL through the server-side authorization helpers.

Reusable helpers are available from `lib/auth.ts`:

- `getCurrentUser()`
- `requireUser()`
- `requireActiveUser()`
- `requireAdmin()`
- `isAdmin()`
- `isActiveUser()`

### Development admin setup

Do not create an admin account through the application. For local testing, use Prisma Studio or another secure database administration workflow to change a test user's `role` from `USER` to `ADMIN`. Keep `status` set to `ACTIVE` for normal admin access.

## Phase 1.4 database migration

Phase 1.4 does not change the Prisma schema, so no new database migration is required for this phase. Existing Phase 1.2/1.3 migrations remain the source of truth.

## Phase 1.5 — User Dashboard, Profile and Navigation

Phase 1.5 adds the user-facing account interface while preserving the Phase 1.3 authentication and Phase 1.4 authorization architecture.

### Added
- Server-protected `/profile` page using the existing `requireUser()` helper.
- Dashboard account overview using trusted server-side user data.
- Reusable profile card, dashboard cards, empty states, quick actions, and dashboard header components.
- Professional user dropdown with Dashboard, Profile, optional Admin Panel, and Logout.
- Responsive collapsible mobile navigation.
- Real empty states for My Tournaments, Payment History, and Notifications; no fake records or future database models.
- Dashboard/profile loading states and user-safe error states.
- Request-level caching for `getCurrentUser()` to avoid redundant user queries between the dashboard layout/page and shared layout.

### Intentionally not implemented
Tournament registration/creation/management beyond the Phase 2.2 admin creation flow, payment verification, registration codes, rooms, joining windows, payouts, refunds, notification persistence, and complete admin management remain future-phase work.

## Phase 3.1 — PayU Payment Architecture & Secure Checkout

Phase 3.1 adds a `Payment` model linked to `Registration`, server-side PayU hosted checkout initiation, SHA-512 request hashing, callback response-hash validation, duplicate payment protection, and safe dashboard payment status display.

Paid tournament flow:

```text
Register
  → Registration = PENDING
  → Proceed to Payment
  → server derives amount from PostgreSQL
  → Payment = PENDING
  → PayU hosted checkout
  → PayU callback
  → response/hash/transaction/amount checks
  → success remains PENDING until the next verification phase
```

The application never collects card data directly and never sends the merchant salt to the browser. See `docs/payu.md` for merchant setup, environment configuration, callback configuration, hashing, testing, and the Phase 3.1 boundary.

## Local setup

After pulling the latest phase, run:

```bash
npx prisma generate
npm run db:validate
npm run db:migrate:deploy
npm test
npx tsc --noEmit
npm run lint
npm run build
```
