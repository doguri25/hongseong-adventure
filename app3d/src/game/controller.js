// Game controller (pure: no DOM, no three.js, no window). It owns which dialog is open, the arrival queue, pausing and
// the daily-mission calls; main.js supplies every effect through `services`.
//
// createController({state, places, stories, services, save, sound, narrator, clock}) -> {
//   screen: 'title'|'play' (starts 'play'; 'title' while open('menu', {title: true}) is showing, the boot title menu),
//   dialog: null|{kind, data}, paused(), open(kind, data), close(),
//   onArrive(place, physical), onNpc(npc), startMission(id), goTo(placeId), setMode(mode), dayTick(now, force) }
// Dialog kinds: place {place, physical} | npc {npc} | ferry | menu | map | search | nearby | help {section} | about | qr.
// goTo (찾아가기, every path: journal, place dialog, mission start, map, HUD 길 안내) follows the 2D goToPlace -> navigate:
// a story-only place opens its story ('story'); a place already in reach opens as a visit ('visit', P24); 죽도 from
// the mainland on the ground goes by the 남당항 ferry ('dock': head for the pier with the 2D hint, or 'ferry': at the
// pier, the ferry dialog); any other place becomes the walk / drive / flight target with the 2D move sound ('route').
// Sounds (P25, 2D visit): a place dialog that opens on a new discovery or a mission bonus plays the chime; an arrival
// otherwise plays the arrival sound, never both.
//
// services hooks (all optional unless marked; later tasks call or extend these):
//   stopPlayer()                 speed 0, route and tap target cleared                         [called when a dialog opens]
//   resetInput()                 clear held keys / stick so nothing carries over               [called on open and close]
//   showDialog(kind, data)       render the dialog; return false when the kind has no renderer yet (it is then dropped
//                                without pausing or stopping the player). For 'place' it returns what the visit earned,
//                                {reward, mission} (ui/place-dialog.js open), which decides the chime
//   hideDialog(kind)             tear the dialog down (must be idempotent: the dialog's own close button also ends here)
//   onPause(paused)              true when the first dialog opens, false when the last closes (render throttle, timers)
//   setTarget(point, place)      head for [x,y] game metres (place is given for goTo / startMission)
//   setMode(mode)                switch vehicle (walk|bike|car|supercar|slowplane|plane)
//   reachable(place) -> bool     player is already close enough to visit the place (2D canVisit rule)
//   holdReach(place)             before goTo opens a place in reach as a visit: hold the places in reach (2D openPlace)
//                                so the visit does not fire an arrival again
//   ferryLeg() -> 'board'|'dock'|null   goTo 죽도: standing at 남당항's pier ('board'), elsewhere on the mainland on the
//                                ground ('dock'), or no ferry needed (flying, on the island, at sea: null)
//   toDock()                     head for 남당항's pier with the 2D hint; the ferry dialog opens there
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
export const FERRY_ISLAND = 'tourmap-jukdo';   // 죽도: across the sea from 남당항 (2D world.navigate)

export function createController({ state, places, stories = [], services = {}, save = noop, sound = QUIET_SOUND, narrator = QUIET_NARRATOR, clock = Date.now, random = Math.random } = {}) {
  const byId = new Map(places.map((p) => [p.id, p])), storyById = new Map(stories.map((p) => [p.id, p]));
  const queue = [];   // arrivals that came in while a dialog was open: {kind:'place', data}
  let chimed = false;   // the last open() played the chime
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
      const shown = call('showDialog', kind, data);
      if (shown === false) {   // nothing to show yet: not a pause
        ctl.dialog = null;
        if (was) { call('resetInput'); call('onPause', false); }
        return false;
      }
      ctl.screen = kind === 'menu' && data.title ? 'title' : 'play';
      call('stopPlayer'); call('resetInput');
      if (!was) call('onPause', true);
      chimed = kind === 'place' && !!(shown?.reward || shown?.mission?.bonus);
      if (chimed) { if (sound.chime) sound.chime(); else sound.play('discovery'); }
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
      call('announce', place);
      if (ctl.dialog) {
        sound.play('arrival');   // it waits: the sound now, a chime later if its dialog earns one
        if (!queue.some((q) => q.data.place.id === place.id) && !(ctl.dialog.kind === 'place' && ctl.dialog.data.place?.id === place.id)) queue.push({ kind: 'place', data: { place, physical } });
        return;
      }
      if (!ctl.open('place', { place, physical }) || !chimed) sound.play('arrival');
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

    // 찾아가기 (see the header): -> 'story' | 'visit' | 'ferry' | 'dock' | 'route', or false for an unknown id. A dialog
    // that opens replaces any open one (no resume in between); a trip closes it first
    goTo(placeId) {
      const story = storyById.get(placeId);
      if (story) return ctl.open('place', { place: story, physical: false }) && 'story';
      const place = byId.get(placeId);
      if (!place) return false;
      if (call('reachable', place)) { call('holdReach', place); return ctl.open('place', { place, physical: true }) && 'visit'; }
      const leg = place.id === FERRY_ISLAND ? call('ferryLeg') : null;
      if (leg === 'board') return ctl.open('ferry') && 'ferry';
      if (ctl.dialog) ctl.close();
      if (leg === 'dock') call('toDock');
      else call('setTarget', [place.point[0], place.point[1]], place);
      sound.play('move');
      return leg === 'dock' ? 'dock' : 'route';
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
