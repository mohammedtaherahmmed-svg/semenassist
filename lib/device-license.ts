import Constants from "expo-constants";
import { createTRPCClient } from "@/lib/trpc";
import { getDeviceLicenseIdentity, getNativeUpdateDownloadStatus, installNativeVerifiedApk, signDeviceLicenseChallenge, startNativeUpdateDownload, verifySignedUpdateManifest } from "@/lib/vision";

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
  if (!result.manifest || !result.signature) {
    throw new Error("بيانات التحديث غير مكتملة؛ تم رفض التحديث.");
  }

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

export type VerifiedAppUpdate = Extract<
  Awaited<ReturnType<typeof checkForAppUpdate>>,
  { updateAvailable: true }
> & { signatureVerified: true };

export async function startVerifiedAppUpdateDownload(update: VerifiedAppUpdate) {
  if (!update.signatureVerified) throw new Error("بيانات التحديث لم تجتز التحقق الرقمي.");
  return startNativeUpdateDownload(update.manifest.apkUrl, update.manifest.sha256);
}

export async function getAppUpdateDownloadProgress(downloadId: number) {
  return getNativeUpdateDownloadStatus(downloadId);
}

export async function installVerifiedAppUpdate(downloadId: number, update: VerifiedAppUpdate) {
  if (!update.signatureVerified) throw new Error("بيانات التحديث لم تجتز التحقق الرقمي.");
  const status = await getNativeUpdateDownloadStatus(downloadId);
  if (status.state !== "downloaded") throw new Error("يجب اكتمال تنزيل التحديث أولًا.");
  return installNativeVerifiedApk(downloadId, update.manifest.sha256);
}
