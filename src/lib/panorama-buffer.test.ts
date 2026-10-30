import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferedPanoramas, type PanoramaFrame, type PanoramaSlot } from './panorama-buffer';
class Slot implements PanoramaSlot {
  loads: string[] = [];
  visible = false;
  activations = 0;
  pending: { resolve: () => void; reject: (error: Error) => void } | null = null;
  prepare(frame: PanoramaFrame) {
    this.pending?.reject(new Error('Superseded'));
    this.loads.push(frame.id);
    return new Promise<void>((resolve, reject) => { this.pending = { resolve: () => { this.pending = null; resolve(); }, reject: error => { this.pending = null; reject(error); } }; });
  }
  present(active: boolean) { this.visible = active; if (active) this.activations++; }
  camera() { return null; }
  dispose() { this.pending?.reject(new Error('Disposed')); }
}
const frame = (id: string): PanoramaFrame => ({ id, position: [53.55, -113.5], distance: 0, sampleDistance: 0, imageDate: '' });
async function setup() { const slots: [Slot, Slot] = [new Slot(), new Slot()]; const buffer = new BufferedPanoramas(slots); const first = buffer.show(frame('A'), 0); slots[0].pending!.resolve(); assert.equal(await first, true); return { slots, buffer }; }
test('The current picture stays active while the next viewer prepares', async () => {
  const { slots, buffer } = await setup();
  const warming = buffer.warm(frame('B'), 90), showing = buffer.show(frame('B'), 90);
  assert.equal(buffer.activeFrame?.id, 'A'); assert.equal(slots[0].visible, true); assert.equal(slots[1].visible, false);
  assert.deepEqual(slots[0].loads, ['A']); assert.deepEqual(slots[1].loads, ['B']);
  slots[1].pending!.resolve(); assert.equal(await warming, true); assert.equal(await showing, true);
  assert.equal(buffer.activeFrame?.id, 'B'); assert.equal(slots[1].visible, true); assert.equal(slots[0].visible, false);
});
test('Repeated requests for the displayed panorama do not reload its images', async () => {
  const { slots, buffer } = await setup();
  assert.equal(await buffer.show(frame('A'), 90), true);
  assert.equal(await buffer.show(frame('A'), 180), true);
  assert.deepEqual(slots[0].loads, ['A']); assert.deepEqual(slots[1].loads, []);
});
test('A rapid seek supersedes the old pending panorama', async () => {
  const { slots, buffer } = await setup();
  const old = buffer.show(frame('B'), 90), latest = buffer.show(frame('C'), 180);
  slots[1].pending!.resolve();
  assert.equal(await latest, true); assert.equal(await old, false);
  assert.equal(buffer.activeFrame?.id, 'C'); assert.deepEqual(slots[0].loads, ['A']);
});
test('A failed next view preserves the current picture', async () => {
  const { slots, buffer } = await setup();
  const next = buffer.show(frame('B'), 90); slots[1].pending!.reject(new Error('Network timeout'));
  assert.equal(await next, false); assert.equal(buffer.activeFrame?.id, 'A'); assert.equal(slots[0].visible, true);
});
test('Background preparation does not interrupt a required view', async () => {
  const { slots, buffer } = await setup();
  const required = buffer.show(frame('B'), 90);
  assert.equal(await buffer.warm(frame('C'), 180), false); assert.deepEqual(slots[1].loads, ['B']);
  slots[1].pending!.resolve(); assert.equal(await required, true);
});
test('Leaving the route prevents a pending picture from being activated', async () => {
  const slots: [Slot, Slot] = [new Slot(), new Slot()], buffer = new BufferedPanoramas(slots);
  const pending = buffer.show(frame('A'), 0); buffer.dispose();
  assert.equal(await pending, false); assert.equal(slots[0].activations, 0); assert.equal(buffer.activeFrame, null);
});
