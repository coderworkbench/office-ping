// Readable random passwords for admins to hand out, e.g. "Kp7m-Qx4z-Rt9w".
// Avoids look-alike characters (0/O, 1/l/I) so it can be read out loud.
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';

function pick(chars: string, n: number): string {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, v => chars[v % chars.length]).join('');
}

export function generatePassword(): string {
  const block = () => pick(UPPER, 1) + pick(LOWER, 1) + pick(DIGIT, 1) + pick(LOWER, 1);
  return [block(), block(), block()].join('-');
}
