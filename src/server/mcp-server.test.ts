import { describe, it, expect } from "vitest";
import { createServer } from "./mcp-server.js";

describe("MCP Server — createServer", () => {
  it("creates server and intent layer successfully", () => {
    const { server, intent } = createServer();
    expect(server).toBeDefined();
    expect(intent).toBeDefined();
  });

  it("intent.getHelp() returns model map text", () => {
    const { intent } = createServer();
    const help = intent.getHelp();
    expect(typeof help).toBe("string");
    expect(help.length).toBeGreaterThan(0);
  });

  it("intent.getHelp() contains NODE TYPES section", () => {
    const { intent } = createServer();
    const help = intent.getHelp();
    expect(help).toContain("NODE TYPES:");
    expect(help).toContain("svc");
    expect(help).toContain("db");
    expect(help).toContain("api");
    expect(help).toContain("queue");
    expect(help).toContain("cloud");
    expect(help).toContain("actor");
  });

  it("intent.getHelp() contains THEMES section", () => {
    const { intent } = createServer();
    const help = intent.getHelp();
    expect(help).toContain("THEMES");
    expect(help).toContain("blue");
    expect(help).toContain("red");
    expect(help).toContain("green");
    expect(help).toContain("purple");
  });

  it("intent.getHelp() contains OPERATIONS section", () => {
    const { intent } = createServer();
    const help = intent.getHelp();
    expect(help).toContain("OPERATIONS:");
    expect(help).toContain("add");
    expect(help).toContain("connect");
    expect(help).toContain("style");
    expect(help).toContain("define");
  });

  it("intent.getHelp() contains SELECTORS section", () => {
    const { intent } = createServer();
    const help = intent.getHelp();
    expect(help).toContain("SELECTORS:");
    expect(help).toContain("@type:TYPE");
    expect(help).toContain("@group:NAME");
    expect(help).toContain("@all");
  });

  it("intent.getHelp() includes custom types after define", () => {
    const { intent } = createServer();
    intent.executeOps(["define my-svc base:svc theme:green badge:OK"]);
    const help = intent.getHelp();
    expect(help).toContain("CUSTOM TYPES:");
    expect(help).toContain("my-svc");
  });
});
