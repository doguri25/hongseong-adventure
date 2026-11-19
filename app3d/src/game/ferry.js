// Namdang <-> Jukdo ferry crossing (pure, game frame metres): a straight 8 s trip between the two docks.
export const VOYAGE_SECONDS = 8;

// docks = { namdang: [x,y], jukdo: [x,y] }, each from WaterGuard.nearestLand of the place point.
export function ferryDocks(water, namdangPoint, jukdoPoint) {
  return { namdang: water.nearestLand(namdangPoint) || namdangPoint, jukdo: water.nearestLand(jukdoPoint) || jukdoPoint };
}

export function startVoyage(returning, docks) {
  const start = [...(returning ? docks.jukdo : docks.namdang)], end = [...(returning ? docks.namdang : docks.jukdo)];
  return { returning: !!returning, start, end, elapsed: 0, duration: VOYAGE_SECONDS };
}

// Heading 0 = north, clockwise (game frame y points south).
export const headingOf = (dx, dy) => Math.atan2(dx, -dy);

export function advanceVoyage(v, dt) {
  v.elapsed = Math.min(v.duration, v.elapsed + dt);
  const t = v.elapsed / v.duration, done = v.elapsed >= v.duration - 1e-9;
  return {
    x: v.start[0] + (v.end[0] - v.start[0]) * (done ? 1 : t), y: v.start[1] + (v.end[1] - v.start[1]) * (done ? 1 : t),
    heading: headingOf(v.end[0] - v.start[0], v.end[1] - v.start[1]), done,
  };
}
