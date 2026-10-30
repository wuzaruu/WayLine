import type { Camera } from './camera';
import type { Point } from '../types';
export type PanoramaFrame = { id: string; position: Point; distance: number; sampleDistance: number; imageDate: string };
export type PanoramaLook = Pick<Camera, 'heading' | 'pitch' | 'zoom'>;
export function currentPanoramaRequest(requested: number, latest: number) { return latest - requested >= -3 && latest - requested <= 40; }
export function forwardPanorama(frame: PanoramaFrame, active: PanoramaFrame | null, requested: number, previous: number) { return !active || frame.id === active.id || requested < previous - 12 || frame.distance >= active.distance - 3; }
export interface PanoramaSlot {
  prepare(frame: PanoramaFrame, heading: number): Promise<void>;
  present(active: boolean): void;
  camera(): Camera | null;
  point(heading: number): void;
  setLook(look: PanoramaLook): void;
  dispose(): void;
}
export class BufferedPanoramas {
  private active = -1;
  private frames: (PanoramaFrame | null)[] = [null, null];
  private pending: { index: number; id: string; promise: Promise<boolean> } | null = null;
  private loadVersion = 0;
  private displayVersion = 0;
  private required: number | null = null;
  private disposed = false;
  constructor(readonly slots: [PanoramaSlot, PanoramaSlot]) {}
  get activeFrame() { return this.frames[this.active] || null; }
  get activeSlot() { return this.active < 0 ? null : this.slots[this.active]; }
  private load(frame: PanoramaFrame, heading: number) {
    const index = this.active < 0 ? 0 : 1 - this.active;
    if (this.frames[index]?.id === frame.id) return Promise.resolve(true);
    if (this.pending?.index === index && this.pending.id === frame.id) return this.pending.promise;
    const version = ++this.loadVersion;
    this.frames[index] = null;
    const promise = this.slots[index].prepare(frame, heading).then(() => {
      if (this.disposed || version !== this.loadVersion) return false;
      this.frames[index] = frame; return true;
    }).catch(() => false).finally(() => { if (this.pending?.promise === promise) this.pending = null; });
    this.pending = { index, id: frame.id, promise };
    return promise;
  }
  async show(frame: PanoramaFrame, look: number | PanoramaLook | (() => number | PanoramaLook), canPresent = () => true) {
    if (this.disposed) return false;
    const request = ++this.displayVersion;
    if (this.activeFrame?.id === frame.id) { this.required = null; return canPresent(); }
    this.required = request;
    const index = this.active < 0 ? 0 : 1 - this.active;
    const facing = () => typeof look === 'function' ? look() : look;
    try {
      const initial = facing();
      if (!await this.load(frame, typeof initial === 'number' ? initial : initial.heading) || this.disposed || request !== this.displayVersion || !canPresent()) return false;
      const latest = facing();
      if (typeof latest === 'number') this.slots[index].point(latest); else this.slots[index].setLook(latest);
      this.slots[index].present(true);
      if (this.active >= 0 && this.active !== index) this.slots[this.active].present(false);
      this.active = index;
      return true;
    } finally { if (this.required === request) this.required = null; }
  }
  async warm(frame: PanoramaFrame, heading: number) {
    if (this.disposed || this.required !== null) return false;
    if (this.activeFrame?.id === frame.id) return true;
    return this.load(frame, heading);
  }
  dispose() { this.disposed = true; this.displayVersion++; this.loadVersion++; this.slots.forEach(slot => slot.dispose()); }
}
