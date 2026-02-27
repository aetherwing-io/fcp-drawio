import { describe, it, expect } from "vitest";
import { detectDrawioCLI } from "./drawio-cli.js";

describe("detectDrawioCLI", () => {
  it("returns a string path or null", () => {
    const result = detectDrawioCLI();
    // On CI this may be null; on dev machines with draw.io, a string
    expect(result === null || typeof result === "string").toBe(true);
  });

  it("returned path ends with expected binary name if found", () => {
    const result = detectDrawioCLI();
    if (result !== null) {
      // Should end with draw.io or drawio (platform-dependent)
      expect(result).toMatch(/draw(\.io|io)/);
    }
  });
});
