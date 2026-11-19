// Player movement for every travel mode (pure, game frame: x east, y south, metres; heading 0 = north, clockwise).
// Ground modes sit on field.renderY; flying modes carry `alt` (render metres above sea level) and fly over everything.
import { createCar, driveCar } from './car.js';
import { VEX } from '../frame.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrapAngle = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const TAU = Math.PI * 2;

export const FACTOR = { walk: 1, bike: 2, car: 4, supercar: 8, slowplane: 4, plane: 16, boat: 0 };
// land: braking rate while a landing descends with the stick released (the jet stops within ~160 m, the slow plane ~50 m)
const FLIGHT = {
  slowplane: { accel: 0.75, brake: 0.95, turn: 0.95, altitude: 270, land: 6 },
  plane: { accel: 0.55, brake: 0.75, turn: 0.65, altitude: 600, land: 8 },
};
const isFlying = m => m === 'slowplane' || m === 'plane';
const isCar = m => m === 'car' || m === 'supercar';
const WALK_ACCEL = 6, RADIUS = 5, STEP = 3, CAR_RANGE = 600, SNAP_RANGE = 350;

export const TOAST = {
  water: '아직 물 위예요. 땅 위로 날아간 뒤 내려요.',
  carNeedsRoad: '가까운 차도가 없어요. 도로 가까이 가서 타요.',
  carFallback: '가까운 차도가 없어서 걸어서 내렸어요',
};

export function createPlayer({ x, y, mode = 'walk', movementMode = 'roads', speedSetting = 1 } = {}) {
  return {
    x, y, h: 0, heading: 0, speed: 0, vx: 0, vy: 0, mode, pending: null, alt: 0, bank: 0, climb: 0, turnRate: 0,
    phase: 0, moving: false, car: null, hint: null, movementMode, speedSetting,
    roadCursor: null, route: null, routeKey: null, routeAccess: null, tookOff: false, shore: null,
  };
}

export const speedMax = p => 78 * p.speedSetting * (FACTOR[p.mode] || 1);

function groundH(p, s) { return s.field.renderY(p.x, p.y); }

// The water surface (render metres) under a game-frame point, or null on dry land: the sea plane at Y = 0 and each
// carved lake at its shore level, as world/water.js draws it (level * VEX - 0.2). guard: WaterGuard (#game/water.js);
// levels: heightfield.js carveWater's [{feature, level}] (the same feature objects the guard holds).
export function waterSurface(guard, levels = []) {
  const lakes = new Map(levels.map(({ feature, level }) => [feature, level * VEX - 0.2]));
  return (x, y) => { const f = guard.waterAt([x, y]); return f ? lakes.get(f) ?? 0 : null; };
}

// A landing's descent floor: the ground, or the water surface over water (the sea floor is carved under the water
// plane, so a landing called off out at sea would otherwise dip under it). Without services.waterY, water is the sea.
function descentFloor(p, s, ground) {
  const w = s.waterY ? s.waterY(p.x, p.y) : s.water.waterAt?.([p.x, p.y]) ? 0 : null;
  return w == null ? ground : Math.max(ground, w);
}

// Roads mode keeps walkers on the walking graph: pull them onto the nearest road (as the 2D game does when switching).
function snapToRoad(p, s) {
  if (p.movementMode !== 'roads' || (p.mode !== 'walk' && p.mode !== 'bike')) return;
  const n = s.navigator.nearest([p.x, p.y], null, SNAP_RANGE);
  // never across water; a walker already standing on water may snap to a dry road (wetStepOk)
  if (n && (s.water.blocked([p.x, p.y]) ? wetStepOk(p, s, n.p) : !s.water.clip([p.x, p.y], n.p).blocked)) { p.x = n.p[0]; p.y = n.p[1]; }
  p.roadCursor = null; p.route = null; p.routeKey = null; p.routeAccess = null;
}

export function setMode(p, mode, s) {
  if (mode === p.mode && !p.pending) return { ok: true };
  const from = p.mode, wasFlying = isFlying(from);
  if (isFlying(mode)) {
    p.pending = null;
    if (!wasFlying) {
      p.alt = groundH(p, s); p.speed = Math.max(p.speed, 78 * p.speedSetting * FACTOR[mode] * 0.25);
      p.tookOff = true; p.car = null; p.roadCursor = null; p.route = null; p.routeKey = null; p.routeAccess = null;
    }
    p.mode = mode;
    return { ok: true };
  }
  if (wasFlying) {   // landing: descend first, switch on touch-down (WaterGuard decides water, here and at touch-down)
    if (s.water.blocked([p.x, p.y])) return { ok: false, toast: TOAST.water };
    p.pending = mode;
    return { ok: true };
  }
  if (isCar(mode)) {
    const car = createCar(s.graph, p.x, p.y, p.heading, CAR_RANGE);
    if (!car) return { ok: false, toast: TOAST.carNeedsRoad };
    p.car = car; p.x = car.x; p.y = car.y; p.heading = car.heading; p.speed = 0; p.vx = p.vy = 0;
  } else {
    p.car = null; p.hint = null;
    if (mode === 'walk' || mode === 'bike') { p.speed = 0; p.vx = p.vy = 0; }
  }
  p.mode = mode;
  p.roadCursor = null; p.route = null; p.routeKey = null; p.routeAccess = null;
  if (mode === 'walk' || mode === 'bike') snapToRoad(p, s);
  return { ok: true };
}

// Camera-relative stick -> world direction.
function stickDir(input) {
  const yaw = input.camYaw || 0, ix = input.x || 0, iy = input.y || 0;
  const dx = Math.cos(yaw) * ix + Math.sin(yaw) * iy, dy = Math.sin(yaw) * ix - Math.cos(yaw) * iy;
  const len = Math.hypot(dx, dy), mag = Math.min(1, len);
  // unit direction + clamped magnitude: response is linear in the stick and a diagonal never exceeds the cap
  return len > 1e-9 ? { dx: dx / len, dy: dy / len, mag, ix, iy } : { dx: 0, dy: 0, mag: 0, ix, iy };
}

export function stepPlayer(p, input, s, dt) {
  const events = [];
  let toast;
  if (p.mode === 'boat') return { events };   // the ferry drives a boat player
  if (p.tookOff) { p.tookOff = false; events.push('took-off'); }
  const flying = isFlying(p.mode), bx = [p.x, p.y];
  const bounds = s.bounds;
  const st = stickDir(input);
  let { dx, dy, mag } = st;
  const manual = mag >= 0.01, target = input.target || null;
  const vmax = speedMax(p);
  const clampPos = () => { if (bounds) { p.x = clamp(p.x, bounds[0], bounds[2]); p.y = clamp(p.y, bounds[1], bounds[3]); } };

  if (isCar(p.mode) && p.car && !p.pending) {
    const di = { throttle: 0, turn: null, stickHeading: null, target: null };
    if (input.camMode === 'follow') {
      di.throttle = st.iy; di.turn = Math.abs(st.ix) > 0.45 ? (st.ix > 0 ? 'right' : 'left') : null;
    } else if (manual) { di.stickHeading = Math.atan2(dx, -dy); di.throttle = mag; }
    di.target = manual ? null : target;
    if (input.turn) di.turn = input.turn;
    const r = driveCar(p.car, di, vmax, dt, bounds);
    p.x = r.x; p.y = r.y; p.heading = r.heading; p.speed = r.speed; p.hint = r.hint;
    p.vx = Math.sin(r.heading) * r.speed; p.vy = -Math.cos(r.heading) * r.speed; p.turnRate = p.car.turnRate;
    events.push(...r.events);
  } else if (p.mode === 'walk' || p.mode === 'bike') {
    p.hint = null;
    walkStep(p, s, input, st, manual, target, vmax, dt, events);
  } else {
    // flying (or descending to land)
    const V = FLIGHT[p.mode] || FLIGHT.plane;
    let ndx = dx, ndy = dy, nmag = mag;
    if (!manual && target) {
      const tx = target[0] - p.x, ty = target[1] - p.y, d = Math.hypot(tx, ty), stop = p.speed * 0.4 + 20;
      if (d >= stop) { ndx = tx / d; ndy = ty / d; nmag = clamp(d / 30, 0.35, 1); } else { nmag = 0; }
    }
    let steer = 0, throttle = 0;
    const landing = !!p.pending && !manual;   // a landing with the stick released brakes hard and comes straight down
    if (landing) nmag = 0;
    const h = p.heading, along = ndx * Math.sin(h) - ndy * Math.cos(h), lateral = ndx * Math.cos(h) + ndy * Math.sin(h), angle = Math.atan2(lateral, along);
    if (manual && input.camMode === 'follow') { steer = clamp(st.ix, -1, 1); throttle = st.iy; }
    else if (manual) {
      if (Math.abs(angle) > 1.92) throttle = -nmag;
      else { steer = clamp(angle / 0.7, -1, 1); throttle = nmag * Math.max(0.3, Math.cos(Math.min(Math.abs(angle), 1.4))); }
    } else if (nmag > 0) {
      steer = Math.abs(angle) > 2.6 ? (lateral >= 0 ? 1 : -1) : clamp(angle / 0.7, -1, 1);
      throttle = nmag * Math.max(0.3, Math.cos(Math.min(Math.abs(angle), 1.4)));
    }
    p.turnRate = damp(p.turnRate || 0, steer * V.turn, 10, dt); p.heading = wrapAngle(p.heading + p.turnRate * dt);
    if (landing) p.speed = Math.max(0, damp(p.speed, 0, V.land, dt) - 4 * dt);
    else if (throttle > 0.01) { const t = vmax * Math.min(1, throttle); p.speed = damp(p.speed, t, p.speed < t ? V.accel : V.brake, dt); }
    else if (throttle < -0.01) p.speed = Math.max(0, damp(p.speed, 0, V.brake * (1.5 + 2.5 * -throttle), dt) - 2 * dt);
    else p.speed = damp(p.speed, 0, V.brake * 0.6, dt);
    p.vx = Math.sin(p.heading) * p.speed; p.vy = -Math.cos(p.heading) * p.speed;
    p.x += p.vx * dt; p.y += p.vy * dt; clampPos();
    p.hint = null;
    // altitude: above the higher of here and just ahead, plus the cruising height; a landing descends to the ground,
    // or to the water surface over water (descentFloor)
    const ground = s.field.renderY(p.x, p.y), ahead = s.field.renderY(p.x + p.vx * 1.5, p.y + p.vy * 1.5);
    const floor = p.pending ? descentFloor(p, s, ground) : ground;
    const desired = p.pending ? floor : Math.max(ground, ahead) + V.altitude, prev = p.alt;
    p.alt = damp(p.alt, desired, p.pending ? 1.4 : 0.9, dt);
    p.alt = Math.max(p.alt, floor + (p.pending ? 0 : 3));
    p.climb = (p.alt - prev) / dt;
    p.bank = damp(p.bank, clamp(-(p.turnRate || 0) * 0.55, -0.75, 0.75), 3, dt);
    if (p.pending && p.alt - floor < 1.5 && s.water.blocked([p.x, p.y])) {
      // came down over water (the stick carried it out to sea): call the landing off and climb back
      p.pending = null; p.speed = Math.max(p.speed, vmax * 0.25);
      events.push('landing-cancelled'); toast = TOAST.water;
    } else if (p.pending && p.alt - floor < 1.5) {   // touch-down (a bridge over water lands at the water surface)
      let m = p.pending; p.pending = null; p.speed *= 0.2;
      p.vx *= 0.2; p.vy *= 0.2; p.bank = 0; p.climb = 0; p.turnRate = 0;
      if (isCar(m)) {
        const car = createCar(s.graph, p.x, p.y, p.heading, CAR_RANGE);
        if (car) { p.car = car; p.x = car.x; p.y = car.y; p.heading = car.heading; car.speed = p.speed; }
        else { m = 'walk'; toast = TOAST.carFallback; }
      }
      p.mode = m; p.alt = 0;
      if (m === 'walk' || m === 'bike') snapToRoad(p, s);
      events.push('landed');
    }
  }
  p.h = isFlying(p.mode) ? p.alt : groundH(p, s);
  const moved = Math.hypot(p.x - bx[0], p.y - bx[1]);
  p.phase = (p.phase + (moved / (p.mode === 'bike' ? 30 : 24)) * TAU) % TAU;
  p.moving = moved > 0.02;
  return toast ? { events, toast } : { events };
}

// input.maxAccess: how far from the target the road route may end (navigator.route; 2D walkTo: 350 m for a place,
// 800 m for a tapped point, the default). The route's access point, its last point on the road, stays in p.routeAccess.
function walkStep(p, s, input, st, manual, target, vmax, dt, events) {
  const roads = p.movementMode === 'roads';
  let { dx, dy, mag } = st;
  if (manual) { p.route = null; p.routeKey = null; p.routeAccess = null; }
  const before = [p.x, p.y];
  if (roads) {
    if (!manual && target) {
      const key = target[0] + ',' + target[1];
      if (p.routeKey !== key) {
        p.routeKey = key;
        const r = s.navigator.route([p.x, p.y], target, input.maxAccess || 800);
        p.route = r ? r.points.slice() : null;
        p.routeAccess = r ? [r.access[0], r.access[1]] : null;
        if (!r) events.push('no-route');
      }
      if (p.route && p.route.length) {
        let budget = vmax * dt;
        while (budget > 0 && p.route.length) {
          const d0 = p.route[0], d = Math.hypot(d0[0] - p.x, d0[1] - p.y);
          const step = d <= budget ? [d0[0], d0[1]] : [p.x + (d0[0] - p.x) * budget / d, p.y + (d0[1] - p.y) * budget / d];
          let clip;
          if (wet(p, s)) { const ok = wetStepOk(p, s, step); clip = { position: ok ? step : [p.x, p.y], blocked: !ok }; }
          else clip = s.water.clip([p.x, p.y], step);
          p.x = clip.position[0]; p.y = clip.position[1];
          if (clip.blocked) { p.route = null; events.push('water'); break; }
          if (d <= budget) { p.route.shift(); budget -= d; } else budget = 0;
        }
      }
    } else if (manual) {
      const m = Math.max(1, Math.hypot(dx, dy)); dx /= m; dy /= m;
      const res = s.navigator.move([p.x, p.y], [dx, dy], vmax * dt * Math.min(1, mag), p.roadCursor);
      let at = before, ok = true;
      if (wet(p, s)) { ok = wetStepOk(p, s, res.position); if (ok) at = res.position; }
      else for (const q of res.trace || [res.position]) {
        const clip = s.water.clip(at, q); at = clip.position;
        if (clip.blocked) { ok = false; break; }
      }
      p.x = at[0]; p.y = at[1]; p.roadCursor = ok ? res.cursor : null;
      if (!ok) events.push('water');
    }
    const ddx = p.x - before[0], ddy = p.y - before[1], d = Math.hypot(ddx, ddy);
    p.vx = ddx / dt; p.vy = ddy / dt; p.speed = d / dt;
    if (d > 0.01) p.heading = Math.atan2(ddx, -ddy);
  } else {
    if (!manual && target) {
      const tx = target[0] - p.x, ty = target[1] - p.y, d = Math.hypot(tx, ty);
      if (d >= 12) { dx = tx / d; dy = ty / d; mag = clamp(d / 30, 0.35, 1); } else mag = 0;
    }
    p.vx = damp(p.vx, dx * vmax * mag, WALK_ACCEL, dt); p.vy = damp(p.vy, dy * vmax * mag, WALK_ACCEL, dt);
    p.speed = Math.hypot(p.vx, p.vy); if (p.speed > 0.5) p.heading = Math.atan2(p.vx, -p.vy);
    let nx = p.x, ny = p.y;
    const steps = Math.max(1, Math.ceil(p.speed * dt / STEP));
    for (let k = 0; k < steps; k++) {
      nx += p.vx * dt / steps; ny += p.vy * dt / steps;
      if (s.bounds) { nx = clamp(nx, s.bounds[0], s.bounds[2]); ny = clamp(ny, s.bounds[1], s.bounds[3]); }
      const r = s.collider.resolve(nx, ny, RADIUS);
      if (!r.hit) continue;
      nx = r.x; ny = r.y;
      const into = p.vx * r.nx + p.vy * r.ny;   // slide: drop the part of the motion that goes into the wall
      if (into < 0) { p.vx -= r.nx * into; p.vy -= r.ny * into; }
    }
    if (wet(p, s)) {   // standing on water: any step toward land is allowed, none further out
      if (!wetStepOk(p, s, [nx, ny])) { events.push('water'); nx = p.x; ny = p.y; p.vx *= 0.3; p.vy *= 0.3; p.speed *= 0.3; }
      p.x = nx; p.y = ny;
      if (s.bounds) { p.x = clamp(p.x, s.bounds[0], s.bounds[2]); p.y = clamp(p.y, s.bounds[1], s.bounds[3]); }
      return;
    }
    const clip = s.water.clip([p.x, p.y], [nx, ny]);
    if (clip.blocked) {
      events.push('water');
      const slideX = s.water.clip([p.x, p.y], [nx, p.y]), slideY = s.water.clip([p.x, p.y], [p.x, ny]);
      if (!slideX.blocked) ny = p.y;
      else if (!slideY.blocked) nx = p.x;
      else { nx = clip.position[0]; ny = clip.position[1]; p.vx *= 0.3; p.vy *= 0.3; p.speed *= 0.3; }
    }
    p.x = nx; p.y = ny;
  }
  if (s.bounds) { p.x = clamp(p.x, s.bounds[0], s.bounds[2]); p.y = clamp(p.y, s.bounds[1], s.bounds[3]); }
}

// A walker should never stand on water, but an old save or a bug can put one there: rather than freeze (every step
// from water is blocked), let them take any step that brings them closer to the nearest land, and none further out.
const wet = (p, s) => s.water.blocked([p.x, p.y]);
function wetStepOk(p, s, to) {
  if (!s.water.blocked(to)) return true;
  if (!p.shore || Math.hypot(p.x - p.shore.at[0], p.y - p.shore.at[1]) > 100) {
    p.shore = { at: [p.x, p.y], land: s.water.nearestLand ? s.water.nearestLand([p.x, p.y]) : null };
  }
  const land = p.shore.land;
  if (!land) return true;   // no land within reach: moving is better than freezing
  return Math.hypot(to[0] - land[0], to[1] - land[1]) < Math.hypot(p.x - land[0], p.y - land[1]) - 1e-6;
}
