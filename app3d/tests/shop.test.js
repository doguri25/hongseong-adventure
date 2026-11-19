import test from 'node:test';
import assert from 'node:assert/strict';
import { shopView, pressItem, chooseCharacter, NEED_COINS } from '../src/ui/shop.js';
import { freshState, purchase } from '#game/core.js';
import { SHOP } from '#game/content.js';
import { SHOP_CATEGORIES, CHARACTERS } from '#game/wardrobe.js';

const item = (id) => SHOP.find((i) => i.id === id);
const snapshot = (s) => JSON.stringify({ coins: s.coins, owned: s.owned, equipped: s.equipped, character: s.character });

test('shopFollowsCorePurchase: unaffordable, buy, take off, wear again; coins never negative', () => {
  const s = freshState(), cape = item('gold-cape');
  // not enough coins: nothing changes, the 2D message
  s.coins = cape.price - 1;
  const before = snapshot(s);
  const poor = pressItem(s, cape.id);
  assert.equal(poor.ok, false);
  assert.equal(poor.reason, 'balance');
  assert.equal(poor.message, NEED_COINS);
  assert.equal(snapshot(s), before);
  // exactly enough: bought, coins drop by the price to 0, worn
  s.coins = cape.price;
  const bought = pressItem(s, cape.id);
  assert.equal(bought.ok, true);
  assert.equal(bought.bought, true);
  assert.equal(bought.sound, 'coin');
  assert.equal(s.coins, 0);
  assert.ok(s.owned.includes(cape.id));
  assert.equal(s.equipped.outfit, cape.value);
  assert.equal(bought.equipped, true);
  // pressed again: taken off, coins unchanged
  const off = pressItem(s, cape.id);
  assert.equal(off.ok, true);
  assert.equal(off.bought, false);
  assert.equal(off.sound, 'click');
  assert.equal(off.equipped, false);
  assert.equal(s.equipped.outfit, 'default');
  assert.equal(s.coins, 0);
  // and again: worn again, still free
  const on = pressItem(s, cape.id);
  assert.equal(on.equipped, true);
  assert.equal(s.equipped.outfit, cape.value);
  assert.equal(s.coins, 0);
  assert.equal(s.owned.filter((id) => id === cape.id).length, 1);
  // a second outfit replaces the first in the same slot; coins can never go below 0
  const ocean = item('outfit-ocean');
  s.coins = ocean.price + 5;
  pressItem(s, ocean.id);
  assert.equal(s.equipped.outfit, 'ocean');
  assert.equal(s.coins, 5);
  for (const i of SHOP) pressItem(s, i.id);
  assert.ok(s.coins >= 0);
  // unknown ids change nothing
  const was = snapshot(s);
  assert.equal(pressItem(s, 'no-such-item').ok, false);
  assert.equal(snapshot(s), was);
});

test('pressItem gives exactly what dist/core.js purchase gives on a copy of the same state', () => {
  const a = freshState(), b = freshState();
  a.coins = b.coins = 300;
  for (const id of ['star-stamp', 'star-stamp', 'ring-sun', 'gold-journal', 'ring-sun', 'outfit-mint', 'trail-music', 'trail-music']) {
    const mine = pressItem(a, id), core = purchase(b, id);
    assert.equal(mine.ok, core.ok);
    assert.equal(mine.bought, core.bought);
    assert.equal(snapshot(a), snapshot(b));
  }
});

test('shopView: owned / equipped / affordable flags for each category, 22 items in six categories', () => {
  const s = freshState();
  s.coins = 100;
  assert.deepEqual(SHOP_CATEGORIES.map(([id]) => id), ['character', 'outfit', 'journal', 'stamp', 'trail', 'ring']);
  const items = SHOP_CATEGORIES.slice(1).flatMap(([id]) => shopView(s, id));
  assert.equal(items.length, 22);
  for (const c of items) {
    const i = item(c.id);
    assert.equal(c.name, i.name);
    assert.equal(c.price, i.price);
    assert.equal(c.owned, false);
    assert.equal(c.equipped, false);
    assert.equal(c.affordable, s.coins >= i.price);
  }
  // the cape (120) is out of reach with 100 coins, a stamp (40) is not
  const outfits = shopView(s, 'outfit');
  assert.equal(outfits.find((c) => c.id === 'gold-cape').affordable, false);
  assert.equal(shopView(s, 'stamp').find((c) => c.id === 'star-stamp').affordable, true);
  // bought and worn; another owned one stays affordable (free to wear) even at 0 coins
  s.coins = 200;
  pressItem(s, 'outfit-ocean');
  pressItem(s, 'outfit-rose');
  s.coins = 0;
  const after = shopView(s, 'outfit');
  const ocean = after.find((c) => c.id === 'outfit-ocean'), rose = after.find((c) => c.id === 'outfit-rose'), cape = after.find((c) => c.id === 'gold-cape');
  assert.deepEqual([ocean.owned, ocean.equipped, ocean.affordable], [true, false, true]);
  assert.deepEqual([rose.owned, rose.equipped, rose.affordable], [true, true, true]);
  assert.deepEqual([cape.owned, cape.equipped, cape.affordable], [false, false, false]);
  // swatch and copy come from the 2D catalogue
  assert.equal(rose.desc, item('outfit-rose').desc);
  assert.equal(rose.glyph, item('outfit-rose').glyph);
  assert.equal(rose.color, item('outfit-rose').color);
  assert.deepEqual(shopView(s, 'nope'), []);
});

test('shopView character: the three free characters, the chosen one equipped; chooseCharacter keeps coins', () => {
  const s = freshState();
  const cards = shopView(s, 'character');
  assert.deepEqual(cards.map((c) => c.id), Object.keys(CHARACTERS));
  assert.deepEqual(cards.map((c) => c.name), Object.values(CHARACTERS).map((c) => c.name));
  assert.ok(cards.every((c) => c.price === 0 && c.owned && c.affordable));
  assert.deepEqual(cards.map((c) => c.equipped), [true, false, false]);
  s.coins = 7;
  assert.equal(chooseCharacter(s, 'raccoon'), true);
  assert.equal(s.character, 'raccoon');
  assert.equal(s.coins, 7);
  assert.deepEqual(shopView(s, 'character').map((c) => c.equipped), [false, false, true]);
  assert.equal(chooseCharacter(s, 'dragon'), false);
  assert.equal(s.character, 'raccoon');
});
