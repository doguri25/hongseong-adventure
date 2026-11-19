// Daily missions for the 3D app (pure). refreshMissions ports dist/game.js refreshQuests; missionView ports the 2D
// quest card text. The rules themselves (ensureQuests, activeQuest, ...) stay in dist/quests.js.
import { ensureQuests, activeQuest, questCompleted, dayKey, DIRECT_BONUS } from '#game/quests.js';
import { distance } from '#game/geography.js';
import { unproject } from '../frame.js';

const flying = (m) => m === 'slowplane' || m === 'plane';

/**
 * Pick today's three targets when the KST day changed (or `force`). `player` is {x, y, mode, movementMode} in game
 * metres, `places` are mapped places ({id, point:[x,y], lon, lat, remote?}). Roads mode on the ground keeps only the
 * 60 nearest places farther than 220 m that `navigator.route(from, to, 350)` can reach. Returns true when changed.
 */
export function refreshMissions(state, { places, player, navigator, now = Date.now(), random = Math.random, force = false }) {
  if (!force && state.dailyQuests?.day === dayKey(now)) return false;
  const at = [player.x, player.y];
  let candidates = places.filter((p) => !p.remote);
  if (player.movementMode === 'roads' && !flying(player.mode) && navigator) {
    candidates = candidates
      .map((p) => ({ p, d: distance(at, p.point) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 60)
      .filter(({ p, d }) => d > 220 && navigator.route(at, p.point, 350))
      .map((v) => v.p);
  }
  return ensureQuests(state, candidates, unproject(at), now, random, force);
}

/**
 * What the HUD mission card shows: {heading, title, detail, target:{id,name,area}|null, dots:['done'|'active'|'open'],
 * direct, bonus}. Strings are the 2D game's.
 */
export function missionView(state, places) {
  const d = state.dailyQuests, ids = d?.targets || [];
  const activeId = activeQuest(state);
  const next = activeId ? places.find((p) => p.id === activeId) : null;
  const dots = ids.map((id) => (questCompleted(state, id) ? 'done' : id === activeId ? 'active' : 'open'));
  const direct = !!d?.direct;
  return {
    heading: next && d.targets[0] === next.id ? '오늘의 첫 탐방' : '오늘의 탐방 미션',
    title: next ? `${next.name} 찾아가기` : '오늘의 미션을 완성했어요!',
    detail: next ? (direct ? `다른 장소 안내를 열지 않고 도착하면 +${DIRECT_BONUS}금화!` : '다른 곳에 들렀어도 괜찮아요. 목표를 찾아 미션을 마쳐요.') : '새 미션을 받아 모험을 이어가요.',
    target: next ? { id: next.id, name: next.name, area: next.area } : null,
    dots, direct, bonus: DIRECT_BONUS,
  };
}
