/**
 * Maximum length for RSS summary text after adapter extraction.
 * PR-003 RSS adapters must cap summaries to this value before insert;
 * the normalization pipeline (PR-004) applies the same cap when cleaning
 * headline/summary so both layers stay aligned.
 */
export const MAX_SUMMARY_LENGTH = 5000;
