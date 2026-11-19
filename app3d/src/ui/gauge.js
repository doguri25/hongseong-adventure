// Round speedometer (pokju `#spd-gauge`): a 270° arc drawn with Canvas 2D. The number and the ×N factor are DOM text
// next to the canvas (hud.js), so they scale with the page and the smoke can measure them. gaugeAngles, speedNumber and
// factorLabel are pure; createGauge needs a canvas only when draw() runs.
import { FACTOR } from '../sim/player.js';

export const GAUGE_START = Math.PI * 0.75, GAUGE_END = Math.PI * 2.25;   // canvas angles: 135° (lower left) to 405°

const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);   // NaN -> 0

/** {start, end, value, fraction}: where the filled arc ends for `speed` on a dial whose full scale is `max`. */
export function gaugeAngles(speed, max) {
  const fraction = max > 0 ? clamp01(speed / max) : 0;
  return { start: GAUGE_START, end: GAUGE_END, value: GAUGE_START + (GAUGE_END - GAUGE_START) * fraction, fraction };
}

/** The km/h-like number under the arc: game metres per second x 3.6, rounded (never negative). */
export function speedNumber(speed) { return speed > 0 ? Math.round(speed * 3.6) : 0; }

/** '×N' travel factor (walk 1, bike 2, car 4, supercar 8, slow plane 4, plane 16); the ferry shows '배'. */
export function factorLabel(mode) { return FACTOR[mode] ? `×${FACTOR[mode]}` : '배'; }

/** draw(speed, max) repaints only when the arc moved by at least 1/200 of the scale. */
export function createGauge(canvas) {
  let key = '', ctx = null;
  return {
    draw(speed, max) {
      const { start, end, value, fraction } = gaugeAngles(speed, max);
      const size = canvas.width, k = `${size}:${Math.round(fraction * 200)}`;
      if (k === key || !size) return;
      key = k;
      ctx = ctx || canvas.getContext('2d');
      const x = ctx, c = size / 2, r = size * 0.4;
      x.clearRect(0, 0, size, size);
      x.lineCap = 'round';
      x.lineWidth = size * 0.06; x.strokeStyle = 'rgba(255,255,255,0.12)';
      x.beginPath(); x.arc(c, c, r, start, end); x.stroke();
      const g = x.createLinearGradient(c - r, c, c + r, c);
      g.addColorStop(0, '#22e1ff'); g.addColorStop(0.6, '#8a5cff'); g.addColorStop(1, '#ff2d95');
      x.strokeStyle = g; x.shadowColor = '#8a5cff'; x.shadowBlur = size * 0.05;
      x.beginPath(); x.arc(c, c, r, start, Math.max(value, start + 0.01)); x.stroke();
      x.shadowBlur = 0;
      x.lineWidth = Math.max(1, size * 0.012); x.strokeStyle = 'rgba(255,255,255,0.45)';
      for (let i = 0; i <= 10; i++) {
        const a = start + (end - start) * i / 10, r1 = r - size * 0.075, r2 = r - size * (i % 5 ? 0.1 : 0.125);
        x.beginPath(); x.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); x.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2); x.stroke();
      }
    },
    reset() { key = ''; },
  };
}
