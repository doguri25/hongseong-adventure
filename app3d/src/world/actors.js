// The player's body: exactly one of walk sprite (character sheet), bike sprite, car/supercar GLB, slow plane, jet or boat.
// Render space comes from toRender; heading 0 = north, clockwise; vehicle models point down -Z (rotation.y = -heading).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toRender } from '../frame.js';
import { CHARACTERS, OUTFIT_FILTERS } from '../../../dist/wardrobe.js';
import { outfitMatrix, applyOutfit } from './outfit.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
export const EXPLORER_HEIGHT = 24, BIKE_HEIGHT = 25, CAR_LENGTH = 39, SUPERCAR_LENGTH = 40;
const TAU = Math.PI * 2;

export function radialTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Show one cell of a sheet on a sprite whose pivot (the feet) sits at the sprite's anchor.
export function showCell(sprite, texture, size, cell, heightMetres) {
  const [x, y, w, h] = cell.rect;
  texture.offset.set(x / size[0], 1 - (y + h) / size[1]);
  texture.repeat.set(w / size[0], h / size[1]);
  sprite.scale.set((w / cell.cellHeight) * heightMetres, (h / cell.cellHeight) * heightMetres, 1);
  sprite.center.set((cell.pivot[0] - x) / w, (y + h - cell.pivot[1]) / h);
}

/* ---- primitive vehicles (ported from spike/3d-naepo) ---- */
const paintMat = (hex, extra = {}) => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08, ...extra });
const glassMat = () => new THREE.MeshPhysicalMaterial({ color: 0x1b2632, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.6 });
const darkMat = () => new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.7 });
const chromeMat = () => new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.12, metalness: 1 });
const lightMat = (hex) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: hex, emissiveIntensity: 0.4 });
const lathe = (points, segs = 20) => new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), segs).rotateX(-Math.PI / 2);   // axis along -Z, nose forward
function wheel(r, w) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2), darkMat()), new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w * 1.04, 14).rotateZ(Math.PI / 2), chromeMat()));
  return g;
}
const shadowed = (g) => { g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g; };

// 12.5 m wings x 9 = about 112 m wingspan; no propeller
export function makeSlowPlane() {
  const g = new THREE.Group(), body = paintMat(0xf4c430), white = paintMat(0xfbfaf4), blue = paintMat(0x2d5ea8);
  const fus = new THREE.Mesh(lathe([[0, -3.9], [0.45, -3.6], [0.72, -2.6], [0.78, -1.2], [0.7, 0.6], [0.45, 2.6], [0.22, 3.9], [0, 4.0]]), body); fus.scale.set(1, 1.05, 1);
  const stripe = new THREE.Mesh(lathe([[0.795, -1.6], [0.79, -0.2], [0.73, 0.7]]), blue);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.68, 18, 12, 0, TAU, 0, Math.PI / 2).scale(1, 0.75, 1.6), glassMat()); canopy.position.set(0, 0.55, -1.2);
  const wing = new THREE.Mesh(new RoundedBoxGeometry(12.5, 0.2, 1.7, 2, 0.08), white); wing.position.set(0, 1.05, -0.9);
  const tips = [-1, 1].map((s) => { const t = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.22, 1.72, 2, 0.08), blue); t.position.set(s * 5.7, 1.05, -0.9); return t; });
  const stab = new THREE.Mesh(new RoundedBoxGeometry(4.2, 0.12, 1.0, 2, 0.05), white); stab.position.set(0, 0.25, 3.55);
  const fin = new THREE.Mesh(new RoundedBoxGeometry(0.12, 1.5, 1.3, 2, 0.05), blue); fin.position.set(0, 1.0, 3.6); fin.rotation.x = -0.25;
  const struts = [-1, 1].map((s) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), white); m.position.set(s * 1.6, 0.25, -0.9); m.rotation.z = s * 0.95; return m; });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 14).rotateX(-Math.PI / 2), chromeMat()); nose.position.set(0, 0, -4.25);
  const gear = [[-0.9, -0.6], [0.9, -0.6], [0, 3.2]].map(([x, z]) => { const w = wheel(0.24, 0.14); w.position.set(x, -0.95, z); return w; });
  const nl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lightMat(0xff3030)); nl.position.set(-6.3, 1.05, -0.9);
  const nr = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lightMat(0x30ff6a)); nr.position.set(6.3, 1.05, -0.9);
  g.add(fus, stripe, canopy, wing, ...tips, stab, fin, ...struts, nose, ...gear, nl, nr);
  g.scale.setScalar(9);
  return { group: shadowed(g) };
}

// 14.6 m fuselage x 8.5 = about 124 m long
export function makeJet() {
  const g = new THREE.Group(), white = paintMat(0xf6f7f9), blue = paintMat(0x2266c4), orange = paintMat(0xf07a2a);
  const fus = new THREE.Mesh(lathe([[0, -7.4], [0.32, -7.0], [0.75, -5.6], [1.0, -3.6], [1.05, 2.5], [0.9, 5.4], [0.6, 6.8], [0.4, 7.2]], 22), white);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12, 0, TAU, 0, Math.PI / 2).scale(1, 0.7, 2.6), glassMat()); canopy.position.set(0, 0.62, -4.0);
  const wingGeo = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, -1.8), new THREE.Vector2(7.6, 2.4), new THREE.Vector2(7.6, 3.4), new THREE.Vector2(0, 3.2)]), { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 }).rotateX(Math.PI / 2);
  const wings = [-1, 1].map((s) => { const w = new THREE.Mesh(wingGeo, white); w.scale.x = s; w.position.set(s * 0.6, -0.1, 0); return w; });
  const tailGeo = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.6, 1.6), new THREE.Vector2(2.6, 2.3), new THREE.Vector2(0, 2.0)]), { depth: 0.14, bevelEnabled: false }).rotateX(Math.PI / 2);
  const stabs = [-1, 1].map((s) => { const w = new THREE.Mesh(tailGeo, white); w.scale.x = s; w.position.set(s * 0.4, 0.1, 4.6); return w; });
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.4, 3.0), new THREE.Vector2(3.3, 3.0), new THREE.Vector2(2.6, 0)]), { depth: 0.16, bevelEnabled: false }).rotateY(-Math.PI / 2), blue); fin.position.set(0.08, 0.6, 4.3);
  const band = new THREE.Mesh(lathe([[1.06, -2.6], [1.07, 1.8]], 22), blue); band.scale.set(1, 0.25, 1); band.position.y = -0.25;
  const glow = lightMat(0xff8a2a);
  const engines = [-1, 1].map((s) => {
    const e = new THREE.Group(), can = new THREE.Mesh(lathe([[0.55, -1.6], [0.62, -1.1], [0.6, 1.2], [0.45, 1.7]], 16), orange), noz = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), glow);
    noz.position.z = 1.71; e.add(can, noz); e.position.set(s * 3.2, -0.75, 1.0); return e;
  });
  g.add(fus, canopy, ...wings, ...stabs, fin, band, ...engines);
  g.scale.setScalar(8.5);
  return { group: shadowed(g), glow };
}

// A small ferry, about 50 m long, bow toward -Z.
export function makeBoat() {
  const g = new THREE.Group(), hullMat = paintMat(0xf3f1ea), blue = paintMat(0x2d5ea8), red = paintMat(0xd2483a);
  const outline = new THREE.Shape();
  outline.moveTo(0, 25); outline.bezierCurveTo(7, 14, 9, 6, 9, -6); outline.lineTo(8, -23); outline.lineTo(-8, -23); outline.lineTo(-9, -6); outline.bezierCurveTo(-9, 6, -7, 14, 0, 25);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 5, bevelEnabled: false }).rotateX(-Math.PI / 2), hullMat); hull.position.y = -0.5;
  const belt = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 1.4, bevelEnabled: false }).rotateX(-Math.PI / 2), blue); belt.position.y = -0.5; belt.scale.set(1.01, 1, 1.01);
  const deck = new THREE.Mesh(new RoundedBoxGeometry(12, 4, 26, 2, 0.6), hullMat); deck.position.set(0, 7, 3);
  const bridge = new THREE.Mesh(new RoundedBoxGeometry(10, 3.4, 8, 2, 0.5), hullMat); bridge.position.set(0, 10.6, -3);
  const glass = new THREE.Mesh(new RoundedBoxGeometry(10.2, 1.4, 8.2, 2, 0.3), glassMat()); glass.position.set(0, 10.8, -3);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 5, 14), red); funnel.position.set(0, 12.5, 8);
  g.add(hull, belt, deck, bridge, glass, funnel);
  return { group: shadowed(g) };
}

function makeFallbackCar(length, color) {
  const g = new THREE.Group(), body = paintMat(color);
  const lower = new THREE.Mesh(new RoundedBoxGeometry(length * 0.46, length * 0.18, length, 3, 2), body); lower.position.y = length * 0.14;
  const cabin = new THREE.Mesh(new RoundedBoxGeometry(length * 0.4, length * 0.15, length * 0.5, 3, 2), glassMat()); cabin.position.set(0, length * 0.3, length * 0.05);
  g.add(lower, cabin);
  return shadowed(g);
}

// Scale a loaded model so its length (Z extent) is `length` metres and stand it on y = 0.
function fitModel(src, length, color) {
  const m = src ? src.clone(true) : makeFallbackCar(length, color), box = new THREE.Box3().setFromObject(m), len = box.max.z - box.min.z || 1;
  const wrap = new THREE.Group(); wrap.add(m);
  m.scale.multiplyScalar(length / len);
  box.setFromObject(m); m.position.y -= box.min.y;
  return wrap;
}

export class Actors {
  constructor(scene, assets, { character = 'explorer', outfit = 'default', reduced = false } = {}) {
    this.reduced = reduced;
    this.group = new THREE.Group(); this.group.name = 'actors'; scene.add(this.group);
    this.outfit = new THREE.Matrix3();
    this.dir = 's';
    this.character = 'explorer';
    this.walkers = {};
    for (const [mode, sheet] of Object.entries(assets.walk)) {
      const mat = applyOutfit(new THREE.SpriteMaterial({ map: sheet.texture, alphaTest: 0.45, fog: true }), this.outfit);
      const sprite = new THREE.Sprite(mat); sprite.renderOrder = 3; sprite.visible = false;
      this.walkers[mode] = { sprite, sheet }; this.group.add(sprite);
    }
    const bikeMat = new THREE.SpriteMaterial({ map: assets.bike.texture, alphaTest: 0.45, fog: true });
    this.bike = { sprite: new THREE.Sprite(bikeMat), sheet: assets.bike }; this.bike.sprite.renderOrder = 3; this.bike.sprite.visible = false;
    this.group.add(this.bike.sprite);

    this.vehicles = {
      car: { group: fitModel(assets.car, CAR_LENGTH, 0xe0453a), shadow: 48 },
      supercar: { group: fitModel(assets.supercar, SUPERCAR_LENGTH, 0x2a6fd0), shadow: 50 },
      slowplane: { ...makeSlowPlane(), shadow: 140 },
      plane: { ...makeJet(), shadow: 190 },
      boat: { ...makeBoat(), shadow: 0 },
    };
    for (const v of Object.values(this.vehicles)) { v.group.visible = false; v.group.rotation.order = 'YXZ'; this.group.add(v.group); }

    const tex = radialTexture('rgba(20,30,20,.55)', 'rgba(20,30,20,0)');
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.shadow.visible = false; this.group.add(this.shadow);
    this.setCharacter(character); this.setOutfit(outfit);
  }

  setCharacter(id) { this.character = CHARACTERS[id] ? id : 'explorer'; }
  setOutfit(id) { this.outfit.set(...outfitMatrix(OUTFIT_FILTERS[id] || 'none')); this.outfitId = id; }

  // the sheet direction follows how the motion looks on screen (camera yaw), as the 2D game picks it from the map
  pickDirection(player, yaw) {
    const sx = player.vx * Math.cos(yaw) + player.vy * Math.sin(yaw), fwd = player.vx * Math.sin(yaw) - player.vy * Math.cos(yaw);
    if (Math.hypot(sx, fwd) > 0.6) this.dir = DIRS[(Math.round(Math.atan2(-fwd, sx) / (Math.PI / 4)) + 8) % 8];
    return Math.max(0, DIRS.indexOf(this.dir));
  }

  update(player, cam, dt, t, field) {
    const [X, Z] = toRender(player.x, player.y), groundY = field.renderY(player.x, player.y), mode = player.mode;
    const walking = mode === 'walk', biking = mode === 'bike';
    for (const w of Object.values(this.walkers)) w.sprite.visible = false;
    this.bike.sprite.visible = false;
    for (const [k, v] of Object.entries(this.vehicles)) v.group.visible = k === mode;

    let shadowSize = 0, shadowOpacity = 0.85;
    if (walking || biking) {
      const dir = this.pickDirection(player, cam?.yaw || 0), moving = !!player.moving;
      if (walking) {
        const w = this.walkers[CHARACTERS[this.character].mode] || this.walkers.walk, phase = ((player.phase % TAU) + TAU) % TAU;
        const frame = dir * 4 + (moving ? Math.floor(phase / (Math.PI / 2)) % 4 : 1);
        showCell(w.sprite, w.sheet.texture, w.sheet.size, w.sheet.cells[frame], EXPLORER_HEIGHT);
        w.sprite.position.set(X, groundY - 0.15, Z); w.sprite.visible = true;
        shadowSize = 8.5;
      } else {
        const frame = dir * 2 + (moving && Math.sin(player.phase) < 0 ? 1 : 0), b = this.bike;
        showCell(b.sprite, b.sheet.texture, b.sheet.size, b.sheet.cells[frame], BIKE_HEIGHT);
        b.sprite.position.set(X, groundY - 0.15, Z); b.sprite.visible = true;
        shadowSize = 11;
      }
      this.shadow.rotation.y = 0; this.shadow.scale.set(shadowSize, 1, shadowSize);
    } else {
      const v = this.vehicles[mode];
      if (v) {
        const g = v.group;
        g.position.set(X, mode === 'boat' ? Math.max(0, player.h) + (this.reduced ? 0 : Math.sin(t * 1.4) * 0.5) : player.h, Z);
        g.rotation.y = -player.heading;
        if (mode === 'car' || mode === 'supercar') {
          const f = 16, sin = Math.sin(player.heading), cos = Math.cos(player.heading);
          const a = field.renderY(player.x + sin * f, player.y - cos * f), b = field.renderY(player.x - sin * f, player.y + cos * f);
          g.rotation.x = Math.atan2(a - b, 2 * f);
          g.rotation.z = damp(g.rotation.z, clamp(-(player.turnRate || 0) * player.speed * 0.004, -0.06, 0.06), 6, dt);
        } else if (mode === 'slowplane' || mode === 'plane') {
          g.rotation.z = player.bank || 0;
          g.rotation.x = clamp((player.climb || 0) * 0.012, -0.25, 0.3) + (this.reduced ? 0 : Math.sin(t * 1.3) * 0.015);
          if (!this.reduced) g.position.y += Math.sin(t * 1.7) * 0.4 * clamp(player.h - groundY - 4, 0, 1);
          if (v.glow) v.glow.emissiveIntensity = 1.2 + (player.speed / (78 * 16)) * 4;
        }
        const high = Math.max(0, player.h - groundY);
        shadowSize = v.shadow * (1 + high / 200); shadowOpacity = clamp(1 - high / 400, 0.15, 1);
        this.shadow.rotation.y = -player.heading; this.shadow.scale.set(shadowSize, 1, shadowSize * 0.7);
      }
    }
    this.shadow.visible = shadowSize > 0;
    this.shadow.material.opacity = shadowOpacity;
    this.shadow.position.set(X, groundY + 0.3, Z);
  }
}
