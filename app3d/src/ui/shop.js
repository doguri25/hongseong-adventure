// The 꾸미기 shop (pure, no DOM): the 2D catalogue as cards and the two actions. Prices, items and rules are the 2D
// game's own: app2d/content.js SHOP (22 items), app2d/wardrobe.js SHOP_CATEGORIES / CHARACTERS, app2d/core.js purchase.
import { SHOP } from '#game/content.js';
import { CHARACTERS } from '#game/wardrobe.js';
import { purchase } from '#game/core.js';

export const NEED_COINS = '금화가 조금 더 필요해요.';   // the 2D toast for a purchase that cannot be paid

/**
 * Cards for one SHOP_CATEGORIES id: {id, name, price, owned, equipped, affordable} plus the 2D swatch and copy
 * (desc, color, glyph, slot). 'character' gives the three free characters (equipped = the one chosen). Unknown -> [].
 * affordable: owned (wearing is free) or enough coins to buy.
 */
export function shopView(state, category) {
  if (category === 'character') {
    return Object.entries(CHARACTERS).map(([id, c]) => ({ id, name: c.name, price: 0, owned: true, equipped: state.character === id, affordable: true, character: true }));
  }
  return SHOP.filter((i) => i.slot === category).map((i) => {
    const owned = state.owned.includes(i.id);
    return {
      id: i.id, name: i.name, desc: i.desc, price: i.price, color: i.color, glyph: i.glyph, slot: i.slot,
      owned, equipped: state.equipped[i.slot] === i.value, affordable: owned || state.coins >= i.price,
    };
  });
}

/**
 * An item's button, straight through app2d/core.js purchase: not owned -> buy and wear (if the coins reach), owned ->
 * wear or take off. Returns purchase's {ok, bought, reason} plus equipped (worn now), the 2D sound ('coin' for a
 * purchase, 'click' otherwise) and the 2D message when it was refused.
 */
export function pressItem(state, id) {
  const r = purchase(state, id);
  const item = SHOP.find((i) => i.id === id);
  if (!r.ok) return { ...r, equipped: false, message: r.reason === 'balance' ? NEED_COINS : '' };
  return { ...r, equipped: state.equipped[item.slot] === item.value, sound: r.bought ? 'coin' : 'click' };
}

/** The free character choice (2D: state.character = id). False for an unknown id. */
export function chooseCharacter(state, id) {
  if (!Object.hasOwn(CHARACTERS, id)) return false;
  state.character = id;
  return true;
}
