import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceHeading, cameraAnchor, groundProjection, guidancePoint, routeFollowHeading, shiftPoint } from './camera';
import { angle } from './geometry';
import { prepare } from './geometry';
import type { Point } from '../types';
const origin: Point = [53.55, -113.5];
test('A camera on the right lane anchors the ribbon straight ahead instead of in the left lane', () => {
  const path: Point[] = [shiftPoint(origin, 180, 50), origin, shiftPoint(origin, 0, 120)];
  const route = prepare({ id: 'lane', direction: '0', headsign: 'North', stops: [], path, durationSeconds: 60 });
  const position = shiftPoint(origin, 90, 3.5);
  const anchor = cameraAnchor(route, position, 50);
  assert.ok(anchor.reliable); assert.ok(Math.abs(anchor.lateral - 3.5) < .02);
  const onLane = shiftPoint(shiftPoint(origin, 0, 35), 90, anchor.lateral);
  const pixel = groundProjection(onLane, { position, heading: anchor.direction, pitch: -2, zoom: 1 }, 390, 600)!;
  assert.ok(Math.abs(pixel[0] - 195) < .1);
  const centreLinePixel = groundProjection(shiftPoint(origin, 0, 35), { position, heading: 0, pitch: -2, zoom: 1 }, 390, 600)!;
  assert.ok(centreLinePixel[0] < pixel[0] - 10);
});
test('Left and right turns project on the correct side of the screen', () => {
  const camera = { position: origin, heading: 0, pitch: -2, zoom: 1 };
  const ahead = shiftPoint(origin, 0, 30);
  assert.ok(groundProjection(shiftPoint(ahead, 90, 12), camera, 1000, 600)![0] > 500);
  assert.ok(groundProjection(shiftPoint(ahead, 270, 12), camera, 1000, 600)![0] < 500);
  assert.equal(groundProjection(shiftPoint(origin, 180, 30), camera, 1000, 600), null);
});
test('The camera heading follows the actual panorama after an intersection', () => {
  const corner = shiftPoint(origin, 0, 40);
  const route = prepare({ id: 'turn', direction: '0', headsign: 'East', stops: [], path: [origin, corner, shiftPoint(corner, 90, 70)], durationSeconds: 60 });
  const actual = shiftPoint(shiftPoint(corner, 90, 15), 180, 3);
  const anchor = cameraAnchor(route, actual, 35);
  assert.ok(Math.abs(anchor.direction - 90) < 1);
  assert.ok(anchor.distance > 50); assert.ok(anchor.lateral > 2.8);
});
test('A panorama far from the route is rejected rather than drawing across another road', () => {
  const route = prepare({ id: 'far', direction: '0', headsign: '', stops: [], path: [origin, shiftPoint(origin, 0, 100)], durationSeconds: 60 });
  assert.equal(cameraAnchor(route, shiftPoint(origin, 90, 40), 0).reliable, false);
});
test('The view follows the road at the displayed photo instead of turning ahead of the imagery', () => {
  const corner = shiftPoint(origin, 0, 10);
  const route = prepare({ id: 'small-turn', direction: '0', headsign: '', stops: [], path: [origin, corner, shiftPoint(corner, 90, 40)], durationSeconds: 30 });
  assert.ok(Math.abs(routeFollowHeading(route, 15, 0)) < 1);
  assert.ok(Math.abs(routeFollowHeading(route, 7, 22) - 90) < 1);
});
test('Heading interpolation takes the short path across north', () => {
  const next = advanceHeading(359, 1, .1);
  assert.ok(angle(359, next) > 0 && angle(359, next) < 2);
  assert.ok(Math.abs(angle(next, 1)) < Math.abs(angle(359, 1)));
});
test('Heading interpolation limits rotation speed', () => {
  assert.ok(Math.abs(angle(0, advanceHeading(0, 170, .016))) <= 90 * .016 + .001);
});
test('The right-side guidance stays on the same road position with cameras in either lane', () => {
  const route = prepare({ id: 'sides', direction: '0', headsign: '', stops: [], path: [origin, shiftPoint(origin, 0, 100)], durationSeconds: 60 });
  const world = guidancePoint(route, 35);
  const leftCamera = { position: shiftPoint(origin, 270, 4), heading: 0, pitch: -2, zoom: 1 };
  const rightCamera = { ...leftCamera, position: shiftPoint(origin, 90, 4) };
  assert.ok(world[1] > origin[1]);
  assert.ok(groundProjection(world, leftCamera, 1000, 600)![0] > 500);
  assert.ok(groundProjection(world, rightCamera, 1000, 600)![0] < 500);
  assert.deepEqual(guidancePoint(route, 35), world);
  const reviewed = { ...route, fixedGuidance: true };
  assert.ok(Math.abs(guidancePoint(reviewed, 35)[1] - origin[1]) < 1e-9);
});
test('Looking around moves a fixed road point across the image instead of moving its world position', () => {
  const world = shiftPoint(origin, 0, 35);
  const forward = groundProjection(world, { position: origin, heading: 0, pitch: -2, zoom: 1 }, 1000, 600)!;
  const lookingRight = groundProjection(world, { position: origin, heading: 35, pitch: -2, zoom: 1 }, 1000, 600)!;
  assert.ok(Math.abs(forward[0] - 500) < .1); assert.ok(lookingRight[0] < 200);
  assert.equal(groundProjection(world, { position: origin, heading: 180, pitch: -2, zoom: 1 }, 1000, 600), null);
});
