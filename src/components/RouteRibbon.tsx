import { useEffect, useRef, useState } from 'react';
import { pointAt } from '../lib/geometry';
import { cameraAnchor, groundProjection, guidancePoint, type Camera } from '../lib/camera';
import { crossedQuad, quadArea } from '../lib/ribbon';
import type { Point, PreparedRoute } from '../types';
export default function RouteRibbon({ route, distance, camera }: { route: PreparedRoute; distance: number; camera: Camera | null }) {
  const ref = useRef<SVGSVGElement>(null); const [size, setSize] = useState([1000, 600]);
  useEffect(() => { if (!ref.current) return; const observer = new ResizeObserver(entries => { const b = entries[0].contentRect; if (b.width > 0 && b.height > 0) setSize([b.width, b.height]); }); observer.observe(ref.current); return () => observer.disconnect(); }, []);
  const pos = camera?.position || pointAt(route.path, route.cumulative, distance);
  const [w, h] = size;
  const anchor = cameraAnchor(route, pos, distance);
  const frame: Camera = camera || { position: pos, heading: anchor.direction, pitch: -2, zoom: 1 };
  const start = anchor.distance;
  function screen(d: number, lateral: number): [number, number] | null {
    return groundProjection(guidancePoint(route, d, lateral), frame, w, h);
  }
  const sections: { left: [number, number]; right: [number, number] }[] = [];
  for (let d = start + 5; anchor.reliable && d < Math.min(route.total, start + 95); d += 1.5) {
    const left = screen(d, -.72), right = screen(d, .72);
    if (left && right) sections.push({ left, right }); else if (sections.length) break;
  }
  const mesh: string[] = [];
  for (let i = 1; i < sections.length; i++) {
    const p = [sections[i - 1].left, sections[i].left, sections[i].right, sections[i - 1].right];
    if (!crossedQuad(p) && quadArea(p) > .1) mesh.push(p.map(v => v.join(',')).join(' '));
  }
  const arrows = [];
  let lastCentre: Point | null = null;
  for (let d = start + 12; anchor.reliable && d < Math.min(route.total, start + 90); d += 15) {
    const nose = screen(d + 3, 0), l = screen(d, .57), mid = screen(d + 1, 0), r = screen(d, -.57);
    if (nose && l && mid && r && !crossedQuad([nose, l, mid, r]) && quadArea([nose, l, mid, r]) > 9 && (!lastCentre || Math.hypot(mid[0] - lastCentre[0], mid[1] - lastCentre[1]) > 15)) { arrows.push([nose, l, mid, r].map(p => p.join(',')).join(' ')); lastCentre = mid; }
  }
  return <svg ref={ref} className="route-ribbon" data-camera-heading={frame.heading.toFixed(2)} data-route-heading={anchor.direction.toFixed(2)} data-route-anchor={start.toFixed(2)} data-lane-offset={route.fixedGuidance ? '0.00' : '2.20'} data-capture-offset={anchor.lateral.toFixed(2)} aria-label="Approximate blue route arrows on the road ahead"><g opacity=".68" fill="#2678fa">{mesh.map((p, i) => <polygon key={i} points={p}/>)}</g>{arrows.map((p, i) => <polygon key={i} points={p} fill="#f5faff" fillOpacity=".95"/>)}</svg>;
}
