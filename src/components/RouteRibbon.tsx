import { useEffect, useRef, useState } from 'react';
import { heading, pointAt } from '../lib/geometry';
import { cameraAnchor, groundProjection, shiftPoint, type Camera } from '../lib/camera';
import { crossedQuad, quadArea } from '../lib/ribbon';
import type { Point, PreparedRoute } from '../types';
export default function RouteRibbon({ route, distance, camera }: { route: PreparedRoute; distance: number; camera: Camera | null }) {
  const ref = useRef<SVGSVGElement>(null); const [size, setSize] = useState([1000, 600]);
  useEffect(() => { if (!ref.current) return; const observer = new ResizeObserver(entries => { const b = entries[0].contentRect; setSize([b.width, b.height]); }); observer.observe(ref.current); return () => observer.disconnect(); }, []);
  const pos = camera?.position || pointAt(route.path, route.cumulative, distance);
  const [w, h] = size;
  const anchor = cameraAnchor(route, pos, distance);
  const frame: Camera = camera || { position: pos, heading: anchor.direction, pitch: -2, zoom: 1 };
  const start = anchor.distance;
  function screen(p: Point, lateral: number, direction: number): [number, number] | null {
    return groundProjection(shiftPoint(p, direction + 90, (route.fixedGuidance ? 0 : anchor.lateral) + lateral), frame, w, h);
  }
  if (!anchor.reliable) return null;
  const sections: { left: [number, number]; right: [number, number] }[] = [];
  for (let d = start + 5; d < Math.min(route.total, start + 95); d += 1.5) {
    const p = pointAt(route.path, route.cumulative, d), hd = heading(pointAt(route.path, route.cumulative, d - 2), pointAt(route.path, route.cumulative, d + 2));
    const left = screen(p, -.72, hd), right = screen(p, .72, hd);
    if (left && right) sections.push({ left, right }); else if (sections.length) break;
  }
  const mesh: string[] = [];
  for (let i = 1; i < sections.length; i++) {
    const p = [sections[i - 1].left, sections[i].left, sections[i].right, sections[i - 1].right];
    if (!crossedQuad(p) && quadArea(p) > .1) mesh.push(p.map(v => v.join(',')).join(' '));
  }
  const arrows = [];
  let lastCentre: Point | null = null;
  for (let d = start + 12; d < Math.min(route.total, start + 90); d += 15) {
    const p = pointAt(route.path, route.cumulative, d), hd = heading(pointAt(route.path, route.cumulative, d - 2), pointAt(route.path, route.cumulative, d + 2));
    const ahead = pointAt(route.path, route.cumulative, d + 3), ah = heading(p, ahead);
    const nose = screen(ahead, 0, ah), l = screen(p, .57, hd), mid = screen(pointAt(route.path, route.cumulative, d + 1), 0, hd), r = screen(p, -.57, hd);
    if (nose && l && mid && r && !crossedQuad([nose, l, mid, r]) && quadArea([nose, l, mid, r]) > 9 && (!lastCentre || Math.hypot(mid[0] - lastCentre[0], mid[1] - lastCentre[1]) > 15)) { arrows.push([nose, l, mid, r].map(p => p.join(',')).join(' ')); lastCentre = mid; }
  }
  return <svg ref={ref} className="route-ribbon" data-camera-heading={frame.heading.toFixed(2)} data-route-heading={anchor.direction.toFixed(2)} data-route-anchor={start.toFixed(2)} data-lane-offset={anchor.lateral.toFixed(2)} aria-label="Approximate blue route arrows on the road ahead"><g opacity=".68" fill="#2678fa">{mesh.map((p, i) => <polygon key={i} points={p}/>)}</g>{arrows.map((p, i) => <polygon key={i} points={p} fill="#f5faff" fillOpacity=".95"/>)}</svg>;
}
