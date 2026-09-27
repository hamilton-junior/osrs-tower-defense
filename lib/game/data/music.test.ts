/**
 * The soundtrack as shipped: every track in the table has its baked MIDI and level,
 * every region has a track, and the baked soundbank decodes and plays with the
 * synth port — the same guard assets.test.ts keeps for icons, for music.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MUSIC_TRACKS, BIOME_TRACKS, LOBBY_TRACK, musicFor, musicTrack } from './music';
import { BIOME_LIST } from './biomes';
import { decodeBank, encodeBank, SoundBank } from '../music/bank.ts';
import { decodeMusicPatch } from '../music/patch.ts';
import { VorbisSetup, decodeVorbisSample } from '../music/vorbis.ts';
import { MidiSynth, SYNTH_RATE } from '../music/synth.ts';

const DIR = join(process.cwd(), 'public', 'assets', 'music');
const bankBytes = () => new Uint8Array(readFileSync(join(DIR, 'bank.bin')));
const midi = (id: string) => new Uint8Array(readFileSync(join(DIR, `${id}.mid`)));

describe('music table', () => {
  it('has a baked MIDI and a level for every track', () => {
    const levels = JSON.parse(readFileSync(join(DIR, 'tracks.json'), 'utf8')) as Record<string, { gain: number }>;
    for (const t of MUSIC_TRACKS) {
      expect(existsSync(join(DIR, `${t.id}.mid`)), t.id).toBe(true);
      expect(levels[t.id]?.gain, t.id).toBeGreaterThan(0);
    }
  });

  it('gives every region, and the start screen, a track that exists', () => {
    for (const b of BIOME_LIST) expect(musicTrack(BIOME_TRACKS[b.id]), b.id).toBeDefined();
    expect(musicTrack(LOBBY_TRACK)).toBeDefined();
  });

  it('plays the login theme until a run starts, then the region\'s own', () => {
    expect(musicFor(false, 'tzhaar')).toBe(LOBBY_TRACK);
    expect(musicFor(true, 'tzhaar')).toBe(BIOME_TRACKS.tzhaar);
  });
});

describe('baked soundbank', () => {
  it('round-trips through its own encoder', () => {
    const bytes = bankBytes();
    expect(Buffer.compare(encodeBank(decodeBank(bytes)), bytes)).toBe(0);
  });

  it('decodes every patch and every sample it carries', () => {
    const bank = decodeBank(bankBytes());
    expect(bank.patches.size).toBeGreaterThan(0);
    for (const [program, raw] of bank.patches) {
      const p = decodeMusicPatch(raw);
      expect(p.sampleIds.some((s) => s !== 0), `patch ${program}`).toBe(true);
    }
    const setup = new VorbisSetup(bank.setup);
    for (const [id, raw] of bank.vorbis) {
      const s = decodeVorbisSample(setup, raw);
      expect(s.samples.length, `sample ${id}`).toBeGreaterThan(0);
      expect(s.start, `sample ${id}`).toBeLessThanOrEqual(s.end);
      expect(s.end, `sample ${id}`).toBeLessThanOrEqual(s.samples.length);
      expect(s.samples.some((v) => v !== 0), `sample ${id}`).toBe(true);
    }
  });

  it('plays the opening of every track', () => {
    const bank = SoundBank.fromBytes(bankBytes());
    for (const t of MUSIC_TRACKS) {
      const synth = new MidiSynth(midi(t.id), bank.instrument, { loop: true });
      const buf = new Int32Array(SYNTH_RATE * 2);
      let loud = 0;
      for (let s = 0; s < 8; s++) {
        buf.fill(0);
        synth.render(buf, 0, SYNTH_RATE);
        if (buf.some((v) => v !== 0)) loud++;
      }
      expect(loud, t.id).toBeGreaterThan(4);
    }
  });
});
