import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Point, PreparedRoute, Stop } from '../types';
type Props = { route: PreparedRoute | null; position: Point | null; heading: number; googleReady: boolean; follow: boolean; recenter: number; onStopSelect: (stop: Stop) => void };
const busHtml = '<div class="bus-map-pin"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" stroke-width="1.8"><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2m8-2v2M8 15h1m6 0h1"/></svg></div>';
export default function RouteMap({ route, position, heading, googleReady, follow, recenter, onStopSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const leaf = useRef<L.Map | null>(null); const gmap = useRef<google.maps.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null); const leafBus = useRef<L.Marker | null>(null);
  const googleLayers = useRef<(google.maps.Polyline | google.maps.Marker)[]>([]); const gBus = useRef<google.maps.Marker | null>(null);
  const currentRoute = useRef(route), following = useRef(follow);
  const wasFollowing = useRef(false);
  currentRoute.current = route; following.current = follow;
  useEffect(() => {
    if (!container.current) return;
    wasFollowing.current = false;
    if (googleReady) {
      gmap.current = new google.maps.Map(container.current, { center: { lat: 53.5461, lng: -113.4938 }, zoom: 12, mapTypeId: 'hybrid', disableDefaultUI: true, zoomControl: true, streetViewControl: false, clickableIcons: false, styles: [{ elementType: 'geometry', stylers: [{ color: '#18212c' }] }, { elementType: 'labels.text.stroke', stylers: [{ color: '#18212c' }] }, { elementType: 'labels.text.fill', stylers: [{ color: '#7f90a7' }] }, { featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#283747' }] }, { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#34516f' }] }, { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#102f4c' }] }, { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#1b2a2c' }] }] });
      const map = gmap.current; map.addListener('zoom_changed', () => { if (container.current) container.current.dataset.mapZoom = String(map.getZoom()); });
    } else {
      const map = L.map(container.current, { zoomControl: false, attributionControl: true }).setView([53.5461, -113.4938], 12);
      L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      leaf.current = map; layers.current = L.layerGroup().addTo(map);
      map.on('zoomend', () => { if (container.current) container.current.dataset.mapZoom = String(map.getZoom()); });
    }
    let resizeFrame = 0;
    const resize = new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => {
      leaf.current?.invalidateSize({ animate: false, pan: false });
      if (gmap.current) google.maps.event.trigger(gmap.current, 'resize');
      const r = currentRoute.current;
      if (!r || following.current || !container.current) return;
      const pad = Math.min(45, container.current.clientHeight * .12, container.current.clientWidth * .1);
      leaf.current?.fitBounds(L.latLngBounds(r.path), { padding: [pad, pad], animate: false });
      if (gmap.current) { const bounds = new google.maps.LatLngBounds(); r.path.forEach(p => bounds.extend({ lat: p[0], lng: p[1] })); gmap.current.fitBounds(bounds, pad); }
    }); });
    resize.observe(container.current);
    return () => { cancelAnimationFrame(resizeFrame); resize.disconnect(); leaf.current?.remove(); leaf.current = null; gmap.current = null; container.current?.replaceChildren(); googleLayers.current = []; gBus.current = null; };
  }, [googleReady]);
  useEffect(() => {
    if (!route) return;
    const padding = Math.min(55, (container.current?.clientHeight || 300) * .15, (container.current?.clientWidth || 300) * .1);
    layers.current?.clearLayers(); googleLayers.current.forEach(l => l.setMap(null)); googleLayers.current = [];
    if (leaf.current && layers.current) {
      L.polyline(route.path, { color: '#fff', weight: 9, opacity: .95 }).addTo(layers.current);
      L.polyline(route.path, { color: '#3075f4', weight: 5, opacity: .96 }).addTo(layers.current);
      route.stops.forEach((s, i) => {
        const label = document.createElement('span'); label.textContent = `#${s.code || s.id} · ${s.name}`;
        L.circleMarker([s.lat, s.lng], { radius: 11, color: '#3075f4', weight: 0, fillOpacity: 0, bubblingMouseEvents: false }).addTo(layers.current!).on('click', () => onStopSelect(s));
        const dot = L.circleMarker([s.lat, s.lng], { radius: i === 0 || i === route.stops.length - 1 ? 6 : 3.5, color: '#fff', weight: 2, fillColor: i === route.stops.length - 1 ? '#152a4a' : '#3075f4', fillOpacity: 1, bubblingMouseEvents: false });
        dot.on('add', () => { const el = dot.getElement(); if (el) { el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.setAttribute('aria-label', `Stop #${s.code || s.id}: ${s.name}`); el.addEventListener('keydown', event => { const e = event as KeyboardEvent; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStopSelect(s); } }); } });
        dot.addTo(layers.current!).bindTooltip(label).on('click', () => onStopSelect(s));
      });
      leafBus.current = L.marker(route.path[0], { icon: L.divIcon({ html: busHtml, className: 'bus-marker', iconSize: [38, 38], iconAnchor: [19, 19] }), zIndexOffset: 1000 }).addTo(layers.current);
      leaf.current.fitBounds(L.latLngBounds(route.path), { padding: [padding, padding], animate: false });
    }
    if (gmap.current) {
      const map = gmap.current, path = route.path.map(p => ({ lat: p[0], lng: p[1] }));
      googleLayers.current.push(new google.maps.Polyline({ map, path, strokeColor: '#fff', strokeWeight: 9 }), new google.maps.Polyline({ map, path, strokeColor: '#3075f4', strokeWeight: 5 }));
      route.stops.forEach((s, i) => { const marker = new google.maps.Marker({ map, position: s, title: `Stop #${s.code || s.id}: ${s.name}`, icon: { path: google.maps.SymbolPath.CIRCLE, scale: i === 0 || i === route.stops.length - 1 ? 7 : 5, fillColor: '#2563eb', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 } }); marker.addListener('click', () => onStopSelect(s)); googleLayers.current.push(marker); });
      gBus.current = new google.maps.Marker({ map, position: path[0], title: 'Preview position', zIndex: 1000, icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, fillColor: '#2563eb', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3, scale: 6, rotation: 0 } });
      googleLayers.current.push(gBus.current);
      const bounds = new google.maps.LatLngBounds(); path.forEach(p => bounds.extend(p)); map.fitBounds(bounds, padding);
    }
  }, [route, googleReady, recenter, onStopSelect]);
  useEffect(() => {
    if (!position) return;
    leafBus.current?.setLatLng(position);
    gBus.current?.setPosition({ lat: position[0], lng: position[1] });
    if (gBus.current) gBus.current.setIcon({ path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, fillColor: '#2563eb', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3, scale: 6, rotation: heading });
    if (follow) {
      if (leaf.current) leaf.current.setView(position, wasFollowing.current ? leaf.current.getZoom() : 17, { animate: false });
      if (gmap.current) { gmap.current.setCenter({ lat: position[0], lng: position[1] }); if (!wasFollowing.current) gmap.current.setZoom(18); }
    }
    wasFollowing.current = follow;
  }, [position, heading, follow, googleReady]);
  return <div className="route-map" ref={container} aria-label="Edmonton bus route map" />;
}
