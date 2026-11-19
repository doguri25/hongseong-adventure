// Place pins, light columns and name labels (spike/3d-naepo makePlaces) for the mapped places.
import * as THREE from 'three';
import { project, toRender } from '../frame.js';

export const TYPE_COLOR = { public: '#2f73c0', nature: '#3d9a4e', heritage: '#b5523b', daily: '#e0952b', school: '#7a58c4', culture: '#c4508a', intangible: '#b5523b', food: '#e0952b' };
export const LABEL_RANGE = { plane: 3200, slowplane: 1700, default: 950 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// places with a map position (not the remote ones)
export const mappedPlaces = (all) => all.filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat) && !p.remote);

// Brand font for the labels; resolves whether or not the fonts load (labels then fall back to sans-serif).
export function loadLabelFonts() {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);
  const faces = [['400', new URL('#game/assets/NanumSquareRoundR.woff2', import.meta.url).href], ['700', new URL('#game/assets/NanumSquareRoundB.woff2', import.meta.url).href]];
  return Promise.all(faces.map(([weight, url]) => new FontFace('NanumRound', `url(${url})`, { weight }).load().then((f) => document.fonts.add(f)))).then(() => true, () => false);
}

function labelSprite(text, color) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), font = '700 44px NanumRound, sans-serif';
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 56;
  c.width = w; c.height = 84; g.font = font;
  g.fillStyle = 'rgba(251,246,230,.95)'; g.strokeStyle = color; g.lineWidth = 5; g.beginPath(); g.roundRect(3, 3, w - 6, 78, 22); g.fill(); g.stroke();
  g.fillStyle = '#233629'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 45);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  s.userData.aspect = w / 84; s.renderOrder = 10;
  return s;
}

function pinTexture(color) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.arc(64, 60, 50, Math.PI * 0.8, Math.PI * 0.2); g.lineTo(64, 154); g.closePath(); g.fill(); g.lineWidth = 7; g.strokeStyle = '#fffaf0'; g.stroke();
  g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(64, 60, 20, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PlaceLayer {
  // places: dist/content.js place objects with lon/lat. `this.places` are copies with point, x, y, ring added.
  constructor(scene, places, collider, field, { reduced = false } = {}) {
    this.field = field; this.reduced = reduced;
    this.group = new THREE.Group(); this.group.name = 'places'; scene.add(this.group);
    const beamGeo = new THREE.CylinderGeometry(1.4, 1.4, 70, 12, 1, true).translate(0, 35, 0);
    const pinMats = new Map(), beamMats = new Map();
    const pinMat = (color) => { if (!pinMats.has(color)) pinMats.set(color, new THREE.SpriteMaterial({ map: pinTexture(color), transparent: true, depthWrite: false, fog: true })); return pinMats.get(color); };
    const beamMat = (color) => { if (!beamMats.has(color)) beamMats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })); return beamMats.get(color); };
    this.places = []; this.items = [];
    for (const src of places) {
      const point = project([src.lon, src.lat]), [x, y] = point, [X, Z] = toRender(x, y), groundY = field.renderY(x, y), color = TYPE_COLOR[src.type] || '#d0675f';
      const place = Object.assign({}, src, { point, x, y, ring: collider ? collider.containing(x, y) : null });
      const beam = new THREE.Mesh(beamGeo, beamMat(color)); beam.position.set(X, groundY, Z); beam.renderOrder = 8;
      const pin = new THREE.Sprite(pinMat(color)); pin.center.set(0.5, 0); pin.renderOrder = 9; pin.position.set(X, groundY + 20, Z); pin.scale.set(9, 11.25, 1);
      this.group.add(beam, pin);
      this.places.push(place);
      this.items.push({ place, X, Z, groundY, color, beam, pin, label: null });
    }
  }

  update(cam, player, t) {
    const range = LABEL_RANGE[player.mode] || LABEL_RANGE.default, target = cam.target, camPos = cam.position;
    for (const it of this.items) {
      const cd = Math.hypot(it.X - target[0], it.Z - target[2]), show = cd < range;
      if (show && !it.label) {   // built on first use so the font is ready and 223 canvases are not made up front
        it.label = labelSprite(it.place.short || it.place.name, it.color); it.label.position.set(it.X, it.groundY + 34, it.Z); this.group.add(it.label);
      }
      if (it.label) {
        it.label.visible = show;
        if (show) {
          const k = Math.hypot(camPos[0] - it.X, camPos[1] - it.label.position.y, camPos[2] - it.Z) * 0.045;
          it.label.scale.set(k * 0.9 * it.label.userData.aspect, k * 0.9, 1);
        }
      }
      it.pin.position.y = it.groundY + 20 + (this.reduced ? 0 : Math.sin(t * 2 + it.X) * 1.2);
      const far = Math.hypot(camPos[0] - it.X, camPos[1] - it.pin.position.y, camPos[2] - it.Z), s = clamp(far * 0.03, 9, 60);
      it.pin.scale.set(s, s * 1.25, 1);
    }
  }
}
