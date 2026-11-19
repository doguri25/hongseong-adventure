// Road-following car (pure, game frame). Heading 0 = north (-y), clockwise: travel (sin h, -cos h); right-hand side (-dy, dx).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrapAngle = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const dampAngle = (a, b, k, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));
const VEH_CAR = { accel: 1.0, brake: 2.4 };
const headingOf = d => Math.atan2(d[0], -d[1]);

export function createCar(graph, x, y, heading, maxR = 600) {
  const n = graph.nearest(x, y, maxR); if (!n) return null;
  const tg = graph.tangent(n.edge, n.s, 1), h = headingOf(tg), dir = Math.abs(wrapAngle(h - heading)) < Math.PI / 2 ? 1 : -1;
  const car = { graph, edge: n.edge, s: n.s, dir, lane: null, intent: null, intentLeft: 0, intentT: 0, route: null, goal: null, goalTarget: null, backT: 0, turned: false,
    x: 0, y: 0, heading: dir > 0 ? h : wrapAngle(h + Math.PI), speed: 0, turnRate: 0, clock: 0, noteAt: -99 };
  pose(car, 0);
  return car;
}

// Bring a car to rest and forget what it was doing (dialogs open at speed): no coasting, route, goal or booked turn.
export function haltCar(car) {
  Object.assign(car, { speed: 0, route: null, goal: null, goalTarget: null, intent: null, intentLeft: 0, intentT: 0, backT: 0, turned: false, turnRate: 0 });
}

function pose(car, dt) {
  const G = car.graph, p = G.at(car.edge, car.s), tg = G.tangent(car.edge, car.s, car.dir), lane = car.edge.oneway ? 0 : car.edge.half * 0.5;
  car.lane = car.lane === null || !dt ? lane : damp(car.lane, lane, 3, dt);
  car.x = p[0] - tg[1] * car.lane; car.y = p[1] + tg[0] * car.lane;
  const h = headingOf(tg), prev = car.heading;
  car.heading = dt ? dampAngle(car.heading, h, 9, dt) : h;
  car.turnRate = dt ? wrapAngle(car.heading - prev) / dt : 0;
}

export function driveCar(car, input, speedMax, dt, bounds) {
  const G = car.graph, events = [];
  car.clock += dt;
  const travel = G.tangent(car.edge, car.s, car.dir);
  let throttle = clamp(input.throttle || 0, -1, 1);
  const manual = Math.abs(throttle) > 0.01 || !!input.turn || input.stickHeading != null;
  if (manual) {
    car.route = null; car.goal = null; car.goalTarget = input.target || null;   // the route is cancelled; the same target does not re-plan
    if (input.turn) { car.intent = input.turn; car.intentLeft = 1500; }   // kept until the next real junction (or 1.5 km)
    if (input.stickHeading != null) {
      const sx = Math.sin(input.stickHeading), sy = -Math.cos(input.stickHeading), dot = sx * travel[0] + sy * travel[1];
      if (throttle === 0) throttle = 1;
      else if (dot < -0.35 && throttle > 0) throttle = -throttle;
      if (dot < 0.8) { car.intent = { h: input.stickHeading }; car.intentT = 1.2; }   // stick points along another road: take it at the next junction
    }
  } else if (input.target) {
    const t = input.target;
    if (!car.goalTarget || car.goalTarget[0] !== t[0] || car.goalTarget[1] !== t[1]) {
      car.goalTarget = [t[0], t[1]];
      const goal = G.nearest(t[0], t[1], 500), plan = goal && G.route(car, goal, t[0], t[1]);
      if (!plan) events.push('no-route');
      else { car.goal = goal; car.route = plan.edges; car.intent = null; if (plan.turn) { car.dir = -car.dir; car.speed = 0; } }
    }
    if (car.goal) { const left = car.edge === car.goal.edge ? Math.abs(car.goal.s - car.s) : 1e9; throttle = clamp(left / 120, 0.25, 1); }
  }
  if (typeof car.intent === 'string') { if ((car.intentLeft -= car.speed * dt) <= 0) car.intent = null; } else if ((car.intentT -= dt) <= 0) car.intent = null;
  // stopped and still holding back: turn round once; let go and hold again to turn round again
  if (throttle < -0.3 && car.speed < 8) {
    if (!car.turned && (car.backT += dt) > 0.6) { car.dir = -car.dir; car.backT = 0; car.turned = true; car.intent = null; events.push('uturn'); }
  } else { car.backT = 0; if (throttle > -0.3) car.turned = false; }
  if (throttle > 0.01) { const t = speedMax * Math.min(1, throttle); car.speed = damp(car.speed, t, car.speed < t ? VEH_CAR.accel : VEH_CAR.brake, dt); }
  else if (throttle < -0.01) car.speed = Math.max(0, damp(car.speed, 0, VEH_CAR.brake * (1.5 + 2.5 * -throttle), dt) - 2 * dt);
  else car.speed = damp(car.speed, 0, VEH_CAR.brake * 0.5, dt);
  const prevE = car.edge, prevS = car.s, prevDir = car.dir, note = name => { if (car.clock - car.noteAt > 3) { car.noteAt = car.clock; events.push(name); } };
  let remaining = car.speed * dt, guard = 0;
  while (remaining > 0 && guard++ < 12) {
    if (car.goal && car.edge === car.goal.edge) {
      const to = (car.goal.s - car.s) * car.dir;
      if (to >= 0 && to <= remaining) { car.s = car.goal.s; car.speed = 0; car.goal = null; car.route = null; events.push('arrived'); remaining = 0; break; }
    }
    const room = car.dir > 0 ? car.edge.len - car.s : car.s;
    if (remaining < room) { car.s += car.dir * remaining; break; }
    remaining -= room; car.s = car.dir > 0 ? car.edge.len : 0;
    const nd = car.dir > 0 ? car.edge.b : car.edge.a, cands = nd.links.filter(l => l.e !== car.edge);
    if (!cands.length) { car.speed = 0; note('dead-end'); break; }
    let next = null;
    if (car.route && car.route.length) { next = cands.find(l => l.e.id === car.route[0]) || null; if (next) car.route.shift(); }
    if (!next) {
      const arr = G.tangent(car.edge, car.s, car.dir), hArr = headingOf(arr), intent = car.intent;
      // a left or right turn is 35-150 degrees; anything sharper is a U-turn onto the other carriageway, used only if nothing else
      const score = l => {
        const d = G.departure(l), hDep = headingOf(d), turn = wrapAngle(hDep - hArr), a = Math.abs(turn);
        const wrong = l.e.way && l.e.way !== (l.end === 0 ? 1 : -1) ? 2 : 0, back = a > 2.6 ? 20 : 0;
        if (intent === 'left') return back + wrong + (turn < -0.6 && turn > -2.6 ? Math.abs(turn + Math.PI / 2) : 10 + a);
        if (intent === 'right') return back + wrong + (turn > 0.6 && turn < 2.6 ? Math.abs(turn - Math.PI / 2) : 10 + a);
        if (intent && intent.h !== undefined) return back + wrong + Math.abs(wrapAngle(hDep - intent.h));
        return back + wrong + a;
      };
      next = cands.reduce((a, b) => score(a) <= score(b) ? a : b);
      if (cands.length > 1 && typeof intent === 'string') {   // kept until a junction actually offers that turn
        const t = wrapAngle(headingOf(G.departure(next)) - hArr);
        if (intent === 'left' ? t < -0.6 && t > -2.6 : t > 0.6 && t < 2.6) car.intent = null;
      }
    }
    car.edge = next.e; car.dir = next.end === 0 ? 1 : -1; car.s = next.end === 0 ? 0 : next.e.len;
  }
  if (bounds) {
    const p = G.at(car.edge, car.s);
    if (p[0] < bounds[0] || p[1] < bounds[1] || p[0] > bounds[2] || p[1] > bounds[3]) { car.edge = prevE; car.s = prevS; car.dir = prevDir; car.speed = 0; note('map-edge'); }
  }
  pose(car, dt);
  const hint = typeof car.intent === 'string' ? car.intent : car.route || car.goal ? 'route' : null;
  return { x: car.x, y: car.y, heading: car.heading, speed: car.speed, hint, events };
}
