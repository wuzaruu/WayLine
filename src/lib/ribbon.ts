import type { Point } from '../types';
function side(a: Point, b: Point, c: Point) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
export function crossedQuad(p: Point[]) {
  const crosses = (a: Point, b: Point, c: Point, d: Point) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
  return crosses(p[0], p[1], p[2], p[3]) || crosses(p[1], p[2], p[3], p[0]);
}
export function quadArea(p: Point[]) { return Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2); }
