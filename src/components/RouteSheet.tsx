import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { ChevronUp } from 'lucide-react';
type Snap = 'collapsed' | 'middle' | 'expanded';
export default function RouteSheet({ children, searching, selectionKey, summary, onHeightChange, onCollapse }: { children: ReactNode; searching: boolean; selectionKey: string; summary: ReactNode; onHeightChange: (height: number) => void; onCollapse: () => void }) {
  const element = useRef<HTMLElement>(null);
  const [available, setAvailable] = useState(700), [snap, setSnap] = useState<Snap>('middle'), [height, setHeight] = useState(390), [dragging, setDragging] = useState(false);
  const drag = useRef<{ y: number; height: number; lastY: number; lastTime: number; velocity: number; moved: boolean } | null>(null);
  const ignoreClick = useRef(false);
  const collapsed = Math.min(90, available - 10), expanded = Math.max(collapsed, available - 12);
  const middle = Math.min(expanded, Math.max(300, Math.min(440, available * .55)));
  const points = { collapsed, middle, expanded };
  useEffect(() => {
    const parent = element.current?.parentElement; if (!parent) return;
    const resize = new ResizeObserver(() => setAvailable(parent.clientHeight));
    resize.observe(parent); setAvailable(parent.clientHeight); return () => resize.disconnect();
  }, []);
  useEffect(() => { if (!dragging) setHeight(points[snap]); }, [snap, collapsed, middle, expanded, dragging]);
  useEffect(() => { onHeightChange(height); }, [height, onHeightChange]);
  useEffect(() => { if (searching) setSnap('expanded'); }, [searching]);
  useEffect(() => { setSnap('middle'); }, [selectionKey]);
  const begin = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { y: event.clientY, height, lastY: event.clientY, lastTime: performance.now(), velocity: 0, moved: false };
    ignoreClick.current = false; setDragging(true);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current; if (!d) return;
    const now = performance.now(); d.velocity = (event.clientY - d.lastY) / Math.max(1, now - d.lastTime); d.lastY = event.clientY; d.lastTime = now;
    d.moved ||= Math.abs(event.clientY - d.y) > 5;
    setHeight(Math.max(collapsed, Math.min(expanded, d.height + d.y - event.clientY)));
  };
  const end = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current; if (!d) return;
    const value = Math.max(collapsed, Math.min(expanded, d.height + d.y - event.clientY));
    const velocity = performance.now() - d.lastTime < 140 ? d.velocity : 0;
    let target: Snap;
    if (velocity > .45) target = value > middle + 35 ? 'middle' : 'collapsed';
    else if (velocity < -.45) target = value < middle - 35 ? 'middle' : 'expanded';
    else target = (Object.keys(points) as Snap[]).reduce((best, key) => Math.abs(points[key] - value) < Math.abs(points[best] - value) ? key : best, 'collapsed');
    ignoreClick.current = d.moved; drag.current = null; setSnap(target); setDragging(false); if (target === 'collapsed') onCollapse();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <aside ref={element} className={`sidebar ${searching ? 'is-searching' : ''} ${dragging ? 'is-dragging' : ''}`} data-snap={snap} style={{ '--panel-height': `${height}px` } as CSSProperties}>
    <button className="sheet-handle" aria-label={snap === 'collapsed' ? 'Expand route panel' : 'Collapse route panel'} aria-expanded={snap !== 'collapsed'} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onClick={() => { if (ignoreClick.current) { ignoreClick.current = false; return; } const next = snap === 'collapsed' ? 'middle' : 'collapsed'; setSnap(next); if (next === 'collapsed') onCollapse(); }} onKeyDown={event => { if (event.key === 'ArrowUp') { event.preventDefault(); setSnap('expanded'); } if (event.key === 'ArrowDown') { event.preventDefault(); setSnap('collapsed'); onCollapse(); } }}><span/></button>
    <button className="sheet-peek" onClick={() => setSnap('middle')} aria-label="Show route details">{summary}<ChevronUp size={18}/></button>
    {children}
  </aside>;
}
