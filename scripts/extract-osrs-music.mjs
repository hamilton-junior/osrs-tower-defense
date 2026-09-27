/**
 * Music bake — the game's soundtrack, straight out of the local OSRS cache.
 *
 * OSRS music is not recorded audio: each track is a MIDI file (cache index 6)
 * that the client plays on its own instruments (patches in index 15, their Vorbis
 * samples in index 14, a few synthesised effects in index 4). So is the game's:
 * this script writes, for every track in `lib/game/data/music.ts`,
 *
 *   public/assets/music/<id>.mid   the track as the client rebuilds it
 *   public/assets/music/bank.bin   one soundbank holding every patch those tracks
 *                                  select and every sample the notes they play need
 *   public/assets/music/tracks.json  each track's loudness level (see the end of main)
 *
 * and the browser renders them with the port of the client's synth in
 * `lib/game/music/` (the whole soundtrack's bank is under half a megabyte).
 *
 * Which patches and samples a track needs is not guessed from its MIDI: the script
 * plays each track through that same synth and records every instrument and key it
 * asks for, so the bank cannot miss a note the game will play. It then renders
 * every track from the finished bank as a check, and fails if one comes out silent
 * or never loops.
 *
 *   npm run extract:music
 *   OSRS_CACHE_DIR="/path/to/LIVE" npm run extract:music
 *
 * Runs on Node's TypeScript support (Node 22.18+ / 24): the synth modules are
 * imported as .ts, not duplicated here.
 */
import { RSCache } from 'osrscachereader';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { MUSIC_TRACKS } from '../lib/game/data/music.ts';
import { decodeMusicPatch, sampleRef } from '../lib/game/music/patch.ts';
import { MidiSynth, renderTrackLoop, SYNTH_RATE } from '../lib/game/music/synth.ts';
import { encodeBank, SoundBank } from '../lib/game/music/bank.ts';
import { JagFX, Reader } from './extract-osrs-sounds.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'assets', 'music');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
/** Loudness every track is levelled to (RMS of full scale), before the player's volume. */
const TARGET_RMS = 0.1;

/** Java's `String.hashCode` — how the cache stores an archive's name. */
const nameHash = (s) => {
  let h = 0;
  for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return h;
};

/** The MIDI the loader hands back sits in a larger buffer: cut it at its last track. */
function trimMidi(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 8 + v.getUint32(4);
  const tracks = v.getUint16(10);
  for (let i = 0; i < tracks; i++) o += 8 + v.getUint32(o + 4);
  return bytes.slice(0, o);
}

async function main() {
  if (!existsSync(join(CACHE_DIR, 'main_file_cache.dat2'))) {
    console.error(`No cache at ${CACHE_DIR}\nSet OSRS_CACHE_DIR.`);
    process.exit(1);
  }
  console.log(`Loading cache: ${CACHE_DIR}`);
  const cache = new RSCache(CACHE_DIR);
  await cache.onload;

  const raw = async (index, archive, file = 0) => {
    const f = await cache.getFile(index, archive, file, { cacheResults: false }).catch(() => null);
    const c = f?.content;
    return c ? new Uint8Array(c.buffer, c.byteOffset, c.byteLength) : null;
  };

  const byHash = new Map(Object.values(cache.getIndex(6).archives).map((a) => [a.nameHash, a.id]));
  const patchCache = new Map();
  const patchBytes = async (program) => {
    if (!patchCache.has(program)) patchCache.set(program, await raw(15, program));
    return patchCache.get(program);
  };
  // Every patch up front: the recording source below has to answer synchronously.
  for (const key of Object.keys(cache.getIndex(15).archives)) await patchBytes(Number(key));

  mkdirSync(OUT, { recursive: true });
  const midis = new Map();
  const programs = new Set();
  const samples = new Set();
  const placeholder = { sampleRate: SYNTH_RATE, samples: new Int8Array(1), start: 0, end: 0, pingPong: false };

  for (const track of MUSIC_TRACKS) {
    const archive = byHash.get(nameHash(track.cacheName));
    if (archive === undefined) throw new Error(`No track named "${track.cacheName}" in index 6`);
    const file = await cache.getFile(6, archive, 0);
    const midi = trimMidi(new Uint8Array(file.def.midi.buffer));
    midis.set(track.id, midi);
    writeFileSync(join(OUT, `${track.id}.mid`), midi);

    // Play the track once, recording each instrument it selects and each key it strikes.
    const insts = new Map();
    const source = (program) => {
      if (insts.has(program)) return insts.get(program);
      const bytes = patchCache.get(program);
      let inst = null;
      if (bytes) {
        const patch = decodeMusicPatch(bytes);
        const sounds = new Proxy(new Array(128).fill(placeholder), {
          get(target, key) {
            if (typeof key === 'string' && /^\d+$/.test(key) && patch.sampleIds[+key]) {
              programs.add(program);
              samples.add(patch.sampleIds[+key]);
            }
            return target[key];
          },
        });
        inst = { patch, sounds };
      }
      insts.set(program, inst);
      return inst;
    };
    const synth = new MidiSynth(midi, source, { loop: false });
    const buf = new Int32Array(8192 * 2);
    while (!synth.done && synth.frames < SYNTH_RATE * 900) synth.render(buf.fill(0), 0, 8192);
    console.log(`✓ ${track.id}: "${track.title}" (archive ${archive}), ${midi.length} bytes of MIDI`);
  }

  const bank = { setup: await raw(14, 0, 0), patches: new Map(), vorbis: new Map(), sfx: new Map() };
  for (const program of [...programs].sort((a, b) => a - b)) bank.patches.set(program, await patchBytes(program));
  for (const packed of [...samples].sort((a, b) => a - b)) {
    const ref = sampleRef(packed);
    if (ref.kind === 'vorbis') {
      const bytes = await raw(14, ref.id, 0);
      if (!bytes) throw new Error(`Music sample ${ref.id} missing from index 14`);
      bank.vorbis.set(ref.id, bytes);
    } else {
      const bytes = await raw(4, ref.id, 0);
      if (!bytes) throw new Error(`Sound effect ${ref.id} missing from index 4`);
      const fx = new JagFX();
      fx.load(new Reader(bytes));
      const u8 = fx.makeSound(1, 0);
      const pcm = new Int8Array(u8.length);
      for (let i = 0; i < u8.length; i++) pcm[i] = ((u8[i] ^ 0x80) << 24) >> 24;
      bank.sfx.set(ref.id, {
        sampleRate: 22050,
        samples: pcm,
        start: Math.trunc((fx.loopBegin * 22050) / 1000),
        end: Math.trunc((fx.loopEnd * 22050) / 1000),
        pingPong: false,
      });
    }
  }
  const encoded = encodeBank(bank);
  writeFileSync(join(OUT, 'bank.bin'), encoded);
  console.log(
    `✓ bank.bin: ${bank.patches.size} patches, ${bank.vorbis.size} Vorbis samples, ` +
      `${bank.sfx.size} synth samples — ${(encoded.length / 1024).toFixed(0)} KB`,
  );

  // Render every track from the bank exactly as the browser will, and level them:
  // OSRS tracks range from a harp to Inferno's full orchestra, and the client plays
  // them all at one volume. The game evens them out instead — each gets the gain
  // that brings its loop to the same loudness — and stores it for the player.
  const check = SoundBank.fromBytes(encoded);
  const levels = {};
  let failed = 0;
  for (const track of MUSIC_TRACKS) {
    const t0 = Date.now();
    const r = renderTrackLoop(midis.get(track.id), check.instrument, { targetRms: TARGET_RMS });
    let peak = 0;
    for (let i = 0; i < r.left.length; i++) peak = Math.max(peak, Math.abs(r.left[i]), Math.abs(r.right[i]));
    const secs = r.left.length / r.sampleRate;
    const ok = r.looped && secs > 5 && peak > 0.01 && Number.isFinite(peak);
    if (!ok) failed++;
    levels[track.id] = { gain: Number(r.gain.toFixed(4)), seconds: Number(secs.toFixed(2)) };
    console.log(`${ok ? '✓' : '✗'} ${track.id}: loop ${secs.toFixed(1)}s, gain ${r.gain.toFixed(2)}, peak ${peak.toFixed(2)}, rendered in ${Date.now() - t0}ms`);
  }
  writeFileSync(join(OUT, 'tracks.json'), JSON.stringify(levels, null, 2) + '\n');
  console.log('✓ tracks.json');
  process.exit(failed ? 1 : 0);
}

main();
