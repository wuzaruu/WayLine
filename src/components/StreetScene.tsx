import { useEffect, useRef, useState } from 'react';
import type { PreparedRoute } from '../types';
import { heading, metres, pointAt } from '../lib/geometry';
import { cameraAnchor, shiftPoint, type Camera } from '../lib/camera';
import RouteRibbon from './RouteRibbon';
type Coverage = 'loading' | 'ready' | 'missing';
export default function StreetScene({ route, distance, googleReady, ribbon, onAvailability }: { route: PreparedRoute; distance: number; googleReady: boolean; ribbon: boolean; onAvailability: (value: Coverage) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const currentDistance = useRef(distance); currentDistance.current = distance;
  const generation = useRef(0);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [imageDate, setImageDate] = useState('');
  useEffect(() => {
    if (!googleReady || !container.current) { onAvailability('missing'); return; }
    const epoch = ++generation.current;
    const host = document.createElement('div');
    Object.assign(host.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    container.current.replaceChildren(host);
    const view = new google.maps.StreetViewPanorama(host, { disableDefaultUI: true, addressControl: false, linksControl: false, clickToGo: false, scrollwheel: true, motionTracking: false, motionTrackingControl: false, zoom: 1, pov: { heading: 0, pitch: -2 }, visible: true, showRoadLabels: true });
    const service = new google.maps.StreetViewService();
    let expected: [number, number] | null = null, lastDistance = -999, busy = false, requestedPano = '', pendingDate = '';
    let frame = 0;
    const alive = () => generation.current === epoch;
    const refresh = () => {
      if (!alive()) return;
      const p = view.getPosition(), pov = view.getPov();
      if (view.getStatus() === google.maps.StreetViewStatus.OK && p && expected && view.getPano() === requestedPano && metres([p.lat(), p.lng()], expected) < 3) {
        setCamera({ position: [p.lat(), p.lng()], heading: pov.heading, pitch: pov.pitch, zoom: view.getZoom() });
        setImageDate(pendingDate); onAvailability('ready');
      }
    };
    const resize = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (alive()) { google.maps.event.trigger(view, 'resize'); view.setVisible(true); refresh(); } }); });
    resize.observe(container.current);
    const handles = ['pov_changed', 'position_changed', 'zoom_changed', 'status_changed', 'pano_changed'].map(name => view.addListener(name, refresh));
    onAvailability('loading');
    const update = async () => {
      if (!alive()) return;
      const d = currentDistance.current;
      if (busy || Math.abs(d - lastDistance) < 18) { refresh(); return; }
      lastDistance = d; busy = true;
      const location = pointAt(route.path, route.cumulative, d);
      const direction = heading(pointAt(route.path, route.cumulative, Math.max(0, d - 3)), pointAt(route.path, route.cumulative, Math.min(route.total, d + 7)));
      const target = shiftPoint(location, direction + 90, 2.6);
      try {
        const { data } = await service.getPanorama({ location: { lat: target[0], lng: target[1] }, radius: 30, preference: google.maps.StreetViewPreference.NEAREST, sources: [google.maps.StreetViewSource.OUTDOOR] });
        if (!alive()) return;
        if (!data.location?.pano || !data.location.latLng) throw new Error('No panorama');
        const actual: [number, number] = [data.location.latLng.lat(), data.location.latLng.lng()];
        const anchor = cameraAnchor(route, actual, d);
        expected = actual; pendingDate = data.imageDate || ''; requestedPano = data.location.pano;
        setCamera(null);
        view.setPano(requestedPano); view.setPov({ heading: anchor.direction, pitch: -2 }); view.setVisible(true);
        frame = requestAnimationFrame(() => { if (alive()) { google.maps.event.trigger(view, 'resize'); refresh(); } });
      } catch {
        if (alive()) { expected = null; requestedPano = ''; setCamera(null); setImageDate(''); onAvailability('missing'); }
      } finally { busy = false; }
    };
    void update(); const timer = setInterval(() => void update(), 900);
    return () => { generation.current++; clearInterval(timer); cancelAnimationFrame(frame); resize.disconnect(); handles.forEach(h => h.remove()); view.setVisible(false); host.remove(); };
  }, [googleReady, route, onAvailability]);
  const dateLabel = /^\d{4}-\d{2}$/.test(imageDate) ? new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${imageDate}-01T12:00:00Z`)) : imageDate;
  return <div className="street-scene">
    <div ref={container} className="google-panorama ready"/>
    {ribbon && camera && <RouteRibbon route={route} distance={distance} camera={camera}/>}
    {googleReady && dateLabel && <div className="photo-date">Photo: {dateLabel}</div>}
  </div>;
}
