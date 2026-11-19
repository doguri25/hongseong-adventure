// The 수첩's files, in the 2D game's formats (app2d/game.js exportResult, export-save / backup-first, importSave):
// the result text a child hands in, the 이어하기 save file, reading one back and the download link itself. No globals
// at import time; download() reaches the document it is handed (Blob and URL are in browsers and in Node).
import { STORAGE_KEY, sanitizeState, rankFor } from '#game/core.js';
import { dayKey } from '#game/quests.js';

export const SAVE_NAME = '홍성모험수첩_이어하기.json';
export const RESULT_NAME = '홍성모험수첩_탐방결과.txt';
export const MAX_SAVE_BYTES = 200000;   // the 2D importSave limit (f.size > 200000 is refused)

/**
 * The 2D exportResult text, with a UTF-8 BOM so Windows Notepad reads the Korean: counts out of every place
 * (`places` is the 2D PLACES, 241), the score and title, the discovered places in PLACES order with their quiz
 * status, the note, the completed missions. `now` dates it (the KST day, as the mission ledger writes days).
 */
export function resultText(state, places, now = Date.now()) {
  const name = (id) => places.find((p) => p.id === id)?.name || id;
  const text = ['홍성 모험 수첩 · 나의 탐방 결과', `날짜: ${dayKey(now)}`, '',
    `발견: ${state.discovered.length} / ${places.length}곳`, `퀴즈: ${state.solved.length} / ${places.length}개`, `탐험 점수: ${state.xp}점`, `칭호: ${rankFor(state.xp)}`, '',
    '내가 발견한 장소', ...places.filter((p) => state.discovered.includes(p.id)).map((p) => `- ${p.name} (${p.area}) · 퀴즈 ${state.solved.includes(p.id) ? '완료' : '아직'}`), '',
    '친구에게 소개하고 싶은 장소와 까닭', state.note || '(아직 적지 않았어요)', '',
    '완료한 미션', ...(state.questLedger || []).map((r) => `- ${r.day} ${name(r.place)} · 직행 보너스 ${r.bonus}금화`)].join('\n');
  return '﻿' + text;
}

/** The 이어하기 file: the shared save state as the 2D game writes it. */
export const saveFile = (state) => JSON.stringify(state, null, 2);

/**
 * An 이어하기 file's text (and the file's size in bytes, else the text's own) -> {ok: true, state} with the state
 * cleaned by sanitizeState, or {ok: false, reason}: 'size' (over 200 000 bytes), 'json' (not JSON) or 'format' (not a
 * version 1 save with a discovered list). Nothing is changed either way.
 */
export function readSaveFile(text, size) {
  const bytes = Number.isFinite(size) ? size : new TextEncoder().encode(String(text ?? '')).length;
  if (bytes > MAX_SAVE_BYTES) return { ok: false, reason: 'size' };
  let raw;
  try { raw = JSON.parse(text); } catch { return { ok: false, reason: 'json' }; }
  if (!raw || typeof raw !== 'object' || raw.version !== 1 || !Array.isArray(raw.discovered)) return { ok: false, reason: 'format' };
  return { ok: true, state: sanitizeState(raw) };
}

/** What the menu says when an import or a reset could not be written (storage blocked or full): nothing changed. */
export const SAVE_FAILED = '이 기기에 저장하지 못했어요.';

/** An accepted import replaces this device's progress (the caller then reloads, and saves nothing before it). */
export function writeSave(storage, state) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

/** A file to save, through an <a download> blob link (2D download()). */
export function download(doc, name, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = doc.createElement('a');
  a.href = url; a.download = name;
  doc.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
