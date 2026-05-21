import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DATA_DIR_NAME = "x-follow-report";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");

export function resolveUserDataRoot(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
}

export function resolveDataDir(): string {
  const override = process.env.X_FOLLOW_REPORT_DATA_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(PROJECT_ROOT, ".x-follow-report");
}

export function resolveConsentPath(): string {
  const override = process.env.X_FOLLOW_REPORT_CONSENT_PATH?.trim();
  if (override) return path.resolve(override);
  return path.join(resolveDataDir(), "consent.json");
}

export function resolveCookiePath(): string {
  const override = process.env.X_COOKIE_PATH?.trim() || process.env.X_FOLLOW_REPORT_COOKIE_PATH?.trim();
  if (override) return path.resolve(override);
  return path.join(resolveDataDir(), "cookies.json");
}

export function resolveChromeProfileDir(): string {
  const override = process.env.X_CHROME_PROFILE_DIR?.trim() || process.env.X_FOLLOW_REPORT_CHROME_PROFILE_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(resolveDataDir(), "chrome-profile");
}
