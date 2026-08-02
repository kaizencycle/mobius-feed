import { MAX_SUMMARY_LENGTH } from "../sources/rss/constants.js";

/** Block/line-break tags become a space before generic tag stripping. */
const BLOCK_BOUNDARY_PATTERN =
  /<\s*\/?\s*(?:p|div|li|h[1-6]|tr|td|th|blockquote|ul|ol|section|article)\b[^>]*>|<\s*br\s*\/?>/gi;

/** Only match tokens that look like HTML tags (letter after <), not "a < b". */
const HTML_TAG_PATTERN = /<\/?[a-zA-Z][^>]*>/g;

/**
 * Strip HTML tags commonly leaked by RSS feeds into headline/summary fields.
 * Preserves word boundaries across block/line-break markup.
 */
export function stripHtmlTags(text: string): string {
  const withBoundaries = text.replace(BLOCK_BOUNDARY_PATTERN, " ");
  return withBoundaries.replace(HTML_TAG_PATTERN, "");
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

/**
 * Truncate on Unicode code-point boundaries so surrogate pairs are not split.
 */
export function truncateToMaxLength(text: string, maxLength: number): string {
  const codePoints = Array.from(text);
  if (codePoints.length <= maxLength) {
    return text;
  }
  return codePoints.slice(0, maxLength).join("");
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
  if (Array.from(cleanedSummary).length > MAX_SUMMARY_LENGTH) {
    cleanedSummary = truncateToMaxLength(cleanedSummary, MAX_SUMMARY_LENGTH);
  }

  return {
    headline: cleanedHeadline,
    summary: cleanedSummary.length === 0 ? null : cleanedSummary,
  };
}
