/** Seeded random numbers (sfc32). The same seed always gives the same run. */
export interface Rng {
  random(): number;
  /** Integer in [lo, hi). */
  int(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: T[]): T[];
}

export function createRng(seed: number | null): Rng {
  const s = seed == null ? Math.floor(Math.random() * 2 ** 32) : seed >>> 0;
  let a = 0x9e3779b9 ^ s;
  let b = 0x243f6a88 + s;
  let c = 0xb7e15162 ^ (s * 31);
  let d = 1;
  const next = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) next();
  return {
    random: next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo)),
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
  };
}
