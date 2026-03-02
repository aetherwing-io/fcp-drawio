/**
 * Re-export tokenizer functions from @aetherwing/fcp-core.
 * This file previously contained a local implementation that is now
 * provided by the framework.
 */
export {
  tokenize,
  tokenizeWithMeta,
  type TokenMeta,
  isKeyValue,
  parseKeyValue,
  parseKeyValueWithMeta,
  isArrow,
  isSelector,
} from "@aetherwing/fcp-core";
