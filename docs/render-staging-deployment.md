# Render staging deployment (SemenAssist)

This is a **staging-only** deployment plan. It does not replace the Manus service, migrate production data, or change the Android production API URL.

## Architecture

- Render runs the existing Node.js API in the repository's Dockerfile.
- A separate, externally managed **MySQL** database is used for staging.
- Manus remains live with its existing database and remains the rollback target.
- The Render Blueprint intentionally does not create a Render PostgreSQL database. The application uses Drizzle's MySQL dialect and `mysql2`; PostgreSQL is not compatible without a deliberate database/driver migration.

## Important compatibility dependencies

The backend still uses Manus services for authentication and some storage/LLM integrations:

- `MANUS_PROJECT_ID` and `MANUS_JWT_SECRET` are used by the session/authentication implementation.
- `MANUS_OAUTH_API_URL` is used for OAuth code exchange and user information.
- `OWNER_OPEN_ID` identifies the initial owner/admin account.
- `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` support the storage proxy and Forge-backed functionality.

Before creating the Render service, confirm these Manus credentials/services remain valid when called from outside Manus. If Manus OAuth or Forge credentials are restricted to the Manus runtime, authentication/storage must be migrated or replaced before the Render API can serve the Android app. Do not assume a successful health check proves login or storage works.

## Create the staging MySQL database

Render Blueprints currently define managed PostgreSQL databases, not MySQL databases. Provision a separate managed MySQL instance with a provider that supports TLS connections and automated backups. Do not use the Manus production connection string, and do not paste credentials into GitHub or chat.

Create a dedicated database and application user for staging. Grant only the permissions required by the application; use a separate migration-capable user if the provider supports it. Copy the provider's TLS-enabled MySQL connection string into the Render service's `DATABASE_URL` secret.

## Deploy staging

1. In Render, create a Blueprint from this repository and select this branch/PR for the staging trial.
2. Review the Blueprint. It creates only the `semenassist-api-staging` web service; it does not provision a database or alter existing services.
3. Enter the staging MySQL `DATABASE_URL` and the required Manus integration values as Render secrets. Never commit these values.
4. Set `LICENSE_SERIAL_PEPPER` to a new random value of at least 32 characters. Keep it separate from any future production pepper.
5. Set `UPDATE_MANIFEST_PRIVATE_KEY` to a staging-only RSA private key of at least 2048 bits. Never reuse a production signing key in staging.
6. Deploy the service with auto-deploy disabled. Confirm the service starts and that `/api/health/ready` returns HTTP 200 only after MySQL is reachable.

## Initialize the empty staging database

After confirming that `DATABASE_URL` points to the **new staging database**, run this command once from a controlled environment with the repository dependencies installed:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
```

The migration command applies the committed Drizzle migrations in order. Do not run `pnpm db:push` against production; it generates migrations and applies them.

Then verify:
- `/api/health/ready` returns HTTP 200.
- The database contains the expected tables from `drizzle/schema.ts`.
- A staging owner can authenticate and receives the expected admin role.
- License issue, activation challenge, activation, validation, suspension/reactivation, and device-binding tests pass.
- Video analysis and storage integrations work from the Render runtime.

The readiness endpoint checks connectivity only; it does not prove that migrations are applied or that Manus integrations work.

## Android staging build

Build a separate staging APK with `EXPO_PUBLIC_API_BASE_URL` set to the Render staging URL and the matching public update-manifest key, if update verification is enabled. Do not change the production default URL in `app.config.ts` as part of this staging work. Test the staging APK on a physical Android device.

## Cutover and rollback

No production cutover is included in this change. Keep the Manus API and database untouched until staging passes all acceptance tests and a separate, explicit cutover plan is approved. Because the new database starts empty, user accounts, reports, calibration profiles, device licenses, device bindings, and audit history from Manus will not appear there unless separately migrated.
