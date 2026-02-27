import { existsSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { execFileSync, execFile } from "node:child_process";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

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

export interface SnapshotOptions {
  cliPath: string;
  diagramXml: string;
  width?: number;  // default 1200
  page?: number;   // 1-based, default 1
}

export interface SnapshotResult {
  base64: string;
  mimeType: "image/png";
  width: number;
  sizeBytes: number;
}

/**
 * Render a diagram to PNG via draw.io CLI.
 * Writes temp files, exports, reads result, cleans up.
 */
export async function renderSnapshot(options: SnapshotOptions): Promise<SnapshotResult> {
  const { cliPath, diagramXml, width = 1200, page = 1 } = options;
  const id = randomBytes(6).toString("hex");
  const inputPath = join(tmpdir(), `drawio-snapshot-${id}.drawio`);
  const outputPath = join(tmpdir(), `drawio-snapshot-${id}.png`);

  try {
    writeFileSync(inputPath, diagramXml, "utf-8");

    await new Promise<void>((resolve, reject) => {
      execFile(
        cliPath,
        [
          "--export",
          "--format", "png",
          "--width", String(width),
          "--crop",
          "--border", "10",
          "--page-index", String(page - 1), // CLI is 0-based, API is 1-based
          "--output", outputPath,
          inputPath,
        ],
        { timeout: 15_000 },
        (error) => {
          if (error) reject(new Error(`draw.io export failed: ${error.message}`));
          else resolve();
        },
      );
    });

    const pngBuffer = readFileSync(outputPath);
    const base64 = pngBuffer.toString("base64");

    return {
      base64,
      mimeType: "image/png",
      width,
      sizeBytes: pngBuffer.length,
    };
  } finally {
    try { unlinkSync(inputPath); } catch { /* cleaned up */ }
    try { unlinkSync(outputPath); } catch { /* cleaned up */ }
  }
}
