import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { angle, heading, metres, pointAt, prepare, project } from './geometry';
import type { Variant } from '../types';
test('Geodesic distances and headings agree at Edmonton latitude', () => {
  assert.ok(Math.abs(metres([53.5, -113.5], [53.501, -113.5]) - 111.195) < 1);
  assert.equal(heading([53.5, -113.5], [53.501, -113.5]), 0);
  assert.ok(Math.abs(heading([53.5, -113.5], [53.5, -113.499]) - 90) < .1);
  assert.equal(angle(350, 10), 20); assert.equal(angle(10, 350), -20);
});
test('Projection can distinguish repeated points on a looping route', () => {
  const path: [number, number][] = [[53.5, -113.5], [53.501, -113.5], [53.501, -113.499], [53.5, -113.499], [53.5, -113.5]];
  const cumulative = [0]; path.slice(1).forEach((p, i) => cumulative.push(cumulative.at(-1)! + metres(path[i], p)));
  assert.equal(project(path[0], path, cumulative).distance, 0);
  assert.ok(project(path[0], path, cumulative, 250).distance > 300);
  assert.deepEqual(pointAt(path, cumulative, -1), path[0]);
  assert.deepEqual(pointAt(path, cumulative, 1e6), path.at(-1));
});
for (const id of ['004', '914', '926']) test(`Route ${id}: every direction has ordered stops, usable geometry and scheduled time`, () => {
  const data = JSON.parse(fs.readFileSync(`public/data/${id}.json`, 'utf8'));
  for (const v of data.variants as Variant[]) {
    const r = prepare(v);
    assert.ok(r.total > 1000); assert.ok(r.durationSeconds > 60);
    assert.ok(r.stops.length >= 2); assert.equal(r.stops[0].distance, 0); assert.equal(r.stops.at(-1)!.distance, r.total);
    r.stops.forEach((s, i) => { assert.ok(Number.isFinite(s.distance)); if (i) assert.ok(s.distance! >= r.stops[i - 1].distance!); });
    assert.ok(r.instructions.length > 0); assert.equal(r.instructions.at(-1)!.maneuver, 'arrive');
    for (let d = 0; d < r.total; d += 100) assert.ok(pointAt(r.path, r.cumulative, d).every(Number.isFinite));
  }
});
