import { test } from 'node:test';
import assert from 'node:assert/strict';
import { josa } from '../src/ui/hud.js';

test('josa picks 와/과 and 로/으로 from the last syllable', () => {
  assert.equal(josa('도서관 길잡이', 'with'), '와');
  assert.equal(josa('마을 이웃', 'with'), '과');
  assert.equal(josa('마을 이야기 선생님', 'with'), '과');
  assert.equal(josa('충남도서관', 'to'), '으로');
  assert.equal(josa('죽도', 'to'), '로');
  assert.equal(josa('마을', 'to'), '로');          // ㄹ takes 로
  assert.equal(josa('CU', 'to'), '로');            // not Hangul: no final consonant
});
