import "server-only";
import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("TOTP secret is not valid base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Time-based one-time password (RFC 6238, HMAC-SHA1) — the 6-digit code an authenticator app shows. */
export function totp(secretBase32: string, atMs = Date.now(), digits = 6, periodSec = 30): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / periodSec)));
  const digest = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const o = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(o) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, "0");
}
