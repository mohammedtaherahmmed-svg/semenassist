# SemenAssist production licensing rollout

This checklist is the release gate for enabling device licensing in production. Do not issue customer serials until every required item is verified against the production deployment.

## 1. Hosting and API

- [ ] Confirm the production API hostname and HTTPS certificate.
- [ ] Confirm the Android build's `EXPO_PUBLIC_API_BASE_URL` points to that production API.
- [ ] Confirm the API is deployed from a reviewed commit and has a rollback target.
- [ ] Confirm production logs do not record raw license serials, private keys, challenge signatures, or full request bodies.
- [ ] Confirm database backups and restore procedures before applying schema changes.

## 2. Required secrets

Configure these in the hosting provider's secret manager only:

- `LICENSE_SERIAL_PEPPER`: cryptographically random, at least 32 characters. Keep stable; rotation makes previously issued serial hashes unresolvable.
- `UPDATE_MANIFEST_PRIVATE_KEY`: RSA private key (at least 2048 bits), never commit or expose it.
- `EXPO_PUBLIC_UPDATE_MANIFEST_PUBLIC_KEY`: matching public key supplied to the Android build. It is public verification material, not a secret.

Before release, verify the public key corresponds to the private key without printing either key into CI logs. If the update service is not being enabled in the first production rollout, do not publish releases until the key pair is configured.

## 3. Database

- [ ] Take and verify a restorable backup.
- [ ] Review and apply migrations `0004_device_licensing_updates.sql`, `0005_device_activation_challenges.sql`, and `0006_one_device_per_license.sql` in order.
- [ ] Verify the unique constraints on serial hash, installation ID, and license ID.
- [ ] Verify the application database user has only the permissions required by the app and migrations are run by a controlled deployment identity.
- [ ] Confirm challenge cleanup and license event retention/backup policies.

Never run production migrations against an unconfirmed database or without a tested backup.

## 4. Activation and enforcement acceptance tests

Run these against a staging environment first, using test licenses:

1. A valid serial activates exactly one Android installation.
2. The same installation can revalidate using its existing Android Keystore key.
3. The same serial cannot activate a second installation.
4. An invalid serial does not consume a valid challenge before the serial is checked.
5. An expired, suspended, or revoked license is rejected.
6. A changed installation key is rejected.
7. Expired and replayed challenges are rejected.
8. Releasing a device binding permits a deliberate transfer and leaves an audit event.
9. A suspended license is rejected on the next online validation; reactivation preserves its existing device binding.
10. Network failure is handled as an unavailable/unknown license state, never as proof that a license is valid.

## 5. Android release acceptance

- [ ] Confirm package ID matches the currently distributed app.
- [ ] Confirm APK signing certificate continuity with the installed release.
- [ ] Confirm Android Keystore private key is non-exportable and survives app restarts.
- [ ] Test fresh install, activation, force-close/reopen, reboot, offline startup, reconnect, suspension, reactivation, and device transfer on physical Android devices.
- [ ] Verify a tampered manifest and a mismatched APK SHA-256 are rejected.
- [ ] Verify mandatory updates block unsupported versions only after the update policy and recovery path are tested.

## 6. Rollout order

1. Deploy schema migrations to staging.
2. Configure staging secrets and deploy the API.
3. Run the activation/enforcement acceptance tests.
4. Build an Android staging APK with the matching API URL and public manifest key.
5. Complete physical-device tests.
6. Repeat the migration and deployment process in production with a verified backup and rollback plan.
7. Issue a small number of internal production licenses first.
8. Monitor activation failures, validation failures, API errors, and database health before customer rollout.

## Current implementation boundary

The repository currently contains the licensing APIs and Android cryptographic/update foundations. A complete app-wide license gate, production host configuration, production secrets, applied production migrations, and physical-device acceptance tests must all be completed before claiming production enforcement is live. A successful CI build alone does not establish production readiness.
