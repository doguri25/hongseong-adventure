// Round minimap (pokju's mirror spot): the 2D game's county picture around the player, turned with the camera so it
// matches the 3D view, with place dots, the target pin (on the rim when it is farther than the map shows), the player
// arrow and a north mark. The picture (`#game/assets/map-view-county-v13.webp`) covers the game frame's whole
// x ∈ [0, world.w], y ∈ [0, world.h] linearly. Canvas 2D only; draw() skips frames where nothing visible changed.
const TAU = Math.PI * 2;
// how many metres the map's radius shows, by travel mode
export const MINIMAP_RADIUS = { walk: 1600, bike: 2200, car: 3200, supercar: 4500, boat: 3200, slowplane: 4500, plane: 8000 };

/**
 * Screen offset (canvas px from the centre) of a point dx east, dy south metres from the player, on a map turned so the
 * camera's heading (yaw: 0 = north, clockwise) points up, at k px per metre.
 */
export function minimapPoint(dx, dy, yaw, k) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [(dx * c + dy * s) * k, (dy * c - dx * s) * k];
}

/**
 * createMinimap(canvas, {image, world:{w,h}, places, found}) -> {draw(player, target, yaw), resize()}
 * image: URL or loaded image; places: [{id, point:[x,y]}]; found(): the discovered ids (array or Set) for dot colours.
 * draw: player {x, y, heading, mode}; target [x,y] | null; yaw the camera yaw in radians.
 */
export function createMinimap(canvas, { image, world, places = [], found = () => [] } = {}) {
  const win = canvas.ownerDocument?.defaultView || globalThis;
  let img = null, ready = false, key = '', radius = 0, ctx = null;
  if (typeof image === 'string') {
    img = new win.Image(); img.decoding = 'async';
    img.onload = () => { ready = true; key = ''; };
    img.src = image;
  } else if (image) { img = image; ready = !!(image.complete ?? true); }

  function resize() {
    const css = canvas.clientWidth, px = Math.round(css * Math.min(2, win.devicePixelRatio || 1));
    if (css && canvas.width !== px) { canvas.width = px; canvas.height = px; key = ''; }
  }

  function draw(player, target, yaw) {
    if (!canvas.width) resize();
    const size = canvas.width;
    if (!size) return;
    const goal = MINIMAP_RADIUS[player.mode] || MINIMAP_RADIUS.walk;
    radius = radius ? radius + (goal - radius) * 0.12 : goal;
    if (Math.abs(radius - goal) < 2) radius = goal;
    const R = size / 2, k = R / radius, ids = found(), nFound = ids.length ?? ids.size ?? 0;
    const q = (v) => Math.round(v * k * 2);   // half-pixel steps
    const next = [ready, size, q(player.x), q(player.y), Math.round(yaw * 400), Math.round((player.heading || 0) * 100), Math.round(radius), target ? q(target[0]) + ',' + q(target[1]) : '', nFound].join('|');
    if (next === key) return;
    key = next;
    ctx = ctx || canvas.getContext('2d');
    const x = ctx, has = ids.has ? (id) => ids.has(id) : (id) => ids.includes(id);
    x.save();
    x.clearRect(0, 0, size, size);
    x.beginPath(); x.arc(R, R, R, 0, TAU); x.clip();
    x.fillStyle = '#24435a'; x.fillRect(0, 0, size, size);   // beyond the county picture
    x.translate(R, R); x.rotate(-yaw);

    if (ready && img.width) {
      // the square of half side `radius` around the player (it still covers the circle when turned), clipped to the picture
      const sx = img.width / world.w, sy = img.height / world.h;
      const x0 = (player.x - radius) * sx, y0 = (player.y - radius) * sy, w = 2 * radius * sx, h = 2 * radius * sy;
      const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(img.width, x0 + w), cy1 = Math.min(img.height, y0 + h);
      if (cx1 > cx0 && cy1 > cy0) {
        const kx = (2 * R) / w, ky = (2 * R) / h;
        x.drawImage(img, cx0, cy0, cx1 - cx0, cy1 - cy0, -R + (cx0 - x0) * kx, -R + (cy0 - y0) * ky, (cx1 - cx0) * kx, (cy1 - cy0) * ky);
      }
    }
    x.fillStyle = 'rgba(10, 12, 26, .16)'; x.fillRect(-size, -size, 2 * size, 2 * size);   // a touch darker, to sit in the glass HUD

    // place dots (in the turned frame: game metres scaled by k)
    const dot = Math.max(2, size * 0.022), r2 = radius * radius;
    for (const p of places) {
      const dx = p.point[0] - player.x, dy = p.point[1] - player.y;
      if (dx * dx + dy * dy > r2) continue;
      const on = has(p.id);
      x.beginPath(); x.arc(dx * k, dy * k, on ? dot * 0.8 : dot, 0, TAU);
      x.fillStyle = on ? '#22e1ff' : '#ffffff'; x.fill();
      x.lineWidth = Math.max(1, dot * 0.45); x.strokeStyle = 'rgba(11, 12, 24, .7)'; x.stroke();
    }

    // target pin: on the map, or pinned to the rim in its direction
    if (target) {
      let dx = (target[0] - player.x) * k, dy = (target[1] - player.y) * k;
      const d = Math.hypot(dx, dy), edge = R - size * 0.09;
      const out = d > edge;
      if (out) { dx *= edge / d; dy *= edge / d; }
      x.save(); x.translate(dx, dy); x.rotate(yaw);   // keep the pin upright on screen
      x.shadowColor = '#ff2d95'; x.shadowBlur = size * 0.05;
      x.fillStyle = '#ff2d95'; x.strokeStyle = '#fff'; x.lineWidth = Math.max(1.5, size * 0.014);
      if (out) {   // a small arrow pointing out of the map
        x.rotate(Math.atan2(dy, dx) - yaw + Math.PI / 2);
        const a = size * 0.05;
        x.beginPath(); x.moveTo(0, -a); x.lineTo(a * 0.8, a * 0.6); x.lineTo(-a * 0.8, a * 0.6); x.closePath(); x.fill(); x.stroke();
      } else {
        const a = size * 0.045;
        x.beginPath(); x.arc(0, -a * 1.4, a, Math.PI * 0.85, Math.PI * 2.15); x.lineTo(0, 0); x.closePath(); x.fill(); x.stroke();
        x.shadowBlur = 0; x.fillStyle = '#fff'; x.beginPath(); x.arc(0, -a * 1.4, a * 0.38, 0, TAU); x.fill();
      }
      x.restore();
    }
    x.restore();

    // player arrow at the centre, pointing along the player's heading on the turned map
    x.save(); x.translate(R, R); x.rotate((player.heading || 0) - yaw);
    const a = size * 0.07;
    x.shadowColor = '#8a5cff'; x.shadowBlur = size * 0.05;
    x.beginPath(); x.moveTo(0, -a); x.lineTo(a * 0.72, a * 0.72); x.lineTo(0, a * 0.36); x.lineTo(-a * 0.72, a * 0.72); x.closePath();
    x.fillStyle = '#fff'; x.fill(); x.shadowBlur = 0; x.lineWidth = Math.max(1.5, size * 0.016); x.strokeStyle = '#0b0c18'; x.stroke();
    x.restore();

    // north mark on the rim
    const [nx, ny] = minimapPoint(0, -1, yaw, R - size * 0.085), nr = size * 0.062;
    x.beginPath(); x.arc(R + nx, R + ny, nr, 0, TAU); x.fillStyle = 'rgba(11, 12, 24, .82)'; x.fill();
    x.lineWidth = Math.max(1, size * 0.01); x.strokeStyle = '#22e1ff'; x.stroke();
    x.fillStyle = '#fff'; x.font = `700 ${Math.round(nr * 1.25)}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('N', R + nx, R + ny + nr * 0.06);
  }

  return { draw, resize, get ready() { return ready; } };
}
