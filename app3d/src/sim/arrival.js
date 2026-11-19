// Arrival rules (pure, game frame metres). Places carry `point` [x,y] and, when the point lies in a building, `ring`.
// Walk/bike use the 2D game's updateEncounters; car/supercar reach 110 m; any ground mode also fires on building contact.
import { updateEncounters, segmentDistance, placeRadius, distance } from '#game/geography.js';

export const CAR_REACH = 110;
export const CAR_REARM = 80;          // extra metres beyond the reach before a place re-arms for a car
export const CONTACT = 60;            // collider.distance(ring) + 10 <= 60 counts as touching the building
export const CONTACT_REARM = 20;      // leave contact range by 20 m to re-arm
const PAD = 10;

const isCar = (m) => m === 'car' || m === 'supercar';
const isGround = (m) => m === 'walk' || m === 'bike' || isCar(m);
const contactOf = (place, x, y, collider) => (place.ring && collider ? collider.distance(place.ring, x, y) + PAD : Infinity);

// Nearest place by point distance, or by building contact (+10) for places whose point is inside a building.
export function nearestPlace(places, player, collider) {
  let best = null;
  for (const place of places) {
    const d = Math.min(Math.hypot(place.point[0] - player.x, place.point[1] - player.y), contactOf(place, player.x, player.y, collider));
    if (!best || d < best.distance) best = { place, distance: d };
  }
  return best;
}

// The single re-arm rule: a held place re-arms only when the player is outside every way it could have fired,
// i.e. beyond the mode's point radius + margin AND (if it has a ring) beyond wall contact + 20 m.
function outsideAll(p, mode, from, to, collider) {
  const car = isCar(mode), r = (car ? CAR_REACH : placeRadius(p)) + (car ? CAR_REARM : 3);
  if (distance(from, p.point) <= r || distance(to, p.point) <= r) return false;
  return !p.ring || contactOf(p, to[0], to[1], collider) > CONTACT + CONTACT_REARM;
}

// Places entered during the step from -> to. `held` is a Set of ids that fired and have not re-armed.
export function arrivals(places, from, to, held, mode, collider) {
  if (!isGround(mode)) return [];
  const entered = [];
  if (isCar(mode)) {
    for (const p of places) {
      if (held.has(p.id) && outsideAll(p, mode, from, to, collider)) held.delete(p.id);
      if (!held.has(p.id) && segmentDistance(p.point, from, to) <= CAR_REACH) { held.add(p.id); entered.push(p); }
    }
  } else {
    // updateEncounters re-arms by point distance only, so wall-held places are kept out of it until outsideAll says so
    const keep = places.filter((p) => held.has(p.id) && !outsideAll(p, mode, from, to, collider));
    entered.push(...updateEncounters(keep.length ? places.filter((p) => !keep.includes(p)) : places, from, to, held));
  }
  // building contact (all ground modes)
  for (const p of places) {
    if (!p.ring || entered.includes(p) || held.has(p.id)) continue;
    if (contactOf(p, to[0], to[1], collider) <= CONTACT) { held.add(p.id); entered.push(p); }
  }
  return entered.sort((a, b) => distance(to, a.point) - distance(to, b.point));
}

// The 탐방 button / E key: the nearest place (by point or building contact, as nearestPlace) within `range` metres that
// `canReach(place)` (main.js reachable: the 2D canVisit rule, car reach, wall contact) accepts now, else null.
export function nearestVisitable(places, player, collider, canReach, range = 600) {
  const near = [];
  for (const place of places) {
    const d = Math.hypot(place.point[0] - player.x, place.point[1] - player.y);
    if (d > range + 400) continue;   // a building ring never spans 400 m: skip the wall test for far places
    const dist = Math.min(d, contactOf(place, player.x, player.y, collider));
    if (dist <= range) near.push({ place, dist });
  }
  near.sort((a, b) => a.dist - b.dist);
  for (const { place } of near) if (canReach(place)) return place;
  return null;
}
