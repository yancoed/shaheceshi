// 简易确定性 PRNG（mulberry32）— 同一 seed 永远得到相同结果
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOne<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

export function pad(n: number, w = 3): string {
  return String(n).padStart(w, '0');
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = pad(d.getHours(), 2);
  const m = pad(d.getMinutes(), 2);
  const s = pad(d.getSeconds(), 2);
  return `${h}:${m}:${s}`;
}

export function classNames(...xs: (string | false | undefined | null)[]) {
  return xs.filter(Boolean).join(' ');
}

export function randInt(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function shortId(prefix: string, n: number): string {
  return `${prefix}-${pad(n, 4)}`;
}

export function manhattan(a: { row: number; col: number }, b: { row: number; col: number }) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
