/**
 * Read an NPC definition out of the cache's config archive (index 2, group 9).
 *
 * Why not `cache.getNPC().models`: in the current LIVE cache, model ids outgrew
 * 16 bits, so OSRS moved them from the old opcode 1 (u8 count + u16 ids) to
 * **opcode 61** (u8 count + **u32** ids). osrscachereader 1.1.3 predates that, so
 * its NpcLoader yields an empty `models` for every NPC. We walk the byte stream
 * ourselves for the handful of fields a render needs — the model ids, the standing
 * animation and the still-u16 recolour pairs (opcode 40) — and let the lib handle
 * everything else. The three bake scripts each carried their own copy of this walk
 * and it had drifted; this is the one copy.
 *
 * The loop is a **skipper**: it only keeps what a render needs (`models`,
 * `standAnim`, the recolour pairs) and, for every other opcode, consumes exactly
 * the bytes that opcode carries so the cursor stays in step. That is why opcodes
 * with no interesting payload still appear — dropping one desyncs the stream and
 * the models that follow come out as garbage. An unknown opcode therefore stops
 * the walk rather than guessing a width, and a 512-iteration guard bounds a
 * malformed record.
 */
export function parseNpcDef(content) {
  const b = new Uint8Array(content.buffer ?? content);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const u8 = () => b[p++];
  const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const i8 = () => dv.getInt8(p++);
  const skipStr = () => { while (b[p] !== 0) p++; p++; };
  const out = { models: [], standAnim: -1, recolorToFind: [], recolorToReplace: [] };
  for (let guard = 0; guard < 512; guard++) {
    const op = u8();
    if (op === 0) break;
    else if (op === 1) { const n = u8(); for (let i = 0; i < n; i++) out.models.push(u16()); }
    else if (op === 61) { const n = u8(); for (let i = 0; i < n; i++) out.models.push(u32()); } // 32-bit models
    else if (op === 2) skipStr();
    else if (op === 12) p += 1;
    else if (op === 13) out.standAnim = u16();
    else if (op === 14 || op === 15 || op === 16 || op === 18) p += 2;
    else if (op === 17) p += 8;
    else if (op >= 30 && op < 35) skipStr();
    // 40 recolours, 41 retextures — same 2×u16 payload, only the colours are kept.
    else if (op === 40 || op === 41) { const n = u8(); for (let i = 0; i < n; i++) { const f = u16(), r = u16(); if (op === 40) { out.recolorToFind.push(f); out.recolorToReplace.push(r); } } }
    else if (op === 60) { const n = u8(); p += 2 * n; }
    else if (op >= 74 && op <= 79) p += 2;
    else if (op === 93) { /* flag */ }
    else if (op === 95) p += 2;
    else if (op === 97 || op === 98) p += 2;
    else if (op === 99 || op === 107 || op === 109 || op === 111 || op === 122 || op === 123 || op === 129 || op === 145) { /* flag */ }
    else if (op === 100 || op === 101) i8();
    else if (op === 102) { const bf = u8(); let len = 0; for (let v = bf; v !== 0; v >>= 1) len++; for (let i = 0; i < len; i++) if (bf & (1 << i)) p += 4; }
    else if (op === 103) p += 2;
    else if (op === 106) { u16(); u16(); const n = u8(); p += 2 * (n + 1); }
    else if (op === 118) { u16(); u16(); u16(); const n = u8(); p += 2 * (n + 1); }
    else if (op === 114 || op === 116 || op === 124 || op === 126 || op === 146) p += 2;
    else if (op === 115 || op === 117) p += 8;
    else if (op === 249) { const n = u8(); for (let i = 0; i < n; i++) { const isS = u8() === 1; p += 3; if (isS) skipStr(); else p += 4; } }
    else break; // unknown opcode → stop (avoid desync garbage)
  }
  return out;
}
