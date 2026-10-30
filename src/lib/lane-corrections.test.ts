import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLaneCorrection, shapeSignature, type LaneCorrection } from './lane-corrections';
import type { Variant } from '../types';
const variant: Variant = { id: '0', direction: '0', headsign: '', stops: [], durationSeconds: 60, path: [[53.5, -113.5], [53.501, -113.5]] };
const profile: LaneCorrection = { reviewStatus: 'verified', shapeSignature: shapeSignature(variant.path), path: [[53.5, -113.49998], [53.501, -113.49998]], source: 'Provided lane survey', reviewedAt: '2026-10-30' };
test('Only reviewed lane geometry with a matching source shape is applied', () => {
  assert.equal(applyLaneCorrection(variant, { ...profile, reviewStatus: 'pending' }), variant);
  assert.equal(applyLaneCorrection(variant, { ...profile, shapeSignature: 'old' }), variant);
  assert.equal(applyLaneCorrection(variant, { ...profile, source: null }), variant);
  assert.deepEqual(applyLaneCorrection(variant, profile).path, profile.path);
  assert.equal(applyLaneCorrection(variant, profile).fixedGuidance, true);
});
test('Invalid or misplaced cached geometry does not replace the official route', () => {
  assert.equal(applyLaneCorrection(variant, { ...profile, path: [[0, 0], [1, 1]] }), variant);
  assert.equal(applyLaneCorrection(variant, { ...profile, path: [[NaN, -113.5], [53.501, -113.5]] }), variant);
});
