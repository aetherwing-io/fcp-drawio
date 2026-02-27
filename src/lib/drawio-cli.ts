import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { platform } from "node:os";

const CANDIDATE_PATHS: Record<string, string[]> = {
  darwin: ["/Applications/draw.io.app/Contents/MacOS/draw.io"],
  linux: ["/usr/bin/drawio", "/snap/bin/drawio", "/usr/local/bin/drawio"],
  win32: [
    "C:\\Program Files\\draw.io\\draw.io.exe",
    `${process.env.LOCALAPPDATA ?? ""}\\draw.io\\draw.io.exe`,
  ],
};

/**
 * Detect draw.io desktop CLI. Returns absolute path or null.
 * Called once at server startup.
 */
export function detectDrawioCLI(): string | null {
  const os = platform();
  const candidates = CANDIDATE_PATHS[os] ?? [];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // Fallback: try PATH lookup
  try {
    const which = os === "win32" ? "where" : "which";
    const result = execFileSync(which, ["drawio"], {
      encoding: "utf-8",
      timeout: 2000,
    }).trim();
    if (result && existsSync(result)) return result;
  } catch {
    // not on PATH
  }

  return null;
}
