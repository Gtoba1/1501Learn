// Only allow same-origin paths as post-login destinations. Rejects absolute
// URLs, protocol-relative "//evil.com" and the "/\evil.com" variant browsers
// also treat as a host.
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

// Only http(s) links may be stored or rendered as hrefs, so a "javascript:"
// or "data:" URL can never become a clickable link.
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
