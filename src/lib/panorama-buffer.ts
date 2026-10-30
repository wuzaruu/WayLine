import type { Camera } from './camera';
import type { Point } from '../types';
export type PanoramaFrame = { id: string; position: Point; distance: number; sampleDistance: number; imageDate: string };
export interface PanoramaSlot {
  prepare(frame: PanoramaFrame, heading: number): Promise<void>;
  present(active: boolean): void;
  camera(): Camera | null;
  point(heading: number): void;
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
  async show(frame: PanoramaFrame, heading: number | (() => number)) {
    if (this.disposed) return false;
    const request = ++this.displayVersion;
    if (this.activeFrame?.id === frame.id) { this.required = null; return true; }
    this.required = request;
    const index = this.active < 0 ? 0 : 1 - this.active;
    const facing = () => typeof heading === 'function' ? heading() : heading;
    try {
      if (!await this.load(frame, facing()) || this.disposed || request !== this.displayVersion) return false;
      this.slots[index].point(facing()); this.slots[index].present(true);
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
