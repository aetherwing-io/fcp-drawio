import type { StyleSet, EdgeStyleSet } from "../types/index.js";

export function createDefaultStyle(): StyleSet {
  return {
    fillColor: null,
    strokeColor: null,
    fontColor: null,
    fontSize: null,
    fontFamily: null,
    fontStyle: null,
    rounded: false,
    dashed: false,
    shadow: false,
    opacity: 100,
    align: null,
    verticalAlign: null,
  };
}

export function createDefaultEdgeStyle(): EdgeStyleSet {
  return {
    ...createDefaultStyle(),
    edgeStyle: "orthogonalEdgeStyle",
    curved: false,
    flowAnimation: false,
    dotted: false,
  };
}
