/** Deterministic token proxy, including the final newline (UTF-16 code units). */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
