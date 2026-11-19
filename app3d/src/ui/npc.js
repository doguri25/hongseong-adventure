// NPC talk (2D showNpc), the controller's 'npc' dialog: the neighbour's portrait (their sprite frame drawn to a canvas),
// name and district, the three 2D topics 지역 이야기 / 게임 도움 / 미션 도움 (ARIA tabs), ▷ 읽어 주기 (the Narrator: ■ 읽기
// 멈추기 while it speaks), the 2D source link and the next step: 미션 시작 (ctl.startMission) or, with today's missions
// done, 새 미션 받기 (ctl.dayTick(now, true), then the menu's 탐방). Moved here from place-dialog.js (P1).
// The texts are the 2D game's: the district history and the NPC's story, the mission prompt; the 게임 도움 line is
// told for the 3D controls. Every text goes in through textContent.
import { el } from './dom.js';
import { createPanelDialog, button } from './help.js';
import { activeQuest, DIRECT_BONUS } from '#game/quests.js';

export const TOPICS = [['region', '지역 이야기'], ['help', '게임 도움'], ['mission', '미션 도움']];
const HELP_TEXT = '오른쪽 아래 ‘탈것’에서 걷기, 자전거, 자동차, 슈퍼카, 느린 비행기, 비행기를 고를 수 있어. 설정의 걷기 방식이 ‘길로만’이면 길을 따라가고, ‘자유롭게’이면 길 밖으로도 다녀. 물 위는 비행기로 이동하고 죽도는 남당항에서 배로 갈 수 있어. 가까운 장소는 E 키나 탐방 버튼으로 살펴보렴.';
const ALL_DONE = '오늘의 미션을 모두 마쳤구나! 새 미션을 받아 또 다른 장소를 만나 보자.';
const NOTE = '게임 속 가상의 길잡이예요.';
// the copula after a name: 남당항이야, 카페야 (the 2D line always says 이야); a name not ending in Hangul keeps 이야
const copula = (name) => { const c = String(name).trim().slice(-1).charCodeAt(0) - 0xac00; return c >= 0 && c <= 11171 && c % 28 === 0 ? '야' : '이야'; };

/**
 * npcTalk(npc, topic, {state, places}) -> {heading, text, next: {label, id}}: what the neighbour says on a topic (2D
 * showNpc) and the next step every topic offers (2D npc-next): the active mission target (미션 시작) or 새 미션 받기.
 */
export function npcTalk(npc, topic, { state, places }) {
  const id = activeQuest(state), target = id ? places.find((p) => p.id === id) : null;
  const next = target ? { label: '미션 시작', id: target.id } : { label: '새 미션 받기', id: null };
  if (topic === 'help') return { heading: '어떻게 탐방할까요?', text: HELP_TEXT, next };
  if (topic === 'mission') {
    return {
      heading: '다음 목적지는 어디일까요?', next,
      text: target ? `지금 목표는 ${target.name}${copula(target.name)}. 다른 장소 안내를 열지 않고 직접 도착하면 직행 보너스 ${DIRECT_BONUS}금화를 받아. 나에게 도움을 묻는 것은 괜찮아!` : ALL_DONE,
    };
  }
  return { heading: `${npc.area}의 이야기`, text: [npc.history, npc.story].filter(Boolean).join(' ').trim(), next };
}

/** Where the sprite cell `rect` [x, y, w, h] goes in a w x h portrait: 86 % tall (or 92 % wide), feet at 94 %, centred (2D drawNpc 120, 235, 215 on 240 x 250). */
export function portraitBox(rect, w, h) {
  const [, , cw, ch] = rect, k = Math.min((h * 0.86) / ch, (w * 0.92) / cw), dw = cw * k, dh = ch * k;
  return { dx: (w - dw) / 2, dy: h * 0.94 - dh, dw, dh };
}
/** Draw the NPC's frame ({image, rect}: NpcLayer.frame, the colour-keyed sheet) into the portrait canvas. */
export function drawPortrait(canvas, frame) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame?.image) return;
  const [x, y, w, h] = frame.rect, b = portraitBox(frame.rect, canvas.width, canvas.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(frame.image, x, y, w, h, b.dx, b.dy, b.dw, b.dh);
}

/**
 * createNpcDialog(doc, ctx) -> {open({npc}), hide(), close(), refreshVoice(), isOpen, npc}. ctx: root, returnFocus;
 * getState(), places (the mapped places: mission names); frame(npc) (the portrait source); ctl (startMission,
 * dayTick, open, narrator); changed() (new missions: refresh the HUD and save); onClose (ctl.close).
 */
export function createNpcDialog(doc, ctx) {
  const narrator = ctx.ctl.narrator;
  const d = createPanelDialog(doc, { id: 'npc', root: ctx.root, returnFocus: ctx.returnFocus, onClose: ctx.onClose });
  d.blurb.textContent = '고장의 이웃과 이야기해요';
  const tabs = TOPICS.map(([t, label]) => el('button', { type: 'button', role: 'tab', id: 'npc-topic-' + t, dataset: { topic: t }, 'aria-controls': 'npc-body', 'aria-selected': 'false', tabIndex: -1, onclick: () => choose(t) }, label));
  const row = el('div', { className: 'tabs npc-topics', role: 'tablist', 'aria-label': '이야기 고르기', id: 'npc-topics' }, tabs);
  d.body.before(row);
  d.body.setAttribute('role', 'tabpanel');
  const portrait = el('canvas', { className: 'npc-portrait', id: 'npc-portrait', width: 240, height: 250, role: 'img' });
  const heading = el('h3', { id: 'npc-heading' }), speech = el('p', { className: 'npc-speech', id: 'npc-speech' });
  d.body.append(el('div', { className: 'npc-talk' }, portrait, el('div', { className: 'npc-text' }, heading, speech, el('p', { className: 'note' }, NOTE))));
  const read = button('▷ 읽어 주기', { id: 'npc-read', onClick: () => { if (narrator.speaking) narrator.cancel(); else narrator.speak(talk().text); refreshVoice(); } });
  read.classList.add('tool');
  const source = el('a', { className: 'btn tool', id: 'npc-source', target: '_blank', rel: 'noopener' }, '지역 이야기 출처 ↗');
  const next = button('미션 시작', { id: 'npc-next', primary: true, onClick: goNext });
  d.footer.append(read, source, el('span', { className: 'spacer' }), next);
  row.addEventListener('keydown', (e) => {
    const i = TOPICS.findIndex(([t]) => t === topic), n = TOPICS.length;
    const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault(); choose(TOPICS[to][0]); tabs[to].focus({ preventScroll: true });
  });
  let npc = null, topic = 'region';

  const talk = () => npcTalk(npc, topic, { state: ctx.getState(), places: ctx.places });
  function render() {
    const t = talk();
    tabs.forEach((b, i) => { const on = TOPICS[i][0] === topic; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    d.body.setAttribute('aria-labelledby', 'npc-topic-' + topic);
    heading.textContent = t.heading; speech.textContent = t.text; next.textContent = t.next.label;
    refreshVoice();
  }
  function choose(t) { narrator.cancel(); topic = t; render(); }
  function goNext() {
    const t = talk();
    narrator.cancel();
    if (t.next.id && ctx.ctl.startMission(t.next.id)) return;   // closes the talk and heads there (2D launchMission)
    if (t.next.id) { render(); return; }
    ctx.ctl.dayTick(Date.now(), true);   // 새 미션 받기 (2D refreshQuests(true), showMissions)
    ctx.changed?.();
    ctx.ctl.open('menu', { tab: 'missions' });
  }
  function refreshVoice() { if (d.isOpen) read.textContent = narrator.speaking ? '■ 읽기 멈추기' : '▷ 읽어 주기'; }

  return {
    open({ npc: who } = {}) {
      if (!who) return;
      npc = who; topic = 'region';
      narrator.cancel();
      d.tag.textContent = npc.area || '홍성군';
      d.title.textContent = npc.name;
      portrait.setAttribute('aria-label', `${npc.name} 캐릭터`);
      drawPortrait(portrait, ctx.frame?.(npc));
      if (npc.source) source.href = npc.source; else source.removeAttribute('href');
      source.hidden = !npc.source;
      d.body.scrollTop = 0;
      d.show(tabs[0]);
      render();
    },
    hide() { if (d.isOpen) narrator.cancel(); d.hide(); },
    close: () => d.close(),
    refreshVoice,
    get isOpen() { return d.isOpen; }, get npc() { return npc; },
  };
}
