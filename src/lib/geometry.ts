import type { Instruction, Point, PreparedRoute, Variant } from '../types';
const rad = Math.PI / 180;
export function metres(a: Point, b: Point) {
  const dlat = (b[0] - a[0]) * rad, dlng = (b[1] - a[1]) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dlng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function heading(a: Point, b: Point) {
  const d = (b[1] - a[1]) * rad;
  return (Math.atan2(Math.sin(d) * Math.cos(b[0] * rad), Math.cos(a[0] * rad) * Math.sin(b[0] * rad) - Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos(d)) / rad + 360) % 360;
}
export const angle = (a: number, b: number) => ((b - a + 540) % 360) - 180;
export function pointAt(path: Point[], cumulative: number[], d: number): Point {
  if (!path.length) throw new Error('Route has no path');
  if (d <= 0) return path[0]; if (d >= cumulative.at(-1)!) return path.at(-1)!;
  let lo = 0, hi = path.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < d) lo = mid + 1; else hi = mid; }
  const i = Math.max(1, lo), span = cumulative[i] - cumulative[i - 1], t = span ? (d - cumulative[i - 1]) / span : 0;
  return [path[i - 1][0] + t * (path[i][0] - path[i - 1][0]), path[i - 1][1] + t * (path[i][1] - path[i - 1][1])];
}
export function project(p: Point, path: Point[], cumulative: number[], min = 0, max = Infinity) {
  let best = { distance: 0, away: Infinity, point: path[0] };
  const scale = Math.cos(p[0] * rad);
  for (let i = 1; i < path.length; i++) {
    if (cumulative[i] < min || cumulative[i - 1] > max) continue;
    const a = path[i - 1], b = path[i], x = (b[1] - a[1]) * scale, y = b[0] - a[0];
    const t = Math.max(0, Math.min(1, (((p[1] - a[1]) * scale) * x + (p[0] - a[0]) * y) / (x * x + y * y || 1)));
    const q: Point = [a[0] + t * y, a[1] + t * (b[1] - a[1])]; const away = metres(p, q);
    if (away < best.away) best = { point: q, away, distance: cumulative[i - 1] + t * (cumulative[i] - cumulative[i - 1]) };
  }
  return best;
}
export function prepare(v: Variant): PreparedRoute {
  const cumulative = [0]; for (let i = 1; i < v.path.length; i++) cumulative.push(cumulative[i - 1] + metres(v.path[i - 1], v.path[i]));
  const total = cumulative.at(-1)!;
  let last = 0;
  const stops = v.stops.map((s, i) => {
    const p = project([s.lat, s.lng], v.path, cumulative, Math.max(0, last - 10));
    const distance = i === 0 ? 0 : i === v.stops.length - 1 ? total : Math.max(last, p.distance);
    last = distance; return { ...s, distance };
  });
  const instructions: Instruction[] = [];
  for (let d = 40; d < total - 40; d += 12) {
    const before = heading(pointAt(v.path, cumulative, d - 32), pointAt(v.path, cumulative, d - 5));
    const after = heading(pointAt(v.path, cumulative, d + 5), pointAt(v.path, cumulative, d + 32));
    const turn = angle(before, after);
    if (Math.abs(turn) > 48 && d - (instructions.at(-1)?.distance || -100) > 85) {
      instructions.push({ distance: d, text: `Turn ${turn > 0 ? 'right' : 'left'} to follow the route`, maneuver: turn > 0 ? 'right' : 'left', source: 'shape' });
      d += 50;
    }
  }
  instructions.push({ distance: total, text: `Arrive at ${stops.at(-1)?.name || 'the final stop'}`, maneuver: 'arrive', source: 'shape' });
  return { ...v, stops, cumulative, total, instructions };
}
export function distanceLabel(d: number) { return d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(d / 10) * 10)} m`; }
