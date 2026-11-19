import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/game/controller.js';
import { freshState } from '#game/core.js';
import { dayKey } from '#game/quests.js';
import { unproject } from '../src/frame.js';

const mk = (i) => {
  const point = [24000 + i * 400, 9000];
  const [lon, lat] = unproject(point);
  return { id: 'p' + i, name: '장소' + i, area: '구역' + i, blurb: '', type: 'heritage', point, lon, lat };
};
const places = Array.from({ length: 30 }, (_, i) => mk(i));
const NOW = Date.parse('2026-11-19T03:00:00Z');

function setup(over = {}) {
  const state = freshState();
  const log = [];
  const player = { x: 24000, y: 9000, mode: 'car', movementMode: 'free', speed: 300, target: [1, 1] };
  const services = {
    stopPlayer: () => { player.speed = 0; player.target = null; log.push('stop'); },
    resetInput: () => log.push('reset'),
    setTarget: (pt, place) => { player.target = pt; log.push('target:' + place.id); },
    reachable: () => false,
    missionContext: () => ({ player, navigator: null }),
    showDialog: (kind, data) => { log.push('show:' + kind + (data?.place ? ':' + data.place.id : '')); return kind === 'help' ? false : true; },
    hideDialog: (kind) => log.push('hide:' + kind),
    onPause: (p) => log.push(p ? 'pause' : 'resume'),
    setMode: (m) => { player.mode = m; log.push('mode:' + m); },
    announce: (pl) => log.push('announce:' + pl.id),
    ...over.services,
  };
  const sounds = [];
  const c = createController({ state, places, services, save: () => log.push('save'), sound: { play: (k) => sounds.push(k) }, clock: () => NOW, ...over.opts });
  return { c, state, log, player, sounds };
}

test('dialogPausesAndResumes: arrive while driving pauses at speed 0, close resumes with one arrival only', () => {
  const { c, log, player, sounds } = setup();
  assert.equal(c.screen, 'play');
  assert.equal(c.paused(), false);
  c.onArrive(places[3], true);
  assert.equal(c.paused(), true);
  assert.equal(player.speed, 0);
  assert.equal(player.target, null);
  assert.deepEqual(c.dialog.kind, 'place');
  assert.equal(c.dialog.data.place.id, 'p3');
  assert.equal(c.dialog.data.physical, true);
  assert.ok(sounds.includes('arrival'));
  c.close();
  assert.equal(c.paused(), false);
  assert.equal(c.dialog, null);
  assert.equal(log.filter((l) => l.startsWith('show:place')).length, 1);
  assert.ok(log.lastIndexOf('reset') > log.indexOf('hide:place'));
  assert.equal(log.at(-1), 'resume');
  c.close();   // idempotent: the place dialog's own onClose also lands here
  assert.equal(log.filter((l) => l === 'resume').length, 1);
});

test('a second arrival while a dialog is open waits and opens after the first closes', () => {
  const { c, log } = setup();
  c.onArrive(places[1], true);
  c.onArrive(places[2], true);
  c.onArrive(places[2], true);   // the same place twice queues once
  assert.equal(c.dialog.data.place.id, 'p1');
  assert.equal(log.filter((l) => l.startsWith('show:place')).length, 1);
  assert.ok(log.includes('announce:p2'));
  c.close();
  assert.equal(c.dialog.data.place.id, 'p2');
  assert.equal(c.paused(), true);
  c.close();
  assert.equal(c.paused(), false);
  assert.deepEqual(log.filter((l) => l.startsWith('show:place')), ['show:place:p1', 'show:place:p2']);
});

test('a kind with no renderer is dropped without pausing', () => {
  const { c, log, player } = setup();
  c.open('help');
  assert.equal(c.paused(), false);
  assert.equal(c.dialog, null);
  assert.equal(player.speed, 300);
  assert.ok(!log.includes('pause'));
});

test('opening another dialog replaces the current one; npc keeps the dialog open', () => {
  const { c, log } = setup();
  c.open('place', { place: places[0], physical: false });
  c.onNpc({ id: 'n1' });
  assert.equal(c.dialog.kind, 'npc');
  assert.ok(log.includes('hide:place'));
  assert.equal(log.filter((l) => l === 'pause').length, 1);
});

test('startMission: direct is false when the place is already within reach (2D selectQuest rule)', () => {
  const near = setup({ services: { reachable: (p) => p.id === 'p5' } });
  near.state.dailyQuests = { day: dayKey(NOW), targets: ['p5', 'p6', 'p7'], active: 'p6', direct: true, started: true };
  near.c.startMission('p5');
  assert.equal(near.state.dailyQuests.active, 'p5');
  assert.equal(near.state.dailyQuests.direct, false);
  assert.ok(near.log.includes('target:p5'));
  const far = setup();
  far.state.dailyQuests = { day: dayKey(NOW), targets: ['p5', 'p6', 'p7'], active: 'p5', direct: true, started: true };
  far.c.startMission('p6');
  assert.equal(far.state.dailyQuests.direct, true);
  assert.equal(far.state.dailyQuests.active, 'p6');
});

test('startMission closes an open dialog before setting the target', () => {
  const { c, state, log } = setup();
  state.dailyQuests = { day: dayKey(NOW), targets: ['p5', 'p6', 'p7'], active: 'p5', direct: true, started: true };
  c.open('menu');
  c.startMission('p6');
  assert.equal(c.paused(), false);
  assert.ok(log.indexOf('target:p6') > log.indexOf('resume'));
});

test('goTo and setMode delegate to the hooks', () => {
  const { c, log, player } = setup();
  c.goTo('p9');
  assert.deepEqual(player.target, places[9].point);
  c.setMode('walk');
  assert.equal(player.mode, 'walk');
  c.goTo('nope');   // unknown id: ignored
});

test('dayTick refreshes only when the KST day changed', () => {
  const { c, state } = setup();
  state.dailyQuests = { day: '2026-11-18', targets: ['p1'], active: 'p1', direct: true, started: true };
  assert.equal(c.dayTick(NOW), true);
  assert.equal(state.dailyQuests.day, dayKey(NOW));
  assert.equal(c.dayTick(NOW), false);
});

test('the title menu pauses with screen title; closing it (button or Escape) goes into play', () => {
  const { c, log } = setup();
  assert.equal(c.open('menu', { title: true }), true);
  assert.equal(c.screen, 'title');
  assert.equal(c.paused(), true);
  assert.deepEqual(c.dialog, { kind: 'menu', data: { title: true } });
  c.close();
  assert.equal(c.screen, 'play');
  assert.equal(c.paused(), false);
  assert.equal(log.at(-1), 'resume');
  // the home button's menu during play is not the title
  c.open('menu');
  assert.equal(c.screen, 'play');
  assert.equal(c.paused(), true);
  // replaced by another dialog (say a place from the menu): no longer the title
  c.close(); c.open('menu', { title: true }); c.open('place', { place: places[2], physical: false });
  assert.equal(c.screen, 'play');
  // a menu with no renderer is dropped: the screen stays play
  const bare = setup({ services: { showDialog: () => false } });
  bare.c.open('menu', { title: true });
  assert.equal(bare.c.screen, 'play');
  assert.equal(bare.c.paused(), false);
});
