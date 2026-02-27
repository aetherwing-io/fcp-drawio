import type { StencilPack } from "./types.js";
import { AWS_PACK } from "./aws.js";
import { AZURE_PACK } from "./azure.js";
import { GCP_PACK } from "./gcp.js";
import { K8S_PACK } from "./k8s.js";
import { CISCO_PACK } from "./cisco.js";
import { IBM_PACK } from "./ibm.js";

export type { StencilEntry, StencilPack } from "./types.js";

const STENCIL_REGISTRY: Map<string, StencilPack> = new Map([
  ["aws", AWS_PACK],
  ["azure", AZURE_PACK],
  ["gcp", GCP_PACK],
  ["k8s", K8S_PACK],
  ["cisco", CISCO_PACK],
  ["ibm", IBM_PACK],
]);

export function getStencilPack(id: string): StencilPack | undefined {
  return STENCIL_REGISTRY.get(id);
}

export function listStencilPacks(): Array<{ id: string; name: string; entryCount: number }> {
  const result: Array<{ id: string; name: string; entryCount: number }> = [];
  for (const [id, pack] of STENCIL_REGISTRY) {
    result.push({ id, name: pack.name, entryCount: pack.entries.length });
  }
  return result;
}

/** Get all registered stencil pack prefixes for deserialize detection. */
export function getStencilPrefixes(): Map<string, string> {
  const prefixes = new Map<string, string>();
  for (const [id, pack] of STENCIL_REGISTRY) {
    prefixes.set(pack.prefix, id);
  }
  return prefixes;
}
