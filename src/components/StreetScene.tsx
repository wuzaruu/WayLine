import { useEffect, useRef, useState } from 'react';
import type { PreparedRoute } from '../types';
import { angle, metres, pointAt } from '../lib/geometry';
import { advanceHeading, cameraAnchor, routeFollowHeading, shiftPoint, type Camera } from '../lib/camera';
import { BufferedPanoramas, type PanoramaFrame } from '../lib/panorama-buffer';
import { GooglePanoramaSlot } from '../lib/google-panorama-slot';
import RouteRibbon from './RouteRibbon';
import { LocateFixed } from 'lucide-react';
type Coverage = 'loading' | 'ready' | 'missing';
function deadline<T>(request: Promise<T>, milliseconds: number) {
  return new Promise<T>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Street View lookup timed out')), milliseconds); request.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); }); });
}
export default function StreetScene({ route, distance, googleReady, following, onAvailability, onPreparation, onBuffering }: { route: PreparedRoute; distance: number; googleReady: boolean; following: boolean; onAvailability: (value: Coverage) => void; onPreparation: (value: number | null) => void; onBuffering: (value: boolean) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const currentDistance = useRef(distance); currentDistance.current = distance;
  const moving = useRef(following); moving.current = following;
  const [camera, setCamera] = useState<Camera | null>(null), [imageDate, setImageDate] = useState(''), [buffering, setBuffering] = useState(false);
  const [lookingAround, setLookingAround] = useState(false);
  const resume = useRef<() => void>(() => {});
  useEffect(() => {
    if (!googleReady || !container.current) { onAvailability('missing'); onPreparation(null); onBuffering(false); return; }
    let disposed = false, processing = true, waiting = false, lastQuery = -Infinity, retry = false, retryAt = 0, prefetchedId = '', prefetchedAt = -Infinity;
    let orientationFrame = 0, cameraFrame = 0, resizeFrame = 0, followUntil = 0, previousDistance = currentDistance.current, previousTime = performance.now();
    let buffer: BufferedPanoramas | null = null;
    let manualLookUntil = 0, manualLookActive = false;
    const isManual = () => manualLookActive && (!moving.current || performance.now() < manualLookUntil);
    const looking = (slot: GooglePanoramaSlot) => { if (disposed || buffer?.activeSlot !== slot) return; manualLookUntil = performance.now() + 8000; manualLookActive = true; setLookingAround(true); };
    resume.current = () => { manualLookUntil = 0; manualLookActive = false; followUntil = performance.now() + 1200; setLookingAround(false); };
    const publishCamera = () => {
      if (disposed) return;
      const value = buffer?.activeSlot?.camera(); if (!value) return;
      setCamera(previous => previous && metres(previous.position, value.position) < .02 && Math.abs(angle(previous.heading, value.heading)) < .15 && Math.abs(previous.pitch - value.pitch) < .05 && previous.zoom === value.zoom ? previous : value);
    };
    const changed = () => { cancelAnimationFrame(cameraFrame); cameraFrame = requestAnimationFrame(publishCamera); };
    let slots: [GooglePanoramaSlot, GooglePanoramaSlot]; const created: GooglePanoramaSlot[] = [];
    try { container.current.replaceChildren(); created.push(new GooglePanoramaSlot(container.current, changed, looking)); created.push(new GooglePanoramaSlot(container.current, changed, looking)); slots = [created[0], created[1]]; buffer = new BufferedPanoramas(slots); }
    catch { created.forEach(slot => slot.dispose()); container.current?.replaceChildren(); onAvailability('missing'); onPreparation(null); onBuffering(false); return; }
    const service = new google.maps.StreetViewService();
    const cache = new Map<number, Promise<PanoramaFrame | null>>();
    const setWaiting = (value: boolean) => { if (disposed || value === waiting) return; waiting = value; setBuffering(value); onBuffering(value); };
    const lookup = (requested: number): Promise<PanoramaFrame | null> => {
      const sample = Math.max(0, Math.min(route.total, Math.round(requested / 10) * 10));
      const cached = cache.get(sample); if (cached) return cached;
      const position = pointAt(route.path, route.cumulative, sample), direction = routeFollowHeading(route, sample), target = shiftPoint(position, direction + 90, 2.6);
      const promise = deadline(service.getPanorama({ location: { lat: target[0], lng: target[1] }, radius: 30, preference: google.maps.StreetViewPreference.NEAREST, sources: [google.maps.StreetViewSource.OUTDOOR] }), 5000).then(({ data }) => {
        if (!data.location?.pano || !data.location.latLng) return null;
        const actual: [number, number] = [data.location.latLng.lat(), data.location.latLng.lng()];
        const anchor = cameraAnchor(route, actual, sample);
        return { id: data.location.pano, position: actual, distance: anchor.distance, sampleDistance: sample, imageDate: data.imageDate || '' };
      }).catch(error => { if (String(error).includes('ZERO_RESULTS') || (error as { code?: string })?.code === 'ZERO_RESULTS') return null; cache.delete(sample); throw error; });
      cache.set(sample, promise); while (cache.size > 32) cache.delete(cache.keys().next().value!);
      return promise;
    };
    const nextFrame = async (frame: PanoramaFrame, d: number) => {
      for (const offset of [24, 45]) {
        if (disposed || d + offset >= route.total) return null;
        const candidate = await lookup(d + offset);
        if (candidate && candidate.id !== frame.id && candidate.distance >= frame.distance - 3) return candidate;
      }
      return null;
    };
    const show = async (frame: PanoramaFrame) => {
      const shown = await buffer!.show(frame, () => (isManual() ? buffer!.activeSlot?.camera()?.heading : null) ?? routeFollowHeading(route, currentDistance.current, frame.distance));
      if (!shown || disposed) return false;
      followUntil = performance.now() + 1200; setImageDate(buffer!.activeFrame?.imageDate || ''); publishCamera(); onAvailability('ready'); return true;
    };
    const prefetch = async (frame: PanoramaFrame, d: number) => {
      if (prefetchedId === frame.id && Math.abs(d - prefetchedAt) < 18) return;
      prefetchedId = frame.id; prefetchedAt = d;
      const next = await nextFrame(frame, d);
      if (next && !disposed && buffer!.activeFrame?.id === frame.id) await buffer!.warm(next, routeFollowHeading(route, next.sampleDistance, next.distance));
    };
    const pump = async () => {
      if (disposed || processing) return;
      const requested = currentDistance.current;
      if (Math.abs(requested - lastQuery) < 8 && (!retry || performance.now() < retryAt)) return;
      lastQuery = requested; retry = false; processing = true;
      try {
        let frame = await lookup(requested); if (disposed) return;
        if (Math.abs(currentDistance.current - requested) > 40) { setWaiting(true); frame = await lookup(currentDistance.current); if (disposed) return; }
        if (!frame) { onAvailability('missing'); setImageDate(''); setWaiting(false); return; }
        if (frame.id !== buffer!.activeFrame?.id) setWaiting(true);
        if (!await show(frame)) { retry = true; retryAt = performance.now() + 2500; if (!buffer!.activeFrame || Math.abs(currentDistance.current - buffer!.activeFrame.distance) > 70) onAvailability('missing'); return; }
        setWaiting(false);
        void prefetch(frame, currentDistance.current).catch(() => {});
      } catch { if (!disposed) { retry = true; retryAt = performance.now() + 3000; if (!buffer!.activeFrame || Math.abs(currentDistance.current - buffer!.activeFrame.distance) > 70) onAvailability('missing'); } }
      finally { processing = false; if (!disposed) setWaiting(false); }
    };
    const startup = async () => {
      onAvailability('loading'); onPreparation(5); setWaiting(true);
      try {
        const requested = currentDistance.current; lastQuery = requested;
        const frame = await lookup(requested); if (disposed) return;
        onPreparation(30);
        if (!frame) { onAvailability('missing'); return; }
        if (!await show(frame) || disposed) { if (!disposed) onAvailability('missing'); return; }
        onPreparation(65);
        try {
          const next = await nextFrame(frame, currentDistance.current); if (disposed) return;
          onPreparation(80);
          if (next) { prefetchedId = frame.id; prefetchedAt = currentDistance.current; await buffer!.warm(next, routeFollowHeading(route, next.sampleDistance, next.distance)); }
        } catch {  }
      } catch { if (!disposed) { onAvailability('missing'); retry = true; retryAt = performance.now() + 3000; } }
      finally { processing = false; if (!disposed) { onPreparation(100); setWaiting(false); void pump(); } }
    };
    const orient = (now: number) => {
      if (disposed) return;
      const elapsed = Math.min(.1, (now - previousTime) / 1000); previousTime = now;
      const d = currentDistance.current;
      if (Math.abs(d - previousDistance) > .15) { if (Math.abs(d - previousDistance) > 45) setWaiting(true); previousDistance = d; followUntil = now + 900; }
      const active = buffer!.activeSlot;
      const manual = isManual(), manualCamera = manual ? active?.camera() : null;
      if (!manual && manualLookActive) { manualLookActive = false; setLookingAround(false); }
      for (const slot of slots) {
        if (!slot.frame || (slot === active && (manual || (!moving.current && now > followUntil)))) continue;
        if (manualCamera && slot !== active) { slot.copyLook(manualCamera); continue; }
        const target = routeFollowHeading(route, d, slot.frame.distance), pov = slot.view.getPov();
        slot.point(advanceHeading(Number.isFinite(pov?.heading) ? pov.heading : target, target, elapsed));
      }
      publishCamera(); orientationFrame = requestAnimationFrame(orient);
    };
    const resize = new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { if (!disposed) slots.forEach(slot => slot.resize()); }); });
    resize.observe(container.current); orientationFrame = requestAnimationFrame(orient);
    void startup(); const timer = setInterval(() => void pump(), 300);
    return () => { disposed = true; clearInterval(timer); cancelAnimationFrame(orientationFrame); cancelAnimationFrame(cameraFrame); cancelAnimationFrame(resizeFrame); resize.disconnect(); buffer?.dispose(); cache.clear(); onPreparation(null); onBuffering(false); };
  }, [googleReady, route, onAvailability, onPreparation, onBuffering]);
  const dateLabel = /^\d{4}-\d{2}$/.test(imageDate) ? new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${imageDate}-01T12:00:00Z`)) : imageDate;
  return <div className="street-scene">
    <div ref={container} className="google-panorama ready"/>
    {camera && <RouteRibbon route={route} distance={distance} camera={camera}/>}
    {lookingAround && <button className="face-route" onClick={() => resume.current()}><LocateFixed size={15}/> Face route</button>}
    {buffering && camera && <div className="street-buffering">Preparing next view…</div>}
    {googleReady && dateLabel && <div className="photo-date">Photo: {dateLabel}</div>}
  </div>;
}
