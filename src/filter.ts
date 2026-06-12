/**
 * Minimal glob matcher supporting `*` (any run of characters) and `?` (single
 * character). Matching is case-insensitive, which suits variable names well.
 * Kept dependency-free on purpose so the bundled action stays small.
 */
export function globToRegExp(pattern: string): RegExp {
  let out = '^'
  for (const ch of pattern) {
    if (ch === '*') {
      out += '.*'
    } else if (ch === '?') {
      out += '.'
    } else {
      // Escape everything else so it is matched literally.
      out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  out += '$'
  return new RegExp(out, 'i')
}

function matchesAny(name: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegExp(p).test(name))
}

/**
 * Decide whether a variable name survives the include/exclude filters.
 * - Empty `include` means "include everything".
 * - `exclude` always wins over `include`.
 */
export function isAllowed(name: string, include: string[], exclude: string[]): boolean {
  if (include.length > 0 && !matchesAny(name, include)) {
    return false
  }
  if (exclude.length > 0 && matchesAny(name, exclude)) {
    return false
  }
  return true
}
