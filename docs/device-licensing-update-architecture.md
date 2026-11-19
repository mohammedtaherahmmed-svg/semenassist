# SemenAssist Device Licensing & Android Updates

## Approved product decisions

- License model: one independently activated license per Android installation/device.
- Connectivity: online license verification is required.
- Platform scope: Android only for this implementation.
- Visual direction: hybrid clinical interface (white surfaces + navy primary actions). Visual UI work is handled separately in the Product Design workflow.

## Repository baseline

- Base branch: `main`
- Baseline commit: `2605ba8b78016ca8685a96194423297d62fe3c2f`
- Existing stack: Expo / React Native / TypeScript, Express + tRPC backend, MySQL + Drizzle.
- Existing authentication and role model includes technician, supervisor, and admin.
- Android native modules exist under `modules/semenassist-vision`.
- APK CI workflow: `.github/workflows/build-android.yml`.
- An unrelated open revert PR (#3) exists; this work must not merge or modify it.

## Architecture

### Device license service

The backend is authoritative. A license record represents exactly one allowed Android installation in this phase, not a release version.

Proposed records (subject to migration review):
- `device_licenses`: license identifier, hashed serial, status, validity window, feature flags, created/updated timestamps.
- `licensed_devices`: license ID, generated installation ID, public-key fingerprint, app version, platform, activation/last-seen timestamps, status.
- `license_events`: activation, validation, revoke, transfer and administrative events.

Do not store plaintext serials after issuance. Store a cryptographic hash/HMAC suitable for lookup and compare safely. Generate activation challenges server-side. Bind a device to a public key generated and retained by Android Keystore where supported. The private key must never leave the device. The app proves possession of the device private key by signing a fresh, single-use server challenge. The backend checks license status on every online validation. TLS is mandatory.

The device identity must not rely on Android ID alone. Reinstall/reset and device-transfer behavior must be explicit administrative flows. Since the approved mode is online, failure to reach the licensing service must not silently grant a new activation. Define a bounded, configurable grace policy only if product requirements later authorize it.

### API responsibilities

Use the existing authenticated tRPC/Express service rather than introducing a second backend by default.

Proposed operations:
- activate(serial, installation public key, app metadata)
- validate(license ID, signed device proof, app version)
- deactivate/transfer (admin-authorized)
- revoke (admin-authorized)
- issue one-device license (admin-authorized)
- list licenses/devices and audit events (admin-authorized)

All privileged operations require server-side authorization and audit logging. Client-supplied role claims are never trusted.

### Android update service

A release is independent of a device license. Each release has:
- semantic version and monotonically increasing Android versionCode
- minimum supported app version
- release channel and mandatory/optional flag
- APK URL, SHA-256 digest, file size, release notes
- signed manifest metadata

The app checks the manifest over HTTPS, downloads the full APK, verifies its digest and manifest signature, then hands installation to Android's package installer. User confirmation may be required by Android. No silent installation is promised.

APK upgrades must preserve the existing application ID and signing certificate (or a valid signing lineage). Do not rotate, replace, regenerate, or commit signing credentials as part of this work. First inspect the existing signing configuration and CI secrets. Never expose signing material in logs or repository files.

For the first release, use complete APK downloads rather than binary delta patches. Delta patching is a later optimization after integrity, recovery, and compatibility tests pass. JavaScript-only OTA updates must not replace APK updates for changes to native Kotlin modules or native dependencies.

## Implementation sequence

1. Baseline verification: inspect app identity, signing setup, auth middleware, DB connection/migrations, CI and deployment environment.
2. Add schema and migrations for licenses, devices, releases and audit events.
3. Implement server-side license issuance, activation, validation, revocation and admin authorization.
4. Add Android client activation and online validation, with secure key storage and clear blocked/expired states.
5. Implement release manifest, signed metadata, APK download, digest verification and installer handoff.
6. Add admin management screens/workflows after the visual design brief is completed in Product Design.
7. Add integration tests, security tests, migration checks and physical-device update tests.
8. Open review PR; do not merge to main until CI and installation/update tests pass.

## Acceptance criteria

- One license cannot activate more devices than its configured device allowance (default one).
- Invalid, revoked, expired and tampered credentials are rejected server-side.
- Device private keys never leave Android Keystore.
- Admin actions are role-checked and audited.
- A tampered APK or manifest is rejected before installation.
- An update with a different application ID or incompatible signing certificate is not offered.
- Existing sample reports, calibrations and review records survive a successful update.
- CI success is not treated as proof of real-device installation or clinical validity.

## Explicit non-goals

- No change to semen analysis algorithms or clinical claims.
- No Windows client in this phase.
- No silent APK installation.
- No production license issuance until server secrets, hosting, database migrations and admin ownership are configured and verified.
