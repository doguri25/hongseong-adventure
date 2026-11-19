// Game frame shared with dist/world.js (World.project). Metres; x east, y south.
export const ORIGIN = [126.4, 36.69];
export const BOUNDS = [126.4, 36.45, 126.79, 36.69];
export const M_LAT = 111320;
export const M_LON = 111320 * Math.cos((ORIGIN[1] * Math.PI) / 180);
export const VEX = 1.2;

export function project([lon, lat]) {
  return [(lon - ORIGIN[0]) * M_LON, (ORIGIN[1] - lat) * M_LAT];
}
export function unproject([x, y]) {
  return [ORIGIN[0] + x / M_LON, ORIGIN[1] - y / M_LAT];
}

const [minX, minY] = project([BOUNDS[0], BOUNDS[3]]);
const [maxX, maxY] = project([BOUNDS[2], BOUNDS[1]]);
export const CX = (minX + maxX) / 2;
export const CY = (minY + maxY) / 2;
export const CENTER = [CX, CY];

export function toRender(x, y) { return [x - CX, y - CY]; }
export function fromRender(X, Z) { return [X + CX, Z + CY]; }
