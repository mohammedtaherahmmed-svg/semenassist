# Licensing and update service deployment

The licensing APIs are implemented in `server/licensing.ts` and exposed through the tRPC `licensing` router.

## Required server secrets

Configure these only in the hosting provider's secret manager (never in Git):

- `LICENSE_SERIAL_PEPPER`: random secret of at least 32 characters. Keep it stable; rotating it invalidates lookup of all issued serials.
- `UPDATE_MANIFEST_PRIVATE_KEY`: PEM-encoded RSA-2048 private key used to sign release manifests. Keep its matching public key for the Android client build. Never ship the private key in the APK.

Example key generation (run in a secure local terminal; keep the private key private):

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out update-manifest-private.pem
openssl pkey -in update-manifest-private.pem -pubout -out update-manifest-public.pem
```

## Database

Apply migrations `0004_device_licensing_updates.sql`, `0005_device_activation_challenges.sql`, and `0006_one_device_per_license.sql` only after reviewing a backup and confirming the target database. The unique `licensed_devices.licenseId` index enforces one device per license at the database level.

## Activation protocol

1. Client creates an installation key pair (RSA-2048) in Android Keystore; private key must be non-exportable.
2. Client requests a short-lived challenge for its random installation ID.
3. Client signs the returned nonce with its private key.
4. Client sends serial, public key, challenge ID and signature to `licensing.activate`.
5. For later online validation, client requests a fresh challenge and signs it; server verifies against the stored public key.

Challenge lifetime is five minutes and each challenge is single-use. The Android native module now creates an RSA-2048 signing key in Android Keystore and exposes challenge signing to TypeScript. Full activation UI and physical-device verification are still pending.

## Update publishing

Only HTTPS APK URLs are accepted. The service signs canonical release metadata with RSA-2048. Android must pin the corresponding public key and verify the signature and APK SHA-256 before handing the APK to Android's package installer. The client-side manifest signature verification, installer flow, package-signing certificate continuity checks, and real-device tests are still pending.

## Operational constraints

- Do not issue production licenses until both secrets are configured and the database migrations are applied.
- Do not publish an APK until its package ID and signing certificate have been verified against the currently deployed app.
- Revocation takes effect on the next successful online validation; the app must not treat a failed network request as a valid license.
- This phase does not support silent installation, Windows, or clinical/algorithm changes.
