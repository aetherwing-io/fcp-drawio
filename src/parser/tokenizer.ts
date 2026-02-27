/**
 * Re-export tokenizer functions from @aetherwing/fcp-core.
 * This file previously contained a local implementation that is now
 * provided by the framework.
 */
export {
  tokenize,
  isKeyValue,
  parseKeyValue,
  isArrow,
  isSelector,
} from "@aetherwing/fcp-core";
