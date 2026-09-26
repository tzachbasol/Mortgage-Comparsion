/**
 * Admin gate for the static site.
 *
 * The expected password is supplied at build time as a SHA-256 hex digest in
 * VITE_ADMIN_PASSWORD_HASH (GitHub repo variable ADMIN_PASSWORD_HASH, or .env.local).
 * This only hides the admin view: on a static site the underlying data files are
 * still publicly downloadable, so real secrecy requires a private repo + protected hosting.
 */
export const ADMIN_HASH: string = (import.meta.env.VITE_ADMIN_PASSWORD_HASH ?? '').trim().toLowerCase();

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function checkPassword(password: string, expectedHash = ADMIN_HASH): Promise<boolean> {
  if (!expectedHash) return false;
  return (await sha256Hex(password)) === expectedHash;
}
