// Friendly, unambiguous alphabet: no 0/O or 1/I/l confusion.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// Largest multiple of the alphabet size that fits in a byte (248 for 31
// characters). Bytes at or above it are thrown away so every character is
// equally likely; a plain `byte % 31` would favor the first few letters.
const UNBIASED_LIMIT = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

/**
 * A random room invite code. Uses the Web Crypto API rather than
 * Math.random(), which isn't cryptographically secure and shouldn't be used
 * for anything that works as a key. Joining still requires the database to
 * confirm the code (join_room_by_code, migration 22).
 */
export function generateInviteCode(length = 7): string {
  const chars: string[] = [];
  const byte = new Uint8Array(1);
  while (chars.length < length) {
    crypto.getRandomValues(byte);
    if (byte[0] < UNBIASED_LIMIT) chars.push(ALPHABET[byte[0] % ALPHABET.length]);
  }
  return chars.join("");
}
