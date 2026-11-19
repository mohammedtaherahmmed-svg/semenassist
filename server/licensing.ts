import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
} from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import {
  appReleases,
  deviceActivationChallenges,
  deviceLicenses,
  licensedDevices,
} from "../drizzle/schema";
import { getDb } from "./db";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be configured with at least 32 characters`);
  }
  return value;
}

function serialDigest(serial: string): string {
  return createHmac("sha256", requiredSecret("LICENSE_SERIAL_PEPPER"))
    .update(serial.trim().toUpperCase())
    .digest("hex");
}

function normalizePem(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

export function createLicenseSerial(): string {
  const raw = randomBytes(16).toString("hex").toUpperCase();
  return `SA-${raw.match(/.{1,4}/g)?.join("-") ?? raw}`;
}

export async function issueDeviceLicense(input: {
  createdBy: string;
  expiresAt?: Date;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const serial = createLicenseSerial();
  await db.insert(deviceLicenses).values({
    serialHash: serialDigest(serial),
    status: "active",
    maxDevices: 1,
    expiresAt: input.expiresAt,
    createdBy: input.createdBy,
    notes: input.notes,
  });
  return { serial, maxDevices: 1, expiresAt: input.expiresAt ?? null };
}

export async function createActivationChallenge(installationId: string) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const challengeId = randomBytes(24).toString("hex");
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await db.insert(deviceActivationChallenges).values({
    challengeId,
    installationId,
    nonce,
    expiresAt,
  });
  return { challengeId, nonce, expiresAt };
}

export async function activateDevice(input: {
  serial: string;
  installationId: string;
  publicKeyPem: string;
  challengeId: string;
  signature: string;
  appVersion?: string;
  versionCode?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");

  const challengeRows = await db.select().from(deviceActivationChallenges).where(and(
    eq(deviceActivationChallenges.challengeId, input.challengeId),
    eq(deviceActivationChallenges.installationId, input.installationId),
    isNull(deviceActivationChallenges.consumedAt),
    gt(deviceActivationChallenges.expiresAt, new Date()),
  )).limit(1);
  const challenge = challengeRows[0];
  if (!challenge) throw new Error("طلب التفعيل انتهت صلاحيته أو سبق استخدامه");

  const publicKeyPem = normalizePem(input.publicKeyPem);
  const key = createPublicKey(publicKeyPem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("مفتاح الجهاز يجب أن يكون Ed25519");
  }
  const validProof = verify(
    null,
    Buffer.from(challenge.nonce, "base64url"),
    key,
    Buffer.from(input.signature, "base64"),
  );
  if (!validProof) throw new Error("إثبات ملكية الجهاز غير صالح");

  // Consume the challenge with a conditional update; only one request can win.
  const consumed = await db.update(deviceActivationChallenges)
    .set({ consumedAt: new Date() })
    .where(and(
      eq(deviceActivationChallenges.id, challenge.id),
      isNull(deviceActivationChallenges.consumedAt),
      gt(deviceActivationChallenges.expiresAt, new Date()),
    ));
  if (Number((consumed as unknown as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
    throw new Error("طلب التفعيل مستخدم بالفعل؛ اطلب تحديًا جديدًا");
  }

  const licenseRows = await db.select().from(deviceLicenses)
    .where(eq(deviceLicenses.serialHash, serialDigest(input.serial)))
    .limit(1);
  const license = licenseRows[0];
  if (!license || license.status !== "active") throw new Error("السيريال غير صالح أو موقوف");
  if (license.expiresAt && license.expiresAt.getTime() <= Date.now()) {
    throw new Error("انتهت صلاحية الترخيص");
  }

  const keyFingerprint = createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex");
  const existing = await db.select().from(licensedDevices)
    .where(eq(licensedDevices.installationId, input.installationId)).limit(1);
  if (existing[0]) {
    if (existing[0].licenseId !== license.id || existing[0].keyFingerprint !== keyFingerprint || existing[0].status !== "active") {
      throw new Error("هذا التثبيت مرتبط بترخيص آخر أو تم إيقافه");
    }
    await db.update(licensedDevices).set({
      appVersion: input.appVersion,
      versionCode: input.versionCode,
      lastValidatedAt: new Date(),
    }).where(eq(licensedDevices.id, existing[0].id));
    return { valid: true, deviceId: existing[0].id, licenseId: license.id };
  }

  try {
    const inserted = await db.insert(licensedDevices).values({
      licenseId: license.id,
      installationId: input.installationId,
      publicKey: publicKeyPem,
      keyFingerprint,
      platform: "android",
      appVersion: input.appVersion,
      versionCode: input.versionCode,
      status: "active",
      lastValidatedAt: new Date(),
    });
    return { valid: true, deviceId: Number((inserted as unknown as { insertId?: number }).insertId ?? 0), licenseId: license.id };
  } catch {
    // The unique licenseId constraint is the final race-safe one-device guard.
    throw new Error("هذا الترخيص مرتبط بالفعل بجهاز آخر");
  }
}

export async function validateLicensedDevice(input: {
  installationId: string;
  signature: string;
  challengeId: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const challenges = await db.select().from(deviceActivationChallenges).where(and(
    eq(deviceActivationChallenges.challengeId, input.challengeId),
    eq(deviceActivationChallenges.installationId, input.installationId),
    isNull(deviceActivationChallenges.consumedAt),
    gt(deviceActivationChallenges.expiresAt, new Date()),
  )).limit(1);
  const challenge = challenges[0];
  if (!challenge) throw new Error("طلب التحقق انتهت صلاحيته أو سبق استخدامه");

  const devices = await db.select().from(licensedDevices).where(and(
    eq(licensedDevices.installationId, input.installationId),
    eq(licensedDevices.status, "active"),
  )).limit(1);
  const device = devices[0];
  if (!device) throw new Error("الجهاز غير مسجل بترخيص");
  const licenseRows = await db.select().from(deviceLicenses).where(and(
    eq(deviceLicenses.id, device.licenseId),
    eq(deviceLicenses.status, "active"),
  )).limit(1);
  const license = licenseRows[0];
  if (!license || (license.expiresAt && license.expiresAt.getTime() <= Date.now())) {
    throw new Error("الترخيص غير نشط أو منتهي الصلاحية");
  }

  const key = createPublicKey(normalizePem(device.publicKey));
  if (!verify(null, Buffer.from(challenge.nonce, "base64url"), key, Buffer.from(input.signature, "base64"))) {
    throw new Error("إثبات ملكية الجهاز غير صالح");
  }
  const consumed = await db.update(deviceActivationChallenges).set({ consumedAt: new Date() }).where(and(
    eq(deviceActivationChallenges.id, challenge.id),
    isNull(deviceActivationChallenges.consumedAt),
    gt(deviceActivationChallenges.expiresAt, new Date()),
  ));
  if (Number((consumed as unknown as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
    throw new Error("طلب التحقق مستخدم بالفعل");
  }
  await db.update(licensedDevices).set({ lastValidatedAt: new Date() })
    .where(eq(licensedDevices.id, device.id));
  return { valid: true, licenseId: license.id, expiresAt: license.expiresAt ?? null };
}

export async function revokeDeviceLicense(licenseId: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  await db.update(deviceLicenses).set({ status: "revoked" }).where(eq(deviceLicenses.id, licenseId));
  await db.update(licensedDevices).set({ status: "revoked" }).where(eq(licensedDevices.licenseId, licenseId));
  return { success: true };
}

export async function listDeviceLicenses() {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const licenses = await db.select().from(deviceLicenses).orderBy(desc(deviceLicenses.createdAt)).limit(200);
  const devices = await db.select().from(licensedDevices).orderBy(desc(licensedDevices.activatedAt)).limit(500);
  return licenses.map((license) => ({
    id: license.id,
    status: license.status,
    maxDevices: license.maxDevices,
    expiresAt: license.expiresAt,
    notes: license.notes,
    createdAt: license.createdAt,
    devices: devices.filter((device) => device.licenseId === license.id).map((device) => ({
      id: device.id,
      installationId: device.installationId,
      keyFingerprint: device.keyFingerprint,
      appVersion: device.appVersion,
      status: device.status,
      activatedAt: device.activatedAt,
      lastValidatedAt: device.lastValidatedAt,
    })),
  }));
}

function canonicalManifest(manifest: Record<string, unknown>) {
  return JSON.stringify({
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
}

export async function publishAppRelease(input: {
  version: string;
  versionCode: number;
  channel: "stable" | "beta";
  minSupportedVersionCode: number;
  mandatory: boolean;
  apkUrl: string;
  sha256: string;
  fileSizeBytes: number;
  releaseNotes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  if (!/^https:\/\//i.test(input.apkUrl)) throw new Error("رابط APK يجب أن يستخدم HTTPS");
  if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new Error("SHA-256 غير صالح");
  if (!Number.isSafeInteger(input.fileSizeBytes) || input.fileSizeBytes <= 0) throw new Error("حجم APK غير صالح");
  const manifest = { ...input, mandatory: input.mandatory };
  const privateKeyPem = process.env.UPDATE_MANIFEST_PRIVATE_KEY;
  if (!privateKeyPem) throw new Error("UPDATE_MANIFEST_PRIVATE_KEY غير مضبوط على الخادم");
  const signature = sign(null, Buffer.from(canonicalManifest(manifest)), createPrivateKey(normalizePem(privateKeyPem))).toString("base64");
  await db.update(appReleases).set({ isActive: 0 }).where(eq(appReleases.channel, input.channel));
  await db.insert(appReleases).values({
    version: input.version,
    versionCode: input.versionCode,
    channel: input.channel,
    minSupportedVersionCode: input.minSupportedVersionCode,
    isMandatory: input.mandatory ? 1 : 0,
    apkUrl: input.apkUrl,
    sha256: input.sha256.toLowerCase(),
    fileSizeBytes: input.fileSizeBytes,
    manifestSignature: signature,
    releaseNotes: input.releaseNotes ?? "",
    isActive: 1,
    publishedAt: new Date(),
  });
  return { success: true, version: input.version, versionCode: input.versionCode, signature };
}

export async function getLatestAppRelease(input: { currentVersionCode: number; channel: "stable" | "beta" }) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const rows = await db.select().from(appReleases).where(and(
    eq(appReleases.channel, input.channel),
    eq(appReleases.isActive, 1),
  )).orderBy(desc(appReleases.versionCode)).limit(1);
  const release = rows[0];
  if (!release || release.versionCode <= input.currentVersionCode) return { updateAvailable: false };
  return {
    updateAvailable: true,
    manifest: {
      version: release.version,
      versionCode: release.versionCode,
      channel: release.channel,
      minSupportedVersionCode: release.minSupportedVersionCode,
      mandatory: Boolean(release.isMandatory),
      apkUrl: release.apkUrl,
      sha256: release.sha256,
      fileSizeBytes: release.fileSizeBytes,
      releaseNotes: release.releaseNotes ?? "",
    },
    signature: release.manifestSignature,
  };
}
