import { describe, expect, it } from "vitest";
import { createLicenseSerial } from "../server/licensing";

describe("device license serials", () => {
  it("creates unique, human-readable serials with the SemenAssist prefix", () => {
    const first = createLicenseSerial();
    const second = createLicenseSerial();

    expect(first).toMatch(/^SA-(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/);
    expect(second).toMatch(/^SA-(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/);
    expect(first).not.toBe(second);
  });
});
