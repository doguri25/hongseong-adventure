// Game controller (pure: no DOM, no three.js, no window). It owns which dialog is open, the arrival queue, pausing and
// the daily-mission calls; main.js supplies every effect through `services`.
//
// createController({state, places, stories, services, save, sound, narrator, clock}) -> {
//   screen: 'title'|'play' (starts 'play'; 'title' while open('menu', {title: true}) is showing, the boot title menu),
//   dialog: null|{kind, data}, paused(), open(kind, data), close(),
//   onArrive(place, physical), onNpc(npc), startMission(id), goTo(placeId), setMode(mode), dayTick(now, force) }
// Dialog kinds: place {place, physical} | npc {npc} | ferry | menu | map | search | nearby | help.
//
// services hooks (all optional unless marked; later tasks call or extend these):
//   stopPlayer()                 speed 0, route and tap target cleared                         [called when a dialog opens]
//   resetInput()                 clear held keys / stick so nothing carries over               [called on open and close]
//   showDialog(kind, data)       render the dialog; return false when the kind has no renderer yet (it is then dropped
//                                without pausing or stopping the player)
//   hideDialog(kind)             tear the dialog down (must be idempotent: the dialog's own close button also ends here)
//   onPause(paused)              true when the first dialog opens, false when the last closes (render throttle, timers)
//   setTarget(point, place)      head for [x,y] game metres (place is given for goTo / startMission)
//   setMode(mode)                switch vehicle (walk|bike|car|supercar|slowplane|plane)
//   reachable(place) -> bool     player is already close enough to visit the place (2D canVisit rule)
//   missionContext() -> {player:{x,y,mode,movementMode}, navigator}   input for refreshMissions
//   announce(place)              the "arrived" banner, shown even when the dialog has to wait in the queue
// places: the mapped places (each with a game-frame point); stories: the story-only places (place.remote, no point):
// goTo one opens its story (P19, the 2D goToPlace -> visit). sound: {play(kind)}; narrator: {speak(text), cancel()};
// both default to no-ops. clock() -> ms (default Date.now).
import { selectQuest } from '#game/quests.js';
import { refreshMissions } from './missions.js';

const noop = () => {};
const QUIET_SOUND = { play: noop };
const QUIET_NARRATOR = { speak: noop, cancel: noop };

export function createController({ state, places, stories = [], services = {}, save = noop, sound = QUIET_SOUND, narrator = QUIET_NARRATOR, clock = Date.now, random = Math.random } = {}) {
  const byId = new Map(places.map((p) => [p.id, p])), storyById = new Map(stories.map((p) => [p.id, p]));
  const queue = [];   // arrivals that came in while a dialog was open: {kind:'place', data}
  const call = (name, ...args) => services[name]?.(...args);

  const ctl = {
    screen: 'play',
    dialog: null,
    sound, narrator,
    paused: () => ctl.dialog !== null,

    open(kind, data = {}) {
      const was = ctl.dialog;
      if (was) { ctl.dialog = null; call('hideDialog', was.kind); }
      ctl.dialog = { kind, data };
      if (call('showDialog', kind, data) === false) {   // nothing to show yet: not a pause
        ctl.dialog = null;
        if (was) { call('resetInput'); call('onPause', false); }
        return false;
      }
      ctl.screen = kind === 'menu' && data.title ? 'title' : 'play';
      call('stopPlayer'); call('resetInput');
      if (!was) call('onPause', true);
      return true;
    },

    close() {
      const was = ctl.dialog;
      if (!was) return;
      ctl.dialog = null; ctl.screen = 'play';
      call('hideDialog', was.kind);
      call('resetInput');
      const next = queue.shift();
      if (next) { ctl.open(next.kind, next.data); return; }
      call('onPause', false);
    },

    // physical: the player really walked/drove there (counts for missions and discovery)
    onArrive(place, physical = true) {
      sound.play('arrival');
      call('announce', place);
      if (ctl.dialog) {
        if (!queue.some((q) => q.data.place.id === place.id) && !(ctl.dialog.kind === 'place' && ctl.dialog.data.place?.id === place.id)) queue.push({ kind: 'place', data: { place, physical } });
        return;
      }
      ctl.open('place', { place, physical });
    },

    onNpc(npc) { ctl.open('npc', { npc }); },

    startMission(id) {
      const place = byId.get(id);
      if (!place) return false;
      if (!selectQuest(state, id, !!call('reachable', place))) return false;
      save();
      ctl.goTo(id);
      return true;
    },

    // head for a mapped place (closing any dialog first); a story-only place has no point: its story opens instead,
    // replacing any dialog (no resume in between)
    goTo(placeId) {
      const story = storyById.get(placeId);
      if (story) return ctl.open('place', { place: story, physical: false });
      const place = byId.get(placeId);
      if (!place) return false;
      if (ctl.dialog) ctl.close();
      call('setTarget', [place.point[0], place.point[1]], place);
      return true;
    },

    setMode(mode) { return call('setMode', mode); },

    // New KST day (or `force`, for "new missions"): pick fresh targets and save. Call on boot, on visibilitychange
    // back to visible and whenever the mission panel opens. Returns true when the missions changed.
    dayTick(now = clock(), force = false) {
      const ctx = call('missionContext');
      if (!ctx) return false;
      const changed = refreshMissions(state, { places, player: ctx.player, navigator: ctx.navigator, now, random, force });
      if (changed) save();
      return changed;
    },
  };
  return ctl;
}
