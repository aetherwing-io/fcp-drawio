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

export type ExportFormat = "png" | "svg" | "pdf";

export interface ExportOptions {
  cliPath: string;
  diagramXml: string;
  format?: ExportFormat;    // default "png"
  width?: number;           // default 1200
  height?: number;          // optional, auto-aspect if omitted
  page?: number;            // 1-based, default 1
  outputPath?: string;      // if set, persist to this path
}

const MIME_TYPES: Record<ExportFormat, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export interface ExportResult {
  base64: string;
  mimeType: string;
  width: number;
  sizeBytes: number;
  filePath?: string;        // set when outputPath was provided
}

/**
 * Render a diagram to PNG/SVG/PDF via draw.io CLI.
 * Writes temp files, exports, reads result, cleans up.
 */
export async function renderExport(options: ExportOptions): Promise<ExportResult> {
  const { cliPath, diagramXml, format = "png", width = 1200, height, page = 1, outputPath } = options;
  const id = randomBytes(6).toString("hex");
  const inputPath = join(tmpdir(), `drawio-export-${id}.drawio`);
  const destPath = outputPath ?? join(tmpdir(), `drawio-export-${id}.${format}`);
  const needsCleanup = !outputPath; // only clean up temp output, not user-specified path

  try {
    writeFileSync(inputPath, diagramXml, "utf-8");

    const args = [
      "--export",
      "--format", format,
      "--width", String(width),
      "--crop",
      "--border", "10",
      "--page-index", String(page), // CLI is 1-based, same as our API
      "--output", destPath,
      inputPath,
    ];
    if (height !== undefined) {
      args.splice(args.indexOf("--crop"), 0, "--height", String(height));
    }

    await new Promise<void>((resolve, reject) => {
      execFile(
        cliPath,
        args,
        { timeout: 15_000 },
        (error) => {
          if (error) reject(new Error(`draw.io export failed: ${error.message}`));
          else resolve();
        },
      );
    });

    const outputBuffer = readFileSync(destPath);
    const base64 = outputBuffer.toString("base64");

    return {
      base64,
      mimeType: MIME_TYPES[format],
      width,
      sizeBytes: outputBuffer.length,
      filePath: outputPath ?? undefined,
    };
  } finally {
    try { unlinkSync(inputPath); } catch { /* cleaned up */ }
    if (needsCleanup) {
      try { unlinkSync(destPath); } catch { /* cleaned up */ }
    }
  }
}
