import { createHash, randomBytes, randomInt } from "node:crypto";

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generatePairingCode(): string {
  return String(randomInt(100000, 1_000_000));
}

export function generateDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}
