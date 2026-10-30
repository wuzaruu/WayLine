import { heading, pointAt, project } from './geometry';
import type { Point, PreparedRoute } from '../types';
export type Camera = { position: Point; heading: number; pitch: number; zoom: number };
export function shiftPoint(point: Point, bearing: number, metres: number): Point {
  const r = bearing * Math.PI / 180;
  return [point[0] + Math.cos(r) * metres / 111320, point[1] + Math.sin(r) * metres / (111320 * Math.cos(point[0] * Math.PI / 180))];
}
export function cameraAnchor(route: PreparedRoute, position: Point, distance: number) {
  const match = project(position, route.path, route.cumulative, Math.max(0, distance - 65), Math.min(route.total, distance + 85));
  const direction = heading(pointAt(route.path, route.cumulative, Math.max(0, match.distance - 3)), pointAt(route.path, route.cumulative, Math.min(route.total, match.distance + 7)));
  const r = direction * Math.PI / 180;
  const east = (position[1] - match.point[1]) * 111320 * Math.cos(position[0] * Math.PI / 180);
  const north = (position[0] - match.point[0]) * 111320;
  const lateral = Math.max(-12, Math.min(12, east * Math.cos(r) - north * Math.sin(r)));
  return { distance: match.distance, direction, lateral, reliable: match.away < 12 };
}
export function groundProjection(point: Point, camera: Camera, width: number, height: number): Point | null {
  const yaw = camera.heading * Math.PI / 180, pitch = camera.pitch * Math.PI / 180;
  const fov = Math.max(12, Math.min(170, 180 / 2 ** camera.zoom));
  const focal = width / (2 * Math.tan(fov * Math.PI / 360));
  const east = (point[1] - camera.position[1]) * 111320 * Math.cos(camera.position[0] * Math.PI / 180);
  const north = (point[0] - camera.position[0]) * 111320;
  const x = east * Math.cos(yaw) - north * Math.sin(yaw), forward = north * Math.cos(yaw) + east * Math.sin(yaw);
  const down = 2.45 * Math.cos(pitch) + forward * Math.sin(pitch), z = forward * Math.cos(pitch) - 2.45 * Math.sin(pitch);
  if (z < 3) return null;
  return [width / 2 + focal * x / z, height / 2 + focal * down / z];
}
