export { normalizeSignalText, stripHtmlTags, collapseWhitespace, ensureUtf8 } from "./text.js";
export {
  claimNewSignals,
  normalizeClaimedSignal,
  processNormalizationBatch,
  runNormalizationPipeline,
  type NewSignalRow,
  type NormalizeBatchResult,
} from "./pipeline.js";
export {
  NORMALIZATION_PIPELINE_VERSION,
  SIGNAL_SCHEMA_VERSION,
} from "./version.js";
