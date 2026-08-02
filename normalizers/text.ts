import { MAX_SUMMARY_LENGTH } from "../sources/rss/constants.js";

const HTML_TAG_PATTERN = /<[^>]*>/g;

/**
 * Strip HTML tags commonly leaked by RSS feeds into headline/summary fields.
 */
export function stripHtmlTags(text: string): string {
  return text.replace(HTML_TAG_PATTERN, "");
}

/**
 * Collapse runs of whitespace to a single space and trim ends.
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Drop invalid UTF-8 sequences by round-tripping through TextEncoder/TextDecoder.
 */
export function ensureUtf8(text: string): string {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(encoder.encode(text));
}

function normalizeField(text: string): string {
  return ensureUtf8(collapseWhitespace(stripHtmlTags(text)));
}

/**
 * Text-level normalization for Signal headline and summary.
 * No content judgment — every non-empty headline is kept as-is after cleanup.
 */
export function normalizeSignalText(
  headline: string,
  summary: string | null,
): { headline: string; summary: string | null } {
  const cleanedHeadline = normalizeField(headline);

  if (summary === null || summary === undefined) {
    return { headline: cleanedHeadline, summary: null };
  }

  let cleanedSummary = normalizeField(summary);
  if (cleanedSummary.length > MAX_SUMMARY_LENGTH) {
    cleanedSummary = cleanedSummary.slice(0, MAX_SUMMARY_LENGTH);
  }

  return {
    headline: cleanedHeadline,
    summary: cleanedSummary.length === 0 ? null : cleanedSummary,
  };
}
