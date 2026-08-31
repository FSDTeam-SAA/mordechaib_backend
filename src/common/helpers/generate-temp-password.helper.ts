import { randomInt } from 'crypto';

// Ambiguous-looking characters (0/O, 1/l/I) are excluded so a password read
// off an email is easy to retype correctly.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(charset: string): string {
  return charset[randomInt(0, charset.length)];
}

/**
 * Generates a random temporary password containing at least one uppercase,
 * lowercase, digit, and symbol character, suitable for emailing to a newly
 * invited team member on first setup.
 */
export function generateTempPassword(length = 12): string {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: Math.max(length - required.length, 0) }, () =>
    pick(ALL),
  );

  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
