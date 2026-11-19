import { createTRPCClient } from "@/lib/trpc";
import { getDeviceLicenseIdentity, signDeviceLicenseChallenge } from "@/lib/vision";

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
  return client.licensing.latestRelease.query({ currentVersionCode, channel });
}
