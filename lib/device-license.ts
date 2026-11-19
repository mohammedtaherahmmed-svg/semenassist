import Constants from "expo-constants";
import { createTRPCClient } from "@/lib/trpc";
import { getDeviceLicenseIdentity, signDeviceLicenseChallenge, verifySignedUpdateManifest } from "@/lib/vision";

export async function activateDeviceLicense(serial: string) {
  const normalizedSerial = serial.trim().toUpperCase();
  if (normalizedSerial.length < 12 || normalizedSerial.length > 64) {
    throw new Error("رقم الترخيص غير صالح.");
  }

  const identity = await getDeviceLicenseIdentity();
  const client = createTRPCClient();
  const challenge = await client.licensing.challenge.mutate({
    installationId: identity.installationId,
  });
  const signature = await signDeviceLicenseChallenge(challenge.nonce);

  return client.licensing.activate.mutate({
    serial: normalizedSerial,
    installationId: identity.installationId,
    publicKeyPem: identity.publicKeyPem,
    challengeId: challenge.challengeId,
    signature,
  });
}

export async function validateDeviceLicense() {
  const identity = await getDeviceLicenseIdentity();
  const client = createTRPCClient();
  const challenge = await client.licensing.challenge.mutate({
    installationId: identity.installationId,
  });
  const signature = await signDeviceLicenseChallenge(challenge.nonce);

  return client.licensing.validate.mutate({
    installationId: identity.installationId,
    challengeId: challenge.challengeId,
    signature,
  });
}

export async function checkForAppUpdate(currentVersionCode: number, channel: "stable" | "beta" = "stable") {
  const client = createTRPCClient();
  const result = await client.licensing.latestRelease.query({ currentVersionCode, channel });
  if (!result.updateAvailable) return result;

  const publicKeyPem = String(Constants.expoConfig?.extra?.updateManifestPublicKey ?? "");
  if (!publicKeyPem) throw new Error("مفتاح التحقق من التحديث غير مضبوط في إصدار التطبيق.");
  const manifest = result.manifest;
  const canonicalManifest = JSON.stringify({
    version: manifest.version,
    versionCode: manifest.versionCode,
    channel: manifest.channel,
    minSupportedVersionCode: manifest.minSupportedVersionCode,
    mandatory: manifest.mandatory,
    apkUrl: manifest.apkUrl,
    sha256: manifest.sha256,
    fileSizeBytes: manifest.fileSizeBytes,
    releaseNotes: manifest.releaseNotes ?? "",
  });
  const valid = await verifySignedUpdateManifest(canonicalManifest, result.signature, publicKeyPem);
  if (!valid) throw new Error("تم رفض التحديث لأن التوقيع الرقمي للبيانات غير صالح.");
  return { ...result, signatureVerified: true as const };
}
