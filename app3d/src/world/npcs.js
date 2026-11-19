// The 58 village NPC billboards (20 m tall) with a "···" bubble. Positions come from dist/npcs.js createNpcs (game frame).
import * as THREE from 'three';
import { createNpcs } from '#game/npcs.js';
import { project, toRender } from '../frame.js';
import { RESIDENT_ROLES } from './actor-assets.js';
import { showCell } from './actors.js';

export const NPC_HEIGHT = 20, TALK_RADIUS = 80, BUBBLE_SHOW = 450;

// places need .point = projected [x,y]; navigator is the walking-road navigator (dist/navigation.js)
export function buildNpcs(places, navigator) { return createNpcs(places, navigator, project); }

function bubbleTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,252,240,.96)'; g.strokeStyle = '#4a6b50'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(6, 6, 116, 62, 28); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(48, 66); g.lineTo(64, 90); g.lineTo(78, 66); g.closePath(); g.fillStyle = 'rgba(255,252,240,.96)'; g.fill();
  g.beginPath(); g.moveTo(48, 67); g.lineTo(64, 90); g.lineTo(78, 67); g.stroke();
  g.fillStyle = '#4a6b50'; for (const x of [40, 64, 88]) { g.beginPath(); g.arc(x, 37, 7, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class NpcLayer {
  constructor(scene, npcs, assets, field, { reduced = false } = {}) {
    this.npcs = npcs; this.reduced = reduced;
    this.group = new THREE.Group(); this.group.name = 'npcs'; scene.add(this.group);
    const bubbleMat = new THREE.SpriteMaterial({ map: bubbleTexture(), transparent: true, depthWrite: false, fog: false });
    const cache = new Map();   // one texture+material per sprite name (clones share the sheet image)
    const materialFor = (name) => {
      if (cache.has(name)) return cache.get(name);
      let src, cell;
      if (name.startsWith('resident-')) {
        const i = Math.max(0, RESIDENT_ROLES.indexOf(name.slice(9)));
        src = assets.npc; const fr = src.cells[i];
        cell = { rect: fr.rect, pivot: [fr.rect[0] + fr.rect[2] / 2, fr.rect[1] + fr.rect[3]], cellHeight: fr.rect[3] };
      } else {
        src = assets.atlas; const r = src.cells[name] || src.cells['local-guide'];
        cell = { rect: r, pivot: [r[0] + r[2] / 2, r[1] + r[3]], cellHeight: r[3] };
      }
      const tex = src.texture.clone(); tex.needsUpdate = true;
      const sprite = new THREE.Sprite();   // only used to compute scale/centre once
      showCell(sprite, tex, src.size, cell, NPC_HEIGHT);
      const entry = { material: new THREE.SpriteMaterial({ map: tex, alphaTest: 0.45, fog: true }), scale: sprite.scale.clone(), center: sprite.center.clone(), frame: { image: src.texture.image, rect: cell.rect } };
      cache.set(name, entry);
      return entry;
    };
    this.items = npcs.map((npc) => {
      const e = materialFor(npc.sprite), [X, Z] = toRender(npc.point[0], npc.point[1]), y = field.renderY(npc.point[0], npc.point[1]);
      const sprite = new THREE.Sprite(e.material); sprite.scale.copy(e.scale); sprite.center.copy(e.center); sprite.position.set(X, y - 0.1, Z); sprite.renderOrder = 3;
      const bubble = new THREE.Sprite(bubbleMat); bubble.scale.set(9, 6.75, 1); bubble.center.set(0.5, 0); bubble.renderOrder = 9; bubble.visible = false;
      bubble.position.set(X, y + NPC_HEIGHT + 2, Z);
      this.group.add(sprite, bubble);
      return { npc, sprite, bubble, y, X, Z, frame: e.frame };
    });
  }

  // the keyed sheet canvas and the [x, y, w, h] cell of this NPC's sprite (the talk dialog's portrait), or null
  frame(npc) { return this.items.find((it) => it.npc === npc || it.npc.id === npc?.id)?.frame || null; }

  // nearest NPC within the talk radius, else null
  nearest(player, radius = TALK_RADIUS) {
    let best = null;
    for (const it of this.items) {
      const d = Math.hypot(it.npc.point[0] - player.x, it.npc.point[1] - player.y);
      if (d <= radius && (!best || d < best.distance)) best = { npc: it.npc, distance: d };
    }
    return best;
  }

  update(player, t) {
    for (const it of this.items) {
      const d = Math.hypot(it.npc.point[0] - player.x, it.npc.point[1] - player.y), show = d < BUBBLE_SHOW;
      it.bubble.visible = show;
      if (show) it.bubble.position.y = it.y + NPC_HEIGHT + 2 + (this.reduced ? 0 : Math.sin(t * 2.2 + it.X) * 0.8) + (d <= TALK_RADIUS ? 1.5 : 0);
    }
  }
}
