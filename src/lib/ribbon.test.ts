import test from 'node:test';
import assert from 'node:assert/strict';
import { crossedQuad, quadArea } from './ribbon';
test('Ribbon mesh rejects a crossed turn segment', () => {
  assert.equal(crossedQuad([[0, 0], [10, 10], [0, 10], [10, 0]]), true);
  assert.equal(crossedQuad([[0, 0], [0, 10], [10, 10], [10, 0]]), false);
  assert.equal(quadArea([[0, 0], [0, 10], [10, 10], [10, 0]]), 100);
});
