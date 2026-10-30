import { angle, metres } from './geometry';
import type { Camera } from './camera';
import type { PanoramaFrame, PanoramaLook, PanoramaSlot } from './panorama-buffer';
export class GooglePanoramaSlot implements PanoramaSlot {
  readonly host: HTMLDivElement;
  readonly view: google.maps.StreetViewPanorama;
  frame: PanoramaFrame | null = null;
  private prepared: PanoramaFrame | null = null;
  private check: (() => void) | null = null;
  private cancel: (() => void) | null = null;
  private handles: google.maps.MapsEventListener[];
  private desiredHeading = 0;
  private disposed = false;
  private pointerHeld = false;
  private input: () => void;
  private move: () => void;
  private release: () => void;
  private wheel: () => void;
  constructor(parent: HTMLElement, changed: () => void, looking: (slot: GooglePanoramaSlot) => void) {
    this.host = document.createElement('div'); this.host.className = 'street-buffer-slot';
    Object.assign(this.host.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '1', pointerEvents: 'none' });
    parent.append(this.host);
    this.input = () => { this.pointerHeld = true; looking(this); };
    this.move = () => { if (this.pointerHeld) looking(this); };
    this.release = () => { if (this.pointerHeld) { this.pointerHeld = false; looking(this); } };
    this.wheel = () => looking(this);
    this.host.addEventListener('pointerdown', this.input, true); this.host.addEventListener('pointermove', this.move, true); this.host.addEventListener('wheel', this.wheel, { capture: true, passive: true }); window.addEventListener('pointerup', this.release, true); this.host.addEventListener('pointercancel', this.release, true);
    this.view = new google.maps.StreetViewPanorama(this.host, { disableDefaultUI: true, addressControl: false, linksControl: false, clickToGo: false, scrollwheel: true, motionTracking: false, motionTrackingControl: false, zoom: 1, pov: { heading: 0, pitch: -2 }, visible: true, showRoadLabels: true });
    this.handles = ['pov_changed', 'position_changed', 'zoom_changed', 'status_changed', 'pano_changed'].map(name => this.view.addListener(name, () => { this.check?.(); changed(); if (name === 'pano_changed') queueMicrotask(() => { if (!this.disposed) this.point(this.desiredHeading); }); }));
  }
  prepare(frame: PanoramaFrame, heading: number) {
    if (this.prepared?.id === frame.id && this.camera()) { this.point(heading); return Promise.resolve(); }
    this.cancel?.(); this.frame = frame; this.prepared = null; this.desiredHeading = heading;
    return new Promise<void>((resolve, reject) => {
      let settled: ReturnType<typeof setTimeout> | null = null;
      let completed = false;
      const valid = () => { const p = this.view.getPosition(); return !this.disposed && this.view.getStatus() === google.maps.StreetViewStatus.OK && this.view.getPano() === frame.id && !!p && metres([p.lat(), p.lng()], frame.position) < 2; };
      const finish = (error?: Error) => {
        if (completed) return; completed = true;
        if (settled) clearTimeout(settled); clearTimeout(timeout);
        this.check = null; this.cancel = null;
        if (error) reject(error); else { this.prepared = frame; resolve(); }
      };
      const timeout = setTimeout(() => finish(new Error('Panorama preparation timed out')), 6500);
      this.cancel = () => finish(new Error('Panorama preparation superseded'));
      this.check = () => {
        if (!valid()) { if (settled) { clearTimeout(settled); settled = null; } return; }
        if (!settled) settled = setTimeout(() => { if (valid()) finish(); else { settled = null; this.check?.(); } }, 700);
      };
      this.view.setPano(frame.id); this.view.setPov({ heading, pitch: -2 }); this.view.setVisible(true); this.resize(); this.check();
    });
  }
  point(heading: number) {
    this.desiredHeading = heading;
    const pov = this.view.getPov();
    if (Number.isFinite(pov?.heading) && Math.abs(angle(pov.heading, heading)) < .05) return;
    this.view.setPov({ heading, pitch: Number.isFinite(pov?.pitch) ? pov.pitch : -2 });
  }
  present(active: boolean) { this.host.style.zIndex = active ? '2' : '1'; this.host.style.pointerEvents = active ? 'auto' : 'none'; }
  setLook(camera: PanoramaLook) { this.point(camera.heading); const pov = this.view.getPov(); if (Math.abs(pov.pitch - camera.pitch) > .05) this.view.setPov({ heading: camera.heading, pitch: camera.pitch }); if (Math.abs(this.view.getZoom() - camera.zoom) > .02) this.view.setZoom(camera.zoom); }
  camera(): Camera | null {
    const frame = this.prepared, p = this.view.getPosition(), pov = this.view.getPov();
    if (!frame || !p || this.view.getPano() !== frame.id || this.view.getStatus() !== google.maps.StreetViewStatus.OK || metres([p.lat(), p.lng()], frame.position) > 2) return null;
    return { position: [p.lat(), p.lng()], heading: pov.heading, pitch: pov.pitch, zoom: this.view.getZoom() };
  }
  resize() { if (!this.disposed) google.maps.event.trigger(this.view, 'resize'); }
  dispose() { this.disposed = true; this.cancel?.(); this.handles.forEach(h => h.remove()); this.host.removeEventListener('pointerdown', this.input, true); this.host.removeEventListener('pointermove', this.move, true); this.host.removeEventListener('wheel', this.wheel, true); window.removeEventListener('pointerup', this.release, true); this.host.removeEventListener('pointercancel', this.release, true); this.view.setVisible(false); this.host.remove(); }
}
