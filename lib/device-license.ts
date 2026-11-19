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

export type VerifiedAppUpdate = {
  updateAvailable: true;
  manifest: {
    version: string;
    versionCode: number;
    channel: "stable" | "beta";
    minSupportedVersionCode: number;
    mandatory: boolean;
    apkUrl: string;
    sha256: string;
    fileSizeBytes: number;
    releaseNotes: string;
  };
  signature: string;
  signatureVerified: true;
};

export async function checkForAppUpdate(
  currentVersionCode: number,
  channel: "stable" | "beta" = "stable",
): Promise<{ updateAvailable: false } | VerifiedAppUpdate> {
  const client = createTRPCClient();
  const result = await client.licensing.latestRelease.query({ currentVersionCode, channel });
  if (!result.updateAvailable) return { updateAvailable: false };
  if (!result.manifest || !result.signature) {
    throw new Error("بيانات التحديث غير مكتملة؛ تم رفض التحديث.");
  }

  const publicKeyPem = String(Constants.expoConfig?.extra?.updateManifestPublicKey ?? "");
  if (!publicKeyPem) throw new Error("مفتاح التحقق من التحديث غير مضبوط في إصدار التطبيق.");
  const manifest = result.manifest;
  const signature = result.signature;
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
  const valid = await verifySignedUpdateManifest(canonicalManifest, signature, publicKeyPem);
  if (!valid) throw new Error("تم رفض التحديث لأن التوقيع الرقمي للبيانات غير صالح.");
  return { updateAvailable: true, manifest, signature, signatureVerified: true };
}


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
