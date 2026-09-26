// Usage: npm run admin-hash -- "<password>"
// Prints the SHA-256 digest to store as the ADMIN_PASSWORD_HASH repo variable / VITE_ADMIN_PASSWORD_HASH.
import { createHash } from 'node:crypto';

const pw = process.argv[2];
if (!pw) {
  console.error('Usage: npm run admin-hash -- "<password>"');
  process.exit(1);
}
console.log(createHash('sha256').update(pw).digest('hex'));
