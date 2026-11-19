// Arrival rules (pure, game frame metres). Places carry `point` [x,y] and, when the point lies in a building, `ring`.
// Walk/bike use the 2D game's updateEncounters; car/supercar reach 110 m; any ground mode also fires on building contact.
import { updateEncounters, segmentDistance, placeRadius, distance } from '../../../dist/geography.js';

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

// Places entered during the step from -> to. `held` is a Set of ids that fired and have not re-armed.
export function arrivals(places, from, to, held, mode, collider) {
  if (!isGround(mode)) return [];
  const entered = [];
  const car = isCar(mode);
  if (car) {
    for (const p of places) {
      if (distance(from, p.point) > CAR_REACH + CAR_REARM && (distance(to, p.point) > CAR_REACH + CAR_REARM)) held.delete(p.id);
      if (!held.has(p.id) && segmentDistance(p.point, from, to) <= CAR_REACH) { held.add(p.id); entered.push(p); }
    }
  } else {
    // a place held by building contact stays held until contact is lost, even when the walker is outside the point radius
    const keep = places.filter((p) => p.ring && held.has(p.id) && contactOf(p, from[0], from[1], collider) <= CONTACT + CONTACT_REARM);
    const rest = keep.length ? places.filter((p) => !keep.includes(p)) : places;
    entered.push(...updateEncounters(rest, from, to, held));
  }
  // building contact (all ground modes)
  for (const p of places) {
    if (!p.ring || entered.includes(p)) continue;
    const c = contactOf(p, to[0], to[1], collider);
    if (held.has(p.id)) {
      if (c > CONTACT + CONTACT_REARM && !car && distance(to, p.point) > placeRadius(p) + 3) held.delete(p.id);
      continue;
    }
    if (c <= CONTACT) { held.add(p.id); entered.push(p); }
  }
  return entered.sort((a, b) => distance(to, a.point) - distance(to, b.point));
}
