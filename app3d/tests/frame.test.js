import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, unproject, toRender } from '../src/frame.js';

test('project matches the 2D game', () => { const [x, y] = project([126.67118, 36.65611]); assert.ok(Math.abs(x - 24207.0) < 1 && Math.abs(y - 3772.6) < 1); });
test('round trip', () => { const p = [126.5, 36.6]; const q = unproject(project(p)); assert.ok(Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9); });
test('render space is centred', () => { const [X, Z] = toRender(...project([126.595, 36.57])); assert.ok(Math.abs(X) < 1 && Math.abs(Z) < 1); });
