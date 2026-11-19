import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gaugeAngles, speedNumber, factorLabel, GAUGE_START, GAUGE_END } from '../src/ui/gauge.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('gaugeAngles: the arc runs from the start angle to the end angle (pokju 135° to 405°)', () => {
  near(GAUGE_START, Math.PI * 0.75, 'start');
  near(GAUGE_END, Math.PI * 2.25, 'end');
  const g = gaugeAngles(0, 312);
  near(g.start, GAUGE_START, 'start'); near(g.end, GAUGE_END, 'end');
});

test('gaugeAngles: 0 sits on the start angle, max on the end angle, half way in the middle', () => {
  near(gaugeAngles(0, 312).value, GAUGE_START, 'zero');
  assert.equal(gaugeAngles(0, 312).fraction, 0);
  near(gaugeAngles(312, 312).value, GAUGE_END, 'max');
  assert.equal(gaugeAngles(312, 312).fraction, 1);
  near(gaugeAngles(156, 312).value, (GAUGE_START + GAUGE_END) / 2, 'half');
});

test('gaugeAngles: clamps above max and below zero, and a missing max reads as empty', () => {
  near(gaugeAngles(5000, 312).value, GAUGE_END, 'above max');
  assert.equal(gaugeAngles(5000, 312).fraction, 1);
  near(gaugeAngles(-20, 312).value, GAUGE_START, 'below zero');
  near(gaugeAngles(40, 0).value, GAUGE_START, 'max 0');
  near(gaugeAngles(NaN, 312).value, GAUGE_START, 'NaN speed');
});

test('speedNumber: the km/h-like number is speed x 3.6, rounded', () => {
  assert.equal(speedNumber(0), 0);
  assert.equal(speedNumber(78), 281);           // walking at the default speed setting
  assert.equal(speedNumber(78 * 16), 4493);     // the jet
  assert.equal(speedNumber(10.2), 37);          // 36.72
  assert.equal(speedNumber(-3), 0);
  assert.equal(speedNumber(NaN), 0);
});

test('factorLabel: ×N for each travel mode, the boat has none', () => {
  assert.deepEqual(['walk', 'bike', 'car', 'supercar', 'slowplane', 'plane'].map(factorLabel), ['×1', '×2', '×4', '×8', '×4', '×16']);
  assert.equal(factorLabel('boat'), '배');
});
