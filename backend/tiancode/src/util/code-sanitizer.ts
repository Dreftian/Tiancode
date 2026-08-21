/**
 * Code Sanitizer & Zero-Width Watermark Remover for Tiancode
 * Inspired by guillaumemeyer/watermarks-remover
 * 
 * Automatically strips:
 * - Invisible Unicode characters (zero-width space, non-joiners, soft hyphens)
 * - Byte Order Marks (\uFEFF)
 * - Trailing/exotic invisible whitespace
 * - Suspicious control characters that break compilers and linters
 */

export namespace CodeSanitizer {
  // Regex matching invisible zero-width and control characters
  const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u00AD\u2060-\u2064]/g

  // Non-standard exotic whitespace replaced with standard spaces
  const EXOTIC_SPACES_REGEX = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g

  export interface SanitizeResult {
    content: string
    strippedCount: number
    hasModifications: boolean
  }

  /**
   * Sanitizes source code or text content by removing invisible markers
   */
  export function sanitize(input: string): SanitizeResult {
    if (!input || typeof input !== "string") {
      return { content: input, strippedCount: 0, hasModifications: false }
    }

    let strippedCount = 0

    // Count zero-width characters
    const matches = input.match(ZERO_WIDTH_REGEX)
    if (matches) {
      strippedCount = matches.length
    }

    // 1. Strip zero-width and invisible control characters
    let cleaned = input.replace(ZERO_WIDTH_REGEX, "")

    // 2. Normalize exotic unicode spaces into regular ASCII spaces
    cleaned = cleaned.replace(EXOTIC_SPACES_REGEX, " ")

    return {
      content: cleaned,
      strippedCount,
      hasModifications: cleaned !== input,
    }
  }

  /**
   * Strip provenance and metadata tags from text or markdown
   */
  export function stripProvenanceTags(text: string): string {
    return text
      .replace(/<!--\s*ai-provenance:.*?-->/gi, "")
      .replace(/<!--\s*c2pa:.*?-->/gi, "")
      .trim()
  }
}
