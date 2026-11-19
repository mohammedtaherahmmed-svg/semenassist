# Render staging acceptance checklist

Complete this checklist before connecting any Android test build to the Render API.

## Before provisioning
- [ ] Confirm the Blueprint creates only the staging web service.
- [ ] Select an external managed MySQL provider; do not provision PostgreSQL for this app.
- [ ] Create a new, empty staging database and a dedicated staging DB user.
- [ ] Enable TLS and automated backups at the database provider.
- [ ] Keep all Manus production services and credentials unchanged.

## Secrets and service
- [ ] Set staging `DATABASE_URL` in Render's secret environment.
- [ ] Confirm Manus OAuth credentials are permitted from external hosting.
- [ ] Configure staging-only `LICENSE_SERIAL_PEPPER` and RSA update-signing key.
- [ ] Configure Forge credentials only if the staging service needs Forge-backed features.
- [ ] Confirm `/api/health/ready` returns 503 before DB configuration and 200 after DB connectivity succeeds.

## Schema and application
- [ ] Verify `DATABASE_URL` points to the new staging database before running migrations.
- [ ] Run `pnpm db:migrate` once against staging.
- [ ] Verify expected tables and indexes exist.
- [ ] Test owner authentication and admin authorization.
- [ ] Test license issuance, activation, revalidation, suspension/reactivation, and one-device enforcement.
- [ ] Test sample report persistence, calibration profiles, video analysis, and storage integrations.
- [ ] Test from a physical Android device using a staging-only APK and API URL.

## Cutover gate
- [ ] Review logs for leaked secrets, tokens, serials, or patient/sample data.
- [ ] Verify backup restoration procedure for the staging DB.
- [ ] Document unresolved Manus OAuth/Forge dependencies.
- [ ] Obtain explicit approval for a separate production cutover plan.

Passing this checklist is a staging milestone only. It does not establish clinical validation of the analysis engine.
