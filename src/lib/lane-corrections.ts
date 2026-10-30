import type { Point, Variant } from '../types';
import { metres } from './geometry';
export type LaneCorrection = { reviewStatus: 'pending' | 'verified'; shapeSignature: string; path: Point[]; source: string | null; reviewedAt: string | null };
export type LaneCorrectionCatalog = { schemaVersion: 1; feedVersion: string; routes: Record<string, { number: string; variants: Record<string, LaneCorrection> }> };
export function shapeSignature(path: Point[]) {
  let hash = 2166136261;
  for (const point of path) for (const coordinate of point) { const value = Math.round(coordinate * 1e6); for (let shift = 0; shift < 32; shift += 8) hash = Math.imul(hash ^ ((value >>> shift) & 255), 16777619) >>> 0; }
  return `${path.length}:${hash.toString(16)}`;
}
export function applyLaneCorrection(variant: Variant, correction?: LaneCorrection): Variant {
  if (!correction || correction.reviewStatus !== 'verified' || correction.shapeSignature !== shapeSignature(variant.path) || !correction.source?.trim() || !correction.reviewedAt || !Number.isFinite(Date.parse(correction.reviewedAt))) return variant;
  const path = correction.path;
  if (!Array.isArray(path) || path.length < 2 || path.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v)) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180)) return variant;
  if (metres(path[0], variant.path[0]) > 35 || metres(path.at(-1)!, variant.path.at(-1)!) > 35) return variant;
  return { ...variant, path, fixedGuidance: true };
}
