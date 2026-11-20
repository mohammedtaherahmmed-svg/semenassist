import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const STORAGE_KEY = "semenassist:diagnostics:v1";
const MAX_ENTRIES = 250;

export type DiagnosticEntry = {
  id: string;
  timestamp: string;
  level: "info" | "error";
  event: string;
  message?: string;
  stack?: string;
  fatal?: boolean;
  platform: string;
};

let writeQueue: Promise<void> = Promise.resolve();
let installed = false;

function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/(access_token|refresh_token|authorization|password|secret)=([^&\s]+)/gi, "$1=[REDACTED]")
    .slice(0, 12000);
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: redact(error.message || error.name), stack: error.stack ? redact(error.stack) : undefined };
  }
  return { message: redact(typeof error === "string" ? error : JSON.stringify(error) ?? String(error)) };
}

export function recordDiagnostic(event: string, error?: unknown, fatal = false): Promise<void> {
  const detail = error === undefined ? undefined : describe(error);
  const entry: DiagnosticEntry = {
    id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
    timestamp: new Date().toISOString(),
    level: error === undefined ? "info" : "error",
    event: redact(event),
    message: detail?.message,
    stack: detail?.stack,
    fatal,
    platform: Platform.OS + " " + String(Platform.Version),
  };

  writeQueue = writeQueue.then(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const previous: DiagnosticEntry[] = raw ? JSON.parse(raw) : [];
      const next = [...previous, entry].slice(-MAX_ENTRIES);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Diagnostics must never crash or block the application.
    }
  }).catch(() => undefined);

  return writeQueue;
}

export async function readDiagnostics(): Promise<DiagnosticEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DiagnosticEntry[]) : [];
  } catch {
    return [];
  }
}

export async function clearDiagnostics(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function installGlobalErrorHandlers(): void {
  if (installed || Platform.OS === "web") return;
  installed = true;

  const runtime = globalThis as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
      setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
  };
  const previousHandler = runtime.ErrorUtils?.getGlobalHandler?.();

  runtime.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
    void recordDiagnostic("javascript.global-error", error, Boolean(isFatal)).finally(() => {
      previousHandler?.(error, isFatal);
    });
  });

  void recordDiagnostic("diagnostics.installed");
}
