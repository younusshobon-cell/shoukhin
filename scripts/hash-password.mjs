// Generates the ADMIN_PASSWORD_HASH value for the Pages environment.
// Usage: npm run hash-password -- "your password here"
import { webcrypto as crypto } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let password = process.argv[2];
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('New dashboard password: ');
  rl.close();
}
if (!password || password.length < 10) {
  console.error('\nUse at least 10 characters. A short password on a public URL is not worth much.');
  process.exit(1);
}

const iterations = 100000;
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);

console.log('\nSet this as ADMIN_PASSWORD_HASH in your Pages project (mark it Encrypted):\n');
console.log(`pbkdf2$${iterations}$${b64url(salt)}$${b64url(bits)}\n`);
console.log('Also set SESSION_SECRET to a long random string, for example:');
console.log(b64url(crypto.getRandomValues(new Uint8Array(32))) + '\n');
