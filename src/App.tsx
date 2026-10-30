import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, BusFront, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Compass, Eye, Flag, Fullscreen, KeyRound, Layers, LocateFixed, Map, MapPin, Navigation, Pause, Play, RotateCcw, Route as RouteIcon, Search, Settings2, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import RouteMap from './components/RouteMap';
import StreetScene from './components/StreetScene';
import { distanceLabel, heading, pointAt, prepare, project } from './lib/geometry';
import { loadGoogle } from './lib/google';
import { applyLaneCorrection, type LaneCorrectionCatalog } from './lib/lane-corrections';
import type { CSSProperties } from 'react';
import RouteSheet from './components/RouteSheet';
import PreviewControls from './components/PreviewControls';
import FullscreenIcon from './components/FullscreenIcon';
import type { AppConfig, BusRoute, Instruction, PreparedRoute, RouteIndex, Variant } from './types';

const Maneuver = ({ type, size = 24 }: { type: Instruction['maneuver']; size?: number }) => type === 'left' ? <ArrowLeft size={size}/> : type === 'right' ? <ArrowRight size={size}/> : type === 'arrive' ? <Flag size={size}/> : <ArrowUp size={size}/>;
const dateText = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const headsignText = (v: string) => v.replace(/^\d+[AB]?\s+/i, '');

export default function App() {
  const [index, setIndex] = useState<RouteIndex | null>(null);
  const [laneCatalog, setLaneCatalog] = useState<LaneCorrectionCatalog | null>(null);
  const [config, setConfig] = useState<AppConfig>({ googleMapsBrowserKey: '', serverDirectionsEnabled: false });
  const [routeId, setRouteId] = useState('004'), [variantId, setVariantId] = useState('0');
  const [variants, setVariants] = useState<Variant[]>([]), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState(''), [searching, setSearching] = useState(false), [tab, setTab] = useState<'stops' | 'directions'>('stops');
  const [started, setStarted] = useState(false), [playing, setPlaying] = useState(false), [distance, setDistance] = useState(0), [rate, setRate] = useState(1);
  const [view, setView] = useState<'first' | 'third'>('first'), [voice, setVoice] = useState(true);
  const [nativeFullscreen, setNativeFullscreen] = useState(false), [immersive, setImmersive] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false), [sheetHeight, setSheetHeight] = useState(390);
  const inJourney = started || previewOpen;
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [googleReady, setGoogleReady] = useState(() => !!window.google?.maps?.Map), [help, setHelp] = useState(false), [connectionError, setConnectionError] = useState('');
  const [coverage, setCoverage] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [scenePreparation, setScenePreparation] = useState<number | null>(null), [sceneWaiting, setSceneWaiting] = useState(false);
  const [selectedStop, setSelectedStop] = useState<import('./types').Stop | null>(null);
  const [toast, setToast] = useState(''), [recenter, setRecenter] = useState(0), [gps, setGps] = useState(false), [gpsPending, setGpsPending] = useState(false);
  const [googleInstructions, setGoogleInstructions] = useState<Instruction[] | null>(null), [directionsLoading, setDirectionsLoading] = useState(false);
  const [guidanceNote, setGuidanceNote] = useState('');
  const watchId = useRef<number | null>(null), routeRef = useRef<PreparedRoute | null>(null), progressRef = useRef(0), gpsHasFix = useRef(false), speechKey = useRef(''), toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspace = useRef<HTMLDivElement>(null), canvas = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLDivElement>(null);
  const fullView = nativeFullscreen || immersive;
  const selected = index?.routes.find(r => r.id === routeId);
  const raw = variants.find(v => v.id === variantId);
  const correction = laneCatalog?.schemaVersion === 1 && laneCatalog.feedVersion === index?.version ? laneCatalog.routes?.[routeId]?.variants?.[variantId] : undefined;
  const corrected = useMemo(() => raw ? applyLaneCorrection(raw, correction) : undefined, [raw, correction]);
  const route = useMemo(() => corrected ? prepare(corrected) : null, [corrected]);
  routeRef.current = route; progressRef.current = distance;
  const instructions = googleInstructions || route?.instructions || [];
  const nextInstruction = instructions.find(s => s.distance > distance + 8) || instructions.at(-1);
  const nextStop = route?.stops.find((s, i) => i > 0 && (s.distance || 0) > distance - 12) || route?.stops.at(-1);
  const position = route ? pointAt(route.path, route.cumulative, distance) : null;
  const bearing = route && position ? heading(pointAt(route.path, route.cumulative, Math.max(0, distance - 5)), pointAt(route.path, route.cumulative, Math.min(route.total, distance + 20))) : 0;
  const minutes = route ? Math.max(1, Math.round(route.durationSeconds / 60)) : 0;
  const baseSpeed = route ? route.total / Math.max(1, route.durationSeconds) : 8;
  const remaining = route ? Math.max(0, Math.ceil((1 - distance / route.total) * minutes)) : 0;
  const completed = !!route && distance >= route.total - 1;
  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const expired = !!index && (today > index.feedEnd || today < index.feedStart);
  const notify = useCallback((message: string) => { setToast(message); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 6500); }, []);
  const stopGps = useCallback(() => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null; setGps(false); setGpsPending(false); gpsHasFix.current = false; }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/data/routes.json', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setIndex).catch(e => { if (e.name !== 'AbortError') { setLoadError('The Edmonton route catalogue could not be loaded. Refresh to try again.'); setLoading(false); } });
    fetch('/api/config', { signal: controller.signal }).then(r => r.json()).then(setConfig).catch(() => {});
    fetch('/data/lane-corrections.json', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setLaneCatalog).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setLoadError(''); setVariants([]);
    fetch(`/data/${encodeURIComponent(routeId)}.json`, { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(d => { setVariants(d.variants); setLoading(false); }).catch(e => { if (e.name !== 'AbortError') { setLoadError('This route could not be loaded. Choose another route or refresh.'); setLoading(false); } });
    return () => controller.abort();
  }, [routeId]);
  useEffect(() => { setPlaying(false); setPreviewOpen(false); setDistance(0); setSelectedStop(null); setCoverage('loading'); setGoogleInstructions(null); setGuidanceNote(''); stopGps(); }, [routeId, variantId, stopGps]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!searchRef.current?.contains(event.target as Node)) setSearching(false); };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, []);
  const connect = useCallback(async (key: string) => {
    if (!key.trim()) return;
    setConnectionError('');
    try { await loadGoogle(key.trim()); setGoogleReady(true); }
    catch (e) { setConnectionError(e instanceof Error ? e.message : 'Street View is temporarily unavailable.'); }
  }, []);
  useEffect(() => { if (config.googleMapsBrowserKey) void connect(config.googleMapsBrowserKey); }, [config.googleMapsBrowserKey, connect]);
  useEffect(() => { const failure = () => { setGoogleReady(false); setConnectionError('Google rejected this key. Check API access, billing and referrer restrictions.'); }; window.addEventListener('google-auth-error', failure); return () => window.removeEventListener('google-auth-error', failure); }, []);
  useEffect(() => {
    if (!playing || !route || gps || (view === 'first' && googleReady && (sceneWaiting || (scenePreparation !== null && scenePreparation < 100)))) return;
    let previous = performance.now(); let frame: number;
    const tick = (now: number) => { const delta = Math.min((now - previous) / 1000, .25); previous = now; setDistance(d => Math.min(route.total, d + baseSpeed * rate * delta)); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [playing, route, rate, gps, baseSpeed, view, googleReady, sceneWaiting, scenePreparation]);
  useEffect(() => { if (completed) { setPlaying(false); stopGps(); } }, [completed, stopGps]);
  useEffect(() => {
    if (!voice || !(playing || gps) || !nextInstruction || !('speechSynthesis' in window)) return;
    const gap = nextInstruction.distance - distance;
    const id = `${routeId}:${variantId}:${nextInstruction.distance}:${gap < 60 ? 'now' : 'soon'}`;
    if (gap > 160 || id === speechKey.current) return;
    speechKey.current = id; speechSynthesis.cancel();
    const message = new SpeechSynthesisUtterance(`${gap < 60 ? '' : `In ${Math.round(gap / 10) * 10} metres, `}${nextInstruction.text}`); message.lang = 'en-CA'; speechSynthesis.speak(message);
  }, [voice, playing, gps, distance, nextInstruction, routeId, variantId]);
  const spokenStop = useRef('');
  useEffect(() => {
    if (!voice || !(playing || gps) || !nextStop || !('speechSynthesis' in window)) return;
    const gap = (nextStop.distance || 0) - distance;
    if (gap > 170 || gap < -10) return;
    const key = `${routeId}:${variantId}:${nextStop.id}:${nextStop.distance}:${gap < 30 ? 'arriving' : 'approaching'}`;
    if (spokenStop.current === key) return;
    spokenStop.current = key; speechSynthesis.cancel();
    const text = gap < 30 ? `Arriving at stop ${nextStop.code || nextStop.id}, ${nextStop.name}.` : `In ${Math.round(gap / 10) * 10} metres, bus stop ${nextStop.code || nextStop.id}, ${nextStop.name}. Prepare to stop.`;
    const message = new SpeechSynthesisUtterance(text); message.lang = 'en-CA'; speechSynthesis.speak(message);
  }, [voice, playing, gps, nextStop, distance, routeId, variantId]);
  useEffect(() => () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); if ('speechSynthesis' in window) speechSynthesis.cancel(); if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  useEffect(() => { if (!playing && 'speechSynthesis' in window) speechSynthesis.cancel(); }, [playing]);
  useEffect(() => {
    const changed = () => { setNativeFullscreen(document.fullscreenElement === canvas.current); };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  useEffect(() => {
    if (!immersive) return;
    const exit = (e: KeyboardEvent) => { if (e.key === 'Escape') setImmersive(false); };
    document.addEventListener('keydown', exit);
    return () => document.removeEventListener('keydown', exit);
  }, [immersive]);
  async function toggleFullscreen() {
    if (document.fullscreenElement) { await document.exitFullscreen(); setImmersive(false); return; }
    if (immersive) { setImmersive(false); return; }
    setImmersive(true);
    if (canvas.current?.requestFullscreen && document.fullscreenEnabled) {
      try { await canvas.current.requestFullscreen({ navigationUI: 'hide' }); if (document.fullscreenElement) return; } catch {  }
    }
  }

  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => document.documentElement.style.setProperty('--app-height', `${Math.round(viewport?.height || window.innerHeight)}px`);
    resize(); window.addEventListener('resize', resize); viewport?.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); viewport?.removeEventListener('resize', resize); document.documentElement.style.removeProperty('--app-height'); };
  }, []);
  function closeSearch() { setSearching(false); searchRef.current?.querySelector('input')?.blur(); }
  function openPreview(at = 0, autoplay = true) { if (!inJourney) setScenePreparation(googleReady && view === 'first' ? 0 : null); closeSearch(); stopGps(); setStarted(false); setPreviewOpen(true); setDistance(at); setRate(4); setPlaying(autoplay); }
  function leaveJourney() { if (document.fullscreenElement) void document.exitFullscreen(); setImmersive(false); setPreviewOpen(false); setStarted(false); setRecenter(v => v + 1); reset(); }
  const previewControls = <PreviewControls buffering={sceneWaiting || (scenePreparation !== null && scenePreparation < 100)} playing={playing} distance={distance} total={route?.total || 0} duration={route?.durationSeconds || 0} rate={rate} fullView={fullView} onPlaying={() => { if (completed) setDistance(0); setPlaying(v => !v); }} onSeek={seek} onRate={setRate} onRestart={() => { setDistance(0); setPlaying(false); }} onFullscreen={toggleFullscreen} onClose={leaveJourney}/>;

  function choose(r: BusRoute) { closeSearch(); reset(); setPreviewOpen(false); setRouteId(r.id); setVariantId('0'); setStarted(false); setQuery(''); setSearching(false); setTab('stops'); }
  function start() { if (!route) return; setScenePreparation(googleReady && view === 'first' ? 0 : null); closeSearch(); setPreviewOpen(false); setPlaying(false); setDistance(0); setStarted(true); toggleGps(); }
  function seek(d: number) { stopGps(); setDistance(Math.min(route?.total || 0, Math.max(0, d))); speechKey.current = ''; }
  function reset() { setScenePreparation(null); setSceneWaiting(false); stopGps(); setPlaying(false); setDistance(0); speechKey.current = ''; }
  function toggleGps() {
    if (gps || gpsPending) { stopGps(); return; }
    if (!navigator.geolocation) { notify('GPS is unavailable in this browser.'); return; }
    setPlaying(false); setGpsPending(true); setStarted(true); gpsHasFix.current = false;
    watchId.current = navigator.geolocation.watchPosition(p => {
      const r = routeRef.current; if (!r) return;
      const current = progressRef.current;
      const match = project([p.coords.latitude, p.coords.longitude], r.path, r.cumulative, gpsHasFix.current ? Math.max(0, current - 80) : 0, gpsHasFix.current ? current + 1600 : Infinity);
      if (match.away > Math.max(100, Math.min(200, p.coords.accuracy))) { stopGps(); notify('Your location is away from this route. GPS follow has stopped; choose a nearby route or use playback.'); return; }
      gpsHasFix.current = true; setGpsAccuracy(p.coords.accuracy); setDistance(match.distance); setGpsPending(false); setGps(true);
    }, error => { stopGps(); notify(error.code === 1 ? 'Location permission was declined. Route playback is still available.' : 'A GPS position could not be found. Try again outdoors.'); }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
  }
  async function getDirections() {
    if (!route || !config.serverDirectionsEnabled || directionsLoading) return;
    setDirectionsLoading(true); setGuidanceNote('');
    const r = route; const result: Instruction[] = [];
    try {
      for (let i = 0; i < r.stops.length - 1; i += 26) {
        const stops = r.stops.slice(i, i + 27);
        const response = await fetch('/api/directions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points: stops.map(s => ({ lat: s.lat, lng: s.lng })) }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load Google directions.');
        for (const leg of data.routes?.[0]?.legs || []) for (const step of leg.steps || []) {
          const loc = step.startLocation?.latLng, nav = step.navigationInstruction;
          if (!loc || !nav?.instructions) continue;
          const p = project([loc.latitude, loc.longitude], r.path, r.cumulative, Math.max(0, (stops[0].distance || 0) - 100), (stops.at(-1)?.distance || r.total) + 100);
          if (p.away > 55) continue;
          const m = nav.maneuver || '';
          if (!/TURN|ROUNDABOUT|U_TURN|RAMP|FORK|MERGE/.test(m)) continue;
          result.push({ distance: p.distance, text: nav.instructions, maneuver: m.includes('LEFT') ? 'left' : m.includes('RIGHT') ? 'right' : 'straight', source: 'google' });
        }
      }
      if (routeRef.current !== r) return;
      result.sort((a, b) => a.distance - b.distance);
      const filtered = result.filter((s, i) => !i || s.distance - result[i - 1].distance > 20);
      if (!filtered.length) throw new Error('No Google turn instructions matched this ETS shape. Shape-based guidance remains available.');
      const merged = [...filtered, ...r.instructions.filter(s => !filtered.some(g => Math.abs(g.distance - s.distance) < 80))].sort((a, b) => a.distance - b.distance);
      setGoogleInstructions(merged); setGuidanceNote('Google road turns matched to ETS geometry. Unmatched turns use shape guidance. Bus-only roads and detours may differ.');
    } catch (e) { if (routeRef.current === r) setGuidanceNote(e instanceof Error ? e.message : 'Could not load road directions.'); }
    finally { setDirectionsLoading(false); }
  }

  const results = useMemo(() => {
    const q = query.trim().toUpperCase(); if (!index) return [];
    return index.routes.filter(r => !q || r.number.toUpperCase().startsWith(q)).sort((a, b) => Number(b.number.toUpperCase() === q) - Number(a.number.toUpperCase() === q)).slice(0, q ? 12 : 8);
  }, [index, query]);

  return <div className={`app ${inJourney ? 'is-navigating' : ''} ${previewOpen ? 'is-preview' : ''} ${fullView ? 'is-fullscreen' : ''}`} style={{ '--sheet-height': `${sheetHeight}px` } as CSSProperties}>
    <header className="app-header">{inJourney && <button className="mobile-route-back icon-button" aria-label="Choose another route" onClick={leaveJourney}><ArrowLeft size={20}/></button>}<a className="brand" href="/" aria-label="Wayline home"><img src="/favicon.svg" alt=""/><span>wayline<span className="brand-dot">.</span></span></a><span className="header-divider"/><span className="city"><MapPin size={15}/> Edmonton, Alberta <ChevronDown size={13}/></span><nav><span className="nav-active">Route explorer</span><button onClick={() => setHelp(true)}><CircleHelp size={16}/><span>How it works</span></button></nav><button className="header-help icon-button" aria-label="Route help" onClick={() => setHelp(true)}><CircleHelp size={19}/></button></header>
    <div className="app-body">
      <RouteSheet searching={searching} selectionKey={`${routeId}:${variantId}`} onHeightChange={setSheetHeight} onCollapse={closeSearch} summary={<><span className="route-number">{selected?.number || '…'}</span><span>{headsignText(raw?.headsign || 'Choose a bus route')}</span></>}>
        <div className="sidebar-intro"><span className="eyebrow"><span className="status-dot"/> EDMONTON TRANSIT</span><h1>Find your route.</h1><p>A familiar journey starts with a clear view.</p></div>
        <div className="route-search" ref={searchRef}><Search size={19}/><input aria-label="Search by route number" inputMode="numeric" placeholder="Search route number" value={query} onFocus={() => setSearching(true)} onChange={e => { setQuery(e.target.value); setSearching(true); }} onKeyDown={e => { if (e.key === 'Escape') closeSearch(); if (e.key === 'Enter' && results[0]) choose(results[0]); }}/>{query && <button aria-label="Clear route search" onClick={() => setQuery('')}><X size={15}/></button>}{searching && <div className="search-results"><span className="search-heading">{query ? 'MATCHING BUS ROUTES' : 'EDMONTON BUS ROUTES'}</span>{results.length ? results.map(r => <button key={r.id} onClick={() => choose(r)}><span className="route-number">{r.number}</span><span><strong>{r.name}</strong><small>{r.variants.length} route directions / patterns</small></span><ChevronRight size={15}/></button>) : <div className="empty-search"><strong>No route with this number</strong><span>Try 914, 926, or 4. Search accepts route numbers, not addresses.</span></div>}</div>}</div>
        <div className="quick-routes"><span>Try a route</span>{['4', '914', '926'].map(n => <button className={selected?.number === n ? 'active' : ''} key={n} onClick={() => { const r = index?.routes.find(r => r.number === n); if (r) choose(r); }}>{n}</button>)}<span className="route-count">{index?.routes.length || '…'} routes</span></div>
        <div className="sidebar-content">
          {loadError ? <div className="inline-error">{loadError}</div> : loading || !route || !selected ? <div className="loading-card"><div className="skeleton"/><div className="skeleton short"/><span>Loading Edmonton routes…</span></div> : <>
            <div className="selected-route"><div className="route-heading"><span className="route-number large">{selected.number}</span><div><span className="subtle-label">BUS ROUTE</span><h2>{headsignText(raw?.headsign || '')}</h2></div><BusFront className="route-bus-icon" size={23}/></div><div className="direction-select"><label htmlFor="direction">Direction</label><select id="direction" value={variantId} onChange={e => setVariantId(e.target.value)}>{selected.variants.map((v, i) => <option key={v.id} value={v.id}>{headsignText(v.headsign)}{selected.variants.filter(x => x.headsign === v.headsign).length > 1 ? ` · pattern ${i + 1}` : ''}</option>)}</select><ChevronDown size={15}/></div><div className="route-endpoints"><div><span className="endpoint-circle"/><span>{route.stops[0].name}</span></div><div className="endpoint-line"/><div><span className="endpoint-square"/><span>{route.stops.at(-1)?.name}</span></div></div><div className="route-metrics"><div><Clock3 size={16}/><strong>{minutes}<small> min</small></strong><span>scheduled estimate</span></div><div><RouteIcon size={16}/><strong>{(route.total / 1000).toFixed(1)}<small> km</small></strong><span>route distance</span></div><div><MapPin size={16}/><strong>{route.stops.length}</strong><span>bus stops</span></div></div></div>
            <div className="sidebar-tabs"><button className={tab === 'stops' ? 'active' : ''} onClick={() => setTab('stops')}>Stops <span>{route.stops.length}</span></button><button className={tab === 'directions' ? 'active' : ''} onClick={() => setTab('directions')}>Directions</button></div>
            <div className="stop-list">{tab === 'stops' ? route.stops.map((s, i) => <button className={`stop ${inJourney && (s.distance || 0) < distance - 15 ? 'passed' : ''} ${inJourney && s === nextStop ? 'next' : ''}`} key={`${s.id}-${i}`} onClick={() => { seek(s.distance || 0); openPreview(s.distance || 0, false); }}><span className="stop-track"><span className={i === 0 || i === route.stops.length - 1 ? 'terminal' : ''}>{i === route.stops.length - 1 ? <Flag size={10}/> : ''}</span></span><span className="stop-info"><strong>{s.name}</strong><small>{i === 0 ? 'First stop' : i === route.stops.length - 1 ? 'Final stop' : `Stop ${s.code || s.id}`}{inJourney && s === nextStop ? ' · Up next' : ''}</small></span><span className="stop-time">{i ? `${Math.round(s.elapsed / 60)} min` : <BusFront size={15}/>}</span></button>) : <><div className="guidance-info"><Navigation size={17}/><p>{googleInstructions ? 'Google + ETS route guidance' : 'Shape-based route preview'}<small>Turns follow the ETS route geometry. {config.serverDirectionsEnabled ? 'Add Google road instructions below.' : 'Instructions follow the route geometry.'}</small></p></div>{config.serverDirectionsEnabled && <button className="button directions-load" onClick={getDirections} disabled={directionsLoading}>{directionsLoading ? 'Loading road guidance…' : googleInstructions ? 'Refresh Google guidance' : 'Load Google turn guidance'}</button>}{guidanceNote && <p className="guidance-note">{guidanceNote}</p>}{instructions.map((s, i) => <button className="direction-step" key={i} onClick={() => { openPreview(Math.max(0, s.distance - 75), false); }}><Maneuver type={s.maneuver} size={19}/><span><strong>{s.text}</strong><small>{distanceLabel(s.distance)} from start · {s.source === 'google' ? 'Google' : 'ETS shape'}</small></span></button>)}</>}</div>
          </>}
        </div>
        <div className="sidebar-bottom">
          {!started && <button className="button route-preview-button" disabled={!route || loading} onClick={previewOpen ? leaveJourney : () => openPreview()}><Play size={17}/><span>{previewOpen ? 'Back to route details' : 'Route preview'}</span><ChevronRight size={17}/></button>}
          <button className="button primary start-button" disabled={!route || loading} onClick={started ? leaveJourney : start}>{started ? <ArrowLeft size={18}/> : <LocateFixed size={18}/>} {started ? 'Choose another route' : 'Start route'}<ArrowRight size={18}/></button>
          {!started && <span className="start-gps-note"><LocateFixed size={10}/> GPS navigation starts with your location</span>}
        </div>
      </RouteSheet>
      <main className="workspace" ref={workspace}>
        <div className="workspace-header"><div><span className="breadcrumb">Route explorer <ChevronRight size={12}/> {selected ? `Route ${selected.number}` : 'Edmonton'}</span><h2>{previewOpen ? 'Route preview' : started ? completed ? 'You’ve reached the final stop.' : 'Let’s take the route.' : 'Get to know your journey.'}</h2></div><div className="workspace-actions">{inJourney && <div className="view-toggle"><button aria-pressed={view === 'first'} className={view === 'first' ? 'active' : ''} onClick={() => setView('first')}><Eye size={15}/><span>First person</span></button><button aria-pressed={view === 'third'} className={view === 'third' ? 'active' : ''} onClick={() => setView('third')}><Map size={15}/><span>Third person</span></button></div>}<button className="icon-button" title="Fullscreen" aria-label="Toggle fullscreen" onClick={toggleFullscreen}><FullscreenIcon active={fullView}/></button></div></div>
        <div ref={canvas} className={`journey-canvas ${inJourney ? 'journey-started' : 'overview'} ${inJourney && view === 'first' ? 'first-person' : ''} ${immersive ? 'immersive' : ''} ${fullView ? 'full-view' : ''} ${inJourney && view === 'first' && coverage !== 'ready' ? 'coverage-fallback' : ''}`}>
          <div className="map-shell"><RouteMap route={route} position={position} heading={bearing} googleReady={googleReady} follow={inJourney} recenter={recenter} onStopSelect={setSelectedStop}/>{inJourney && view === 'first' && <button className="minimap-label" onClick={() => setView('third')}><Map size={12}/> Route overview <ArrowUpRight size={13}/></button>}</div>
          {inJourney && view === 'first' && route && !gpsPending && <StreetScene route={route} distance={distance} googleReady={googleReady} following={playing || gps} onAvailability={setCoverage} onPreparation={setScenePreparation} onBuffering={setSceneWaiting}/>}
          {!inJourney && <><div className="map-top-chips"><span className="map-chip"><span className="blue-dot"/> Route overview</span><span className="map-chip muted">Edmonton, AB</span></div></>}
          {inJourney && nextInstruction && <div className={`turn-card ${completed ? 'arrived' : ''}`}><span className="turn-icon"><Maneuver type={completed ? 'arrive' : nextInstruction.maneuver} size={37}/></span><div><span>{completed ? 'Route complete' : distance < 5 ? 'When you’re ready' : `In ${distanceLabel(Math.max(0, nextInstruction.distance - distance))}`}</span><strong>{completed ? 'You’ve arrived.' : distance < 5 ? `Depart from ${route?.stops[0].name}` : nextInstruction.text}</strong><small>{completed ? 'Restart to preview the journey again.' : nextInstruction.source === 'google' ? 'Google road guidance · matched to route' : 'Route guidance'}</small></div></div>}
          <div className="map-tools"><button className="map-tool" title="Recenter route" aria-label="Recenter route" onClick={() => setRecenter(v => v + 1)}><LocateFixed size={19}/></button><button className="map-tool" aria-label={fullView ? 'Exit navigation fullscreen' : 'Enter navigation fullscreen'} onClick={toggleFullscreen}><FullscreenIcon active={fullView}/></button></div>
          {started && <div className="scene-controls"><button className={gps ? 'enabled' : ''} onClick={toggleGps}><LocateFixed size={14}/>{gpsPending ? 'Finding location…' : gps ? 'GPS following · stop' : 'Follow my GPS'}</button></div>}
          {inJourney && nextStop && <div className="next-stop-chip"><span className="next-stop-icon"><BusFront size={16}/></span><div><small>{completed ? 'FINAL STOP' : 'NEXT STOP'}{!completed ? ` · #${nextStop.code || nextStop.id}` : ''}</small><strong>{nextStop.name}</strong>{!completed && (nextStop.distance || 0) - distance < 180 && <em className="approaching-stop">Approaching stop · prepare to stop</em>}</div><span>{distanceLabel(Math.max(0, (nextStop.distance || 0) - distance))}</span></div>}
          {loading && <div className="map-loading">Loading route…</div>}
          {inJourney && view === 'first' && coverage !== 'ready' && <div className="coverage-notice"><Map size={15}/><span>{coverage === 'loading' && googleReady ? 'Loading street-level view…' : 'Street View Unavailable'}<small>{coverage === 'loading' && googleReady ? 'Following your route while the panorama loads' : 'Temporarily using satellite imaging'}</small></span></div>}
          {selectedStop && <div className="stop-detail"><button className="stop-detail-close icon-button" aria-label="Close stop details" onClick={() => setSelectedStop(null)}><X size={16}/></button><span className="eyebrow">BUS STOP #{selectedStop.code || selectedStop.id}</span><h3>{selectedStop.name}</h3><div className="stop-detail-grid"><span>Route</span><strong>{selected?.number} · {headsignText(raw?.headsign || '')}</strong>{selectedStop.platform && <><span>Platform</span><strong>{selectedStop.platform}</strong></>}<span>Accessibility</span><strong>{selectedStop.wheelchairBoarding === '1' ? 'Wheelchair accessible' : selectedStop.wheelchairBoarding === '2' ? 'Not wheelchair accessible' : 'Not specified in feed'}</strong><span>Journey time</span><strong>+{Math.round(selectedStop.elapsed / 60)} min from departure</strong></div>{selectedStop.description && <p>{selectedStop.description}</p>}<button className="button primary" onClick={() => { openPreview(selectedStop.distance || 0, false); setSelectedStop(null); }}>Preview from this stop <ArrowRight size={15}/></button></div>}
          {fullView && !previewOpen && <div className="immersive-playback gps-bar"><LocateFixed size={18}/><span>{gps ? 'Following your GPS' : gpsPending ? 'Finding your location…' : 'GPS location needed'}</span><button className="icon-button" aria-label={voice ? 'Mute guidance' : 'Enable guidance'} onClick={() => setVoice(v => !v)}>{voice ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button><button className="icon-button" aria-label="Leave fullscreen" onClick={toggleFullscreen}><FullscreenIcon active/></button></div>}
          {previewOpen && fullView && previewControls}
          {inJourney && view === 'first' && googleReady && scenePreparation !== null && scenePreparation < 100 && <div className="street-startup" role="status" aria-live="polite"><div className="street-startup-card"><span className="startup-route-icon"><Navigation size={26}/></span><h3>{gpsPending ? 'Finding your location' : 'Preparing Street View'}</h3><strong>{scenePreparation}%</strong><div className="startup-progress" role="progressbar" aria-label="Street View preparation" aria-valuemin={0} aria-valuemax={100} aria-valuenow={scenePreparation}><span style={{ width: `${scenePreparation}%` }}/></div><p>{gpsPending ? 'Allow location access to begin navigation.' : scenePreparation < 65 ? 'Preparing your starting view.' : 'Preparing the next viewpoint.'}</p><button onClick={leaveJourney}>Back to route</button></div></div>}
        </div>
        {previewOpen && !fullView && previewControls}
        {started && <div className="navigation-status"><LocateFixed size={17}/><div><strong>{gps ? 'Following your GPS' : gpsPending ? 'Finding your location…' : completed ? 'Route complete' : 'GPS location needed'}</strong><small>{gps ? `Accuracy ±${Math.round(gpsAccuracy || 0)} m · ${remaining} min remaining` : gpsPending ? 'Allow location access to begin navigation' : 'Use your location to follow the route'}</small></div>{!gps && !gpsPending && !completed && <button className="gps-retry" onClick={toggleGps}>Enable GPS</button>}<button className="icon-button" aria-label={voice ? 'Mute voice guidance' : 'Enable voice guidance'} onClick={() => { setVoice(v => !v); if (voice && 'speechSynthesis' in window) speechSynthesis.cancel(); }}>{voice ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button></div>}
      </main>
    </div>
    {help && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setHelp(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={e => { if (e.key === 'Escape') setHelp(false); }}><button className="modal-close icon-button" aria-label="Close dialog" onClick={() => setHelp(false)}><X size={20}/></button><span className="modal-icon"><RouteIcon size={25}/></span><span className="eyebrow">A LITTLE ORIENTATION</span><h2 id="modal-title">A familiar route, before you go.</h2><ol className="help-steps"><li><span>1</span><div><strong>Find a bus route.</strong><p>Search its number, such as 914, 926, or 4. Choose the destination and pattern.</p></div></li><li><span>2</span><div><strong>Preview your journey.</strong><p>See the route, stops and a sample scheduled journey time. Use Route preview above Start route to rehearse without GPS. Tap a map stop for its details.</p></div></li><li><span>3</span><div><strong>Follow the road ahead.</strong><p>Start Street View with the blue route ribbon, or follow the bus marker on the satellite map. Missing Street View coverage automatically switches to the route camera.</p></div></li></ol><p className="modal-note">Street View uses captured panoramas. Route arrows are an approximate overlay on a flat road surface; lane assignments and current detours are not supplied by the route feed. Voice guidance announces upcoming turns and bus stops when enabled.</p><button className="button primary" onClick={() => setHelp(false)}>Let’s explore <ArrowRight size={16}/></button></section></div>}
    {toast && <div className="toast" role="status"><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
  </div>;
}
