// Orbit camera (pure, no Three.js). Ported from spike/3d-naepo updateCamera.
// Game frame in (x east, y south, heading 0 = north clockwise), render frame out ([X,Y,Z], Z = south).
// `view = {userYaw, pitchAdj, zoom}` is owned by the controls; in follow mode the camera eases `view.userYaw` back to 0.
import { toRender, fromRender } from '../frame.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrapAngle = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const dampAngle = (a, b, k, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));

export const PITCH_MIN = 4, PITCH_MAX = 88, ZOOM_MIN = 0.2, ZOOM_MAX = 4, FLOOR = 12, FOLLOW_IDLE = 2.2;

export const BASE = {
  walk: { tilt: [185, 50], follow: [82, 17], lead: 0.28 },
  bike: { tilt: [260, 49], follow: [110, 16], lead: 0.28 },
  car: { tilt: [500, 48], follow: [200, 15], lead: 0.28 },
  supercar: { tilt: [620, 48], follow: [240, 15], lead: 0.28 },
  slowplane: { tilt: [760, 46], follow: [340, 16], lead: 0.3 },
  plane: { tilt: [1500, 52], follow: [600, 18], lead: 0.15 },
};
BASE.boat = BASE.car;
const LEAD_BOAT = 0.28;

export function createCamera(mode = 'tilt') {
  return { mode, yaw: 0, base: null, tx: null, ty: 0, tz: 0, dist: 0, fov: 52, lastUserInput: -Infinity, clock: 0, seen: null };
}

export function stepCamera(cam, player, dt, view, field) {
  view = view || {};
  const userYaw0 = view.userYaw || 0, pitchAdj = view.pitchAdj || 0, zoom = clamp(view.zoom ?? 1, ZOOM_MIN, ZOOM_MAX);
  const spec = BASE[player.mode] || BASE.walk;
  const [dist0, pitch0] = cam.mode === 'tilt' ? spec.tilt : spec.follow;
  cam.clock += dt;
  // any change to the view that the camera did not make itself counts as the user touching the screen
  const s = cam.seen;
  if (s && (s.userYaw !== userYaw0 || s.pitchAdj !== pitchAdj || s.zoom !== (view.zoom ?? 1))) cam.lastUserInput = cam.clock;
  let userYaw = userYaw0, yawGoal;
  if (cam.mode === 'tilt') yawGoal = userYaw;
  else {
    cam.base = cam.base ?? player.heading;
    const idle = cam.clock - cam.lastUserInput >= FOLLOW_IDLE;
    if (idle && player.speed > 2) {
      cam.base = dampAngle(cam.base, player.heading, player.mode === 'walk' ? 1.6 : 2.2, dt);
      userYaw = damp(userYaw, 0, 1.5, dt);
      if (view.userYaw !== undefined) view.userYaw = userYaw;
    }
    yawGoal = cam.base + userYaw;
  }
  cam.seen = { userYaw: view.userYaw ?? 0, pitchAdj, zoom: view.zoom ?? 1 };
  cam.yaw = dampAngle(cam.yaw, yawGoal, 7, dt);

  const lead = player.mode === 'boat' ? LEAD_BOAT : spec.lead;
  const [tx, tz] = toRender(player.x + (player.vx || 0) * lead, player.y + (player.vy || 0) * lead);
  const ty = player.h + (player.mode === 'walk' || player.mode === 'bike' ? 12 : 6);
  if (cam.tx === null) { cam.tx = tx; cam.ty = ty; cam.tz = tz; cam.dist = dist0 * zoom; cam.yaw = yawGoal; }
  const follow = 5 + player.speed / 18;
  cam.tx = damp(cam.tx, tx, follow, dt); cam.tz = damp(cam.tz, tz, follow, dt); cam.ty = damp(cam.ty, ty, 6, dt);
  cam.dist = damp(cam.dist || dist0, dist0 * zoom, 2.5, dt);

  const pitch = clamp(pitch0 + pitchAdj, PITCH_MIN, PITCH_MAX) * Math.PI / 180;
  const X = cam.tx - Math.sin(cam.yaw) * Math.cos(pitch) * cam.dist;
  const Z = cam.tz + Math.cos(cam.yaw) * Math.cos(pitch) * cam.dist;
  let Y = cam.ty + Math.sin(pitch) * cam.dist;
  // field.renderY takes game coordinates
  const [gx, gy] = fromRender(X, Z);
  Y = Math.max(Y, field.renderY(gx, gy) + FLOOR);

  const fast = player.mode === 'plane' ? clamp(player.speed / (78 * 16), 0, 1)
    : player.mode === 'car' || player.mode === 'supercar' ? clamp(player.speed / (78 * 4), 0, 1) * 0.4 : 0;
  cam.fov = damp(cam.fov, 52 + fast * 14, 2, dt);
  return { position: [X, Y, Z], target: [cam.tx, cam.ty, cam.tz], fov: cam.fov, yaw: cam.yaw };
}
