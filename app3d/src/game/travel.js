// Travel targets (pure: no DOM, no three.js): where the explorer is heading and why, ported from the 2D game's
// world.js walkTo / navigate / boardFerry and the step's encounter rule (dist/world.js l.80-83, 94-104; P24 widened).
// A trip is one of
//   a ground tap   {target}                         every place entered on the way opens (2D: no routePlace)
//   a guided trip  {target, place}                  찾아가기, 길 안내, a mission's 출발 or a pin (ctl.goTo): only its own
//                                                    place opens on the way, the others stay held (2D routePlace); at
//                                                    the route end the place opens when it is in reach or the explorer
//                                                    stands on the road's access point (2D routeAccess)
//   the ferry      {target: 남당항's pier, ferry}   nothing opens on the way; the ferry dialog opens at the pier
//                                                    (2D ferryPending)
// main.js owns the travel object, moves the explorer and calls tripStep once a step.
import { josa } from '../ui/hud.js';

/** How far (m) from the goal a road route may end: a place 350, a tapped point 800 (2D walkTo id ? 350 : 800). */
export const PLACE_ACCESS = 350, TAP_ACCESS = 800;
/** Standing within this many metres of the access point counts as on it (2D: distance(position, routeAccess) < 2). */
export const AT_ACCESS = 2;
/** A trip to the pier for the ferry that ends away from it, or is stopped by a dialog on the way (3D: no 2D line). */
export const FERRY_STOPPED = '배 타러 가는 길을 멈췄어요. 남당항에서 ‘배 타고 죽도로’를 눌러요.';
/** A flight to a place ends over it: arrivals never fire in the air (3D: the 2D plane walks on the map). */
export const landHint = (place) => `${place.name} 위에 왔어요. ‘탈것’에서 걷기를 고르면 내려서 탐방할 수 있어요.`;

export function createTravel() { return { target: null, place: null, access: null, ferry: false }; }

/**
 * Head for `point` ([x, y] game metres): a ground tap, a guided trip to `place`, or the pier with `ferry`. With the
 * player (sim/player.js), its last route's access point and a car's planned route go: the next step plans afresh.
 */
export function startTrip(t, point, { place = null, ferry = false } = {}, player = null) {
  t.target = [point[0], point[1]]; t.place = place; t.access = null; t.ferry = !!ferry;
  if (player) { player.route = null; player.routeKey = null; player.routeAccess = null; if (player.car) { player.car.goal = null; player.car.route = null; } }
}

/** End the trip (arrived, stopped, replaced) and, with the player, its road route: -> what it was ({place, access, ferry}). */
export function endTrip(t, player = null) {
  const was = { place: t.place, access: t.access, ferry: t.ferry };
  t.target = null; t.place = null; t.access = null; t.ferry = false;
  if (player) { player.route = null; player.routeKey = null; player.routeAccess = null; }
  return was;
}

/** The road route's reach for this trip (navigator.route's maxAccess). */
export const accessLimit = (t) => (t.place ? PLACE_ACCESS : TAP_ACCESS);

const isFlying = (m) => m === 'slowplane' || m === 'plane';
/**
 * The trip's end this step (player: sim/player.js after stepPlayer; events: its events): on foot within 12 m of the
 * target, or a road route run out (or stopped by water); a plane over the spot; a car's 'arrived' at the car road
 * point nearest the target.
 */
export function tripEnded(t, p, events = []) {
  if (!t.target) return false;
  if (events.includes('arrived')) return true;
  const d = Math.hypot(t.target[0] - p.x, t.target[1] - p.y);
  if (p.mode === 'walk' || p.mode === 'bike') return d < 12 || (p.movementMode === 'roads' && p.routeKey != null && !p.route?.length);
  return isFlying(p.mode) && d < p.speed * 0.4 + 20;
}

/**
 * One simulation step of the trip, after the explorer moved (2D world.js l.80-83). in:
 *   entered     the places arrivals() reported this step (already held: the ones not opened stay held)
 *   ended       the trip's end was reached this step (walking within 12 m, a finished or blocked road route, a plane
 *               over the spot, a car's 'arrived')
 *   at          the explorer's [x, y]
 *   access      the road route's access point once the walk's route is planned (player.routeAccess), else null
 *   flying      in the air (arrivals never fire there)
 *   reach(place) -> bool   the place can be visited from here (main.js reachable: 2D canVisit, car reach, wall contact)
 *   nearPier    standing near 남당항's pier (the ferry dialog can open)
 * -> {open: the places to open as physical arrivals, hold: hold the places in reach before (a route-end visit, 2D
 *     openPlace), ferry: open the ferry dialog, note: a toast or null, ended: the trip is over (tidy the route)}
 */
export function tripStep(t, { entered = [], ended = false, at = [0, 0], access = null, flying = false, reach = () => false, nearPier = false } = {}) {
  const out = { open: [], hold: false, ferry: false, note: null, ended: false };
  if (!t.target) { out.open = entered; return out; }
  if (access && t.place) t.access = [access[0], access[1]];
  if (t.ferry) {
    if (!ended) return out;
    endTrip(t); out.ended = true;
    if (nearPier) out.ferry = true; else out.note = FERRY_STOPPED;
    return out;
  }
  if (t.place) {
    const hit = entered.find((p) => p.id === t.place.id);
    if (hit) { endTrip(t); out.open = [hit]; out.ended = true; return out; }
    if (!ended) return out;   // the places passed on the way stay held
    const { place, access: a } = endTrip(t);
    out.ended = true;
    if (flying) out.note = landHint(place);
    else if (reach(place) || (a && Math.hypot(at[0] - a[0], at[1] - a[1]) < AT_ACCESS)) { out.open = [place]; out.hold = true; }
    return out;
  }
  out.open = entered;
  if (ended) { endTrip(t); out.ended = true; }
  return out;
}

/**
 * The 2D navigate toast (world.js l.104) for a guided trip, told for the 3D vehicles (player: {mode, movementMode}):
 * flying 날아가요; on roads (길로만 on foot, a car on its roads) 근처 길까지 따라가요; else 이동해요. The 2D "이동 속도"
 * buttons are the 3D 탈것.
 */
export function tripToast(place, p) {
  const name = place.name, obj = josa(name, 'obj'), road = p.mode === 'car' || p.mode === 'supercar' || p.movementMode === 'roads';
  const go = isFlying(p.mode) ? `${obj} 향해 날아가요.` : road ? ' 근처 길까지 따라가요.' : `${obj} 향해 이동해요.`;
  return `${name}${go} 멀면 탈것을 바꾸어 보세요.`;
}
