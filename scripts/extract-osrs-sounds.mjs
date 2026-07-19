/**
 * Offline sound-extraction PoC — decodes OSRS **synthesised sound effects**
 * straight from a local game cache and writes them as 8-bit / 22050 Hz mono WAVs
 * into `public/`, so the game no longer depends on the (sparse) set of clips the
 * wiki happens to host.
 *
 * Index 4 (SOUNDEFFECTS) doesn't store ready audio — each file is a tiny synth
 * program (oscillator + envelope + filter "tones") the client renders at runtime.
 * osrscachereader has no decoder for it, so we port the canonical synthesizer
 * (LostCityRS/Client-TS `sound/Envelope|Tone|JagFX`, itself the de-obfuscated
 * Jagex algorithm) here and run it offline. Output is plain RIFF/WAVE PCM that
 * any browser can play through the existing SoundManager.
 *
 *   node scripts/extract-osrs-sounds.mjs                 # render curated TARGETS → public/
 *   node scripts/extract-osrs-sounds.mjs --dump 0 200    # dump a sound-id range → tmp/ for discovery
 *   node scripts/extract-osrs-sounds.mjs --only 1568     # render a single id → tmp/ (audition)
 *   OSRS_CACHE_DIR="/path/to/LIVE" node scripts/extract-osrs-sounds.mjs
 *
 * Sound-effect IDs aren't in a tidy enum like sprites; use `--dump` to audition
 * ranges and note the ones you want, then add them to TARGETS.
 */
import { RSCache, IndexType } from 'osrscachereader';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

const DEFAULT_CACHE = join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || DEFAULT_CACHE;

const SAMPLE_RATE = 22050;

/**
 * Curated sound-effect IDs → output basename. Empty by default: populate it from
 * `--dump`/`--named` auditions. Each entry renders to `public/assets/sounds/<slug>.wav`
 * and can then be referenced from `lib/game/assets.ts`.
 */
const TARGETS = {
  // --- UI / interface (verified RuneLite SoundEffectID) ---
  ui_click: 2266,              // boop — generic button / select
  ui_select: 970,              // poh_select — soft build-select chime (tower select)
  ui_coins: 3924,              // ge coin tinkle — selling a tower
  ui_teleport: 200,            // teleport vwoop — wave start
  ge_offer: 3925,              // GE add-offer chime
  ge_collect: 3928,            // GE collect
  // --- combat ---
  combat_hit: 2498,            // melee attack-hit thud
  combat_block: 510,           // take-damage hitsplat
  magic_splash: 227,           // splash (magic missed)
  // --- misc core SFX (config names verified against the wiki List_of_sound_IDs) ---
  pick_up: 2582,               // pick2 — item-pickup plop (RuneLite ITEM_PICKUP)
  potion: 2401,                // liquid — drinking a potion
  death_human: 512,            // human_death — a life lost
  boss_attack: 1521,           // vorkath_attack — boss attack roar
  // Zulrah's morph cry. The cache has no Zulrah-specific clip (its NPC def carries
  // no sound ids and the wiki lists none), so it borrows the game's own snake voice
  // — right for a giant serpent, and pointedly NOT a death clip, which would read
  // as "the boss died" every time it changes form.
  zulrah_hiss: 791,            // big_seasnake_attack — the heaviest serpent cry the cache has
  special_attack: 2537,        // puncture — the dragon dagger special
  fireworks: 2396,             // firework — relic-pickup celebration burst
  // --- prayer activations (OSRS has a unique clip for these) ---
  prayer_ultimate_strength: 2691,
  prayer_protect_magic: 2675,
  prayer_protect_missiles: 2677,
  prayer_protect_melee: 2676,
  prayer_eagle_eye: 2665,
  prayer_mystic_might: 2669,
  prayer_piety: 3825,
  prayer_rigour: 2685,
  prayer_augury: 2670,
  prayer_generic_on: 2690,     // thick-skin "vwoom" — fallback for prayers with no unique clip
  prayer_off: 2663,            // deactivate vwoop (one shared clip for all, as in OSRS)

  // --- Tower attack sounds (config names from List_of_sound_IDs) ---
  fire_archer: 2700,           // longbow
  fire_cannon: 1667,           // mcannon_fire (dwarf multicannon)
  fire_tzhaar: 190,            // superheat_all
  fire_slayer: 1718,           // magic_dart_fire
  fire_toxic: 1380,            // dart_fire
  cast_support: 2895,          // lunar_heal_other

  // --- Standard spellbook CAST clips (Strike/Bolt/Blast/Wave/Surge = lvl 1..5),
  //     played when the spell is fired. `<el><tier>_cast_and_fire`. ---
  cast_air_1: 220, cast_air_2: 218, cast_air_3: 216, cast_air_4: 222, cast_air_5: 4028,
  cast_water_1: 211, cast_water_2: 209, cast_water_3: 207, cast_water_4: 213, cast_water_5: 4030,
  cast_earth_1: 132, cast_earth_2: 130, cast_earth_3: 128, cast_earth_4: 134, cast_earth_5: 4025,
  cast_fire_1: 160, cast_fire_2: 157, cast_fire_3: 155, cast_fire_4: 162, cast_fire_5: 4032,
  // Standard HIT clips (`<el><tier>_hit`), played when the bolt connects.
  hit_air_1: 221, hit_air_2: 219, hit_air_3: 217, hit_air_4: 223, hit_air_5: 4027,
  hit_water_1: 212, hit_water_2: 210, hit_water_3: 208, hit_water_4: 214, hit_water_5: 4029,
  hit_earth_1: 133, hit_earth_2: 131, hit_earth_3: 129, hit_earth_4: 135, hit_earth_5: 4026,
  hit_fire_1: 161, hit_fire_2: 158, hit_fire_3: 156, hit_fire_4: 163, hit_fire_5: 4031,

  // --- Ancient CAST clips — one shared `<el>_cast` per element (OSRS reuses the
  //     same cast sound across an element's four tiers), played on fire. ---
  cast_ice: 171, cast_blood: 106, cast_shadow: 178, cast_smoke: 183,
  // Ancient HIT clips — per-tier `<el>_<tier>_impact` (Rush/Burst/Blitz/Barrage).
  hit_ice_1: 173, hit_ice_2: 170, hit_ice_3: 169, hit_ice_4: 168,
  hit_blood_1: 110, hit_blood_2: 105, hit_blood_3: 104, hit_blood_4: 102,
  hit_shadow_1: 179, hit_shadow_2: 177, hit_shadow_3: 176, hit_shadow_4: 175,
  hit_smoke_1: 185, hit_smoke_2: 182, hit_smoke_3: 181, hit_smoke_4: 180,

  // --- Per-enemy death clips (exact config names from List_of_sound_IDs) ---
  death_goblin: 471, death_rat: 711, death_cow: 370, death_imp: 535,
  death_spider: 3606, death_skeleton: 777, death_zombie: 922, death_ghost: 438,
  death_hellhound: 6952, death_scorpion: 3610, death_fire_giant: 450,
  death_bloodveld: 313, death_hill_giant: 450, death_black_demon: 398,
  death_gargoyle: 429, death_blue_dragon: 409, death_nechryael: 646,
  death_abyssal_demon: 277, death_lesser_demon: 403, death_dark_beast: 390,
  death_green_dragon: 409, death_jad: 256, death_vorkath: 1523,
  death_barrow_wight: 1338, death_chaos_druid: 512, death_skeletal_mage: 777,
  death_hydra: 4080, death_superior_bloodveld: 313, death_superior_abyssal_demon: 277,
  death_superior_gargoyle: 429, death_superior_nechryael: 646,
  // Every boss dies with its OWN voice, never a stand-in: a boss that borrows
  // another monster's death cry reads as the wrong thing dying.
  death_giant_mole: 1645,      // mole_death
  death_cerberus: 1188,        // skeletal_hellhound_death — the giant hound, not the common one (6952)
  death_dusk: 429,             // gargoyle_death — the Grotesque Guardians are gargoyles
  death_dawn: 429,             // gargoyle_death
  death_zulrah: 792,           // big_seasnake_death — was dragon_death (409), which it is not
  death_yt_hurkot: 252,        // tzhaar_hur_death — a Yt-HurKot is a TzHaar-Hur
  death_summoned_soul: 438,    // ghost_death — Cerberus' souls
};

/**
 * Verified named sound ids (RuneLite `net.runelite.api.SoundEffectID`), grouped
 * by category. `--named` renders these into `tmp/osrs-sounds/<category>/<name>.wav`
 * with human-readable filenames so they can be auditioned and picked. Combat /
 * death / spell-cast sounds have NO named enum — use `--dump` (duration-bucketed)
 * to explore those.
 */
const CATALOG = {
  ui: {
    boop: 2266, close_door: 60, open_door: 62, item_drop: 2739, item_pickup: 2582,
    pick_plant: 2581, bury_bones: 2738, teleport_vwoop: 200, npc_teleport_woosh: 1930,
    ge_add_offer: 3925, ge_collect: 3928, ge_coin_tinkle: 3924, ge_increment: 3929,
    ge_decrement: 3930, town_crier_ding: 3813, town_crier_dong: 3817,
  },
  combat: {
    zero_damage_splat: 511, take_damage_splat: 510, attack_hit: 2498,
    magic_splash_boing: 227,
  },
  skill: {
    tinder_strike: 2597, fire_woosh: 2596, tree_falling: 2734, tree_chop: 2735,
    mining_tink: 3220, cook_woosh: 2577, smith_anvil_tink: 3790, smith_anvil_tonk: 3791,
  },
  prayer: {
    activate_protect_melee: 2676, activate_protect_missiles: 2677, activate_protect_magic: 2675,
    activate_piety: 3825, activate_chivalry: 3826, activate_rigour: 2685, activate_augury: 2670,
    activate_eagle_eye: 2665, activate_mystic_might: 2669, activate_smite: 2686,
    activate_retribution: 2682, activate_redemption: 2680, activate_thick_skin: 2690,
    activate_ultimate_strength: 2691, deactivate_vwoop: 2663, deplete_twinkle: 2672,
  },
};

// --------------------------------------------------------------------------
// Minimal big-endian reader (the handful of Packet ops the synth loader uses).
// --------------------------------------------------------------------------
export class Reader {
  constructor(bytes) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = 0;
  }
  g1() { return this.view.getUint8(this.pos++); }
  g2() { const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
  g4() { const v = this.view.getInt32(this.pos); this.pos += 4; return v; }
  // "smart" — 1 or 2 bytes depending on the top bit of the next byte.
  gsmart() { return this.view.getUint8(this.pos) < 0x80 ? this.g1() - 0x40 : this.g2() - 0xc000; }
  gsmarts() { return this.view.getUint8(this.pos) < 0x80 ? this.g1() : this.g2() - 0x8000; }
}

// Java's java.util.Random — needed so the noise table matches the client exactly.
class JavaRandom {
  constructor(seed) { this.seed = (BigInt(seed) ^ 0x5deece66dn) & ((1n << 48n) - 1n); }
  next(bits) {
    this.seed = (this.seed * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n);
    const r = Number(this.seed >> BigInt(48 - bits));
    return bits === 32 ? r | 0 : r;
  }
  nextInt() { return this.next(32); }
}

// --------------------------------------------------------------------------
// Synth — ported 1:1 from LostCityRS/Client-TS (Envelope / Tone / JagFX).
// --------------------------------------------------------------------------
export class Envelope {
  constructor() {
    this.length = 2;
    this.shapeDelta = new Int32Array([0, 65535]);
    this.shapePeak = new Int32Array([0, 65535]);
    this.start = this.end = this.form = 0;
    this.threshold = this.position = this.delta = this.amplitude = this.ticks = 0;
  }
  load(dat) {
    this.form = dat.g1();
    this.start = dat.g4();
    this.end = dat.g4();
    this.loadShape(dat);
  }
  // Just the segment table (used standalone by the filter envelope).
  loadShape(dat) {
    this.length = dat.g1();
    this.shapeDelta = new Int32Array(this.length);
    this.shapePeak = new Int32Array(this.length);
    for (let i = 0; i < this.length; i++) {
      this.shapeDelta[i] = dat.g2();
      this.shapePeak[i] = dat.g2();
    }
  }
  genInit() { this.threshold = this.position = this.delta = this.amplitude = this.ticks = 0; }
  genNext(delta) {
    if (this.ticks >= this.threshold) {
      this.amplitude = this.shapePeak[this.position++] << 15;
      if (this.position >= this.length) this.position = this.length - 1;
      this.threshold = ((this.shapeDelta[this.position] / 65536.0) * delta) | 0;
      if (this.threshold > this.ticks) {
        this.delta = (((this.shapePeak[this.position] << 15) - this.amplitude) / (this.threshold - this.ticks)) | 0;
      }
    }
    this.amplitude += this.delta;
    this.ticks++;
    return (this.amplitude - this.delta) >> 15;
  }
}

const NOISE = new Int32Array(32768);
const SINE = new Int32Array(32768);
{
  const rand = new JavaRandom(0);
  for (let i = 0; i < 32768; i++) NOISE[i] = (rand.nextInt() & 0x2) - 1;
  for (let i = 0; i < 32768; i++) SINE[i] = (Math.sin(i / 5215.1903) * 16384.0) | 0;
}

// Floor-divide by 65536 — matches Java `(long)(a*b) >> 16` (arithmetic shift) for
// the value range here, including negatives (>> floors; Math.trunc would not).
const shr16 = (product) => Math.floor(product / 65536);

/**
 * Adaptive IIR filter (cascading biquad sections) the OSRS synth applies per tone.
 * Ported from the 317 client `audio/SoundFilter` + the filter block of
 * `audio/Instrument.synthesise`. The post-2004 caches (incl. OSRS LIVE) append
 * this section after each tone's duration/begin — build-254 reference lacks it,
 * which is why ignoring it desynced the byte stream on ~40% of sounds.
 */
export class SoundFilter {
  // Shared scratch (the client keeps these static too).
  static coef = [new Float64Array(8), new Float64Array(8)]; // float coefficients
  static coefInt = [new Int32Array(8), new Int32Array(8)];  // fixed-point (<<16)
  static invUnity = 0;
  static _invUnity = 0;

  constructor() {
    this.pairCount = new Int32Array(2);
    this.pairPhase = [[new Int32Array(4), new Int32Array(4)], [new Int32Array(4), new Int32Array(4)]];
    this.pairMagnitude = [[new Int32Array(4), new Int32Array(4)], [new Int32Array(4), new Int32Array(4)]];
    this.unity = new Int32Array(2);
  }

  adaptMagnitude(direction, i, f) {
    let alpha = this.pairMagnitude[direction][0][i] + f * (this.pairMagnitude[direction][1][i] - this.pairMagnitude[direction][0][i]);
    alpha *= 0.001525879;
    return 1.0 - Math.pow(10, -alpha / 20);
  }
  adaptPhase(f, i, direction) {
    let alpha = this.pairPhase[direction][0][i] + f * (this.pairPhase[direction][1][i] - this.pairPhase[direction][0][i]);
    alpha *= 0.0001220703;
    const v = 32.7032 * Math.pow(2, alpha);
    return (v * 3.141593) / 11025;
  }

  compute(direction, f) {
    const C = SoundFilter.coef;
    if (direction === 0) {
      let f1 = this.unity[0] + (this.unity[1] - this.unity[0]) * f;
      f1 *= 0.003051758;
      SoundFilter._invUnity = Math.pow(0.1, f1 / 20);
      SoundFilter.invUnity = (SoundFilter._invUnity * 65536) | 0;
    }
    if (this.pairCount[direction] === 0) return 0;
    const mag0 = this.adaptMagnitude(direction, 0, f);
    C[direction][0] = -2 * mag0 * Math.cos(this.adaptPhase(f, 0, direction));
    C[direction][1] = mag0 * mag0;
    for (let pair = 1; pair < this.pairCount[direction]; pair++) {
      const mag = this.adaptMagnitude(direction, pair, f);
      const phase = -2 * mag * Math.cos(this.adaptPhase(f, pair, direction));
      const coeff = mag * mag;
      C[direction][pair * 2 + 1] = C[direction][pair * 2 - 1] * coeff;
      C[direction][pair * 2] = C[direction][pair * 2 - 1] * phase + C[direction][pair * 2 - 2] * coeff;
      for (let j = pair * 2 - 1; j >= 2; j--) {
        C[direction][j] += C[direction][j - 1] * phase + C[direction][j - 2] * coeff;
      }
      C[direction][1] += C[direction][0] * phase + coeff;
      C[direction][0] += phase;
    }
    if (direction === 0) {
      for (let pair = 0; pair < this.pairCount[0] * 2; pair++) C[0][pair] *= SoundFilter._invUnity;
    }
    for (let pair = 0; pair < this.pairCount[direction] * 2; pair++) {
      SoundFilter.coefInt[direction][pair] = (C[direction][pair] * 65536) | 0;
    }
    return this.pairCount[direction] * 2;
  }

  decode(dat, envelope) {
    const count = dat.g1();
    this.pairCount[0] = count >> 4;
    this.pairCount[1] = count & 0xf;
    if (count !== 0) {
      this.unity[0] = dat.g2();
      this.unity[1] = dat.g2();
      const migrated = dat.g1();
      for (let dir = 0; dir < 2; dir++) {
        for (let pair = 0; pair < this.pairCount[dir]; pair++) {
          this.pairPhase[dir][0][pair] = dat.g2();
          this.pairMagnitude[dir][0][pair] = dat.g2();
        }
      }
      for (let dir = 0; dir < 2; dir++) {
        for (let pair = 0; pair < this.pairCount[dir]; pair++) {
          if ((migrated & ((1 << (dir * 4)) << pair)) !== 0) {
            this.pairPhase[dir][1][pair] = dat.g2();
            this.pairMagnitude[dir][1][pair] = dat.g2();
          } else {
            this.pairPhase[dir][1][pair] = this.pairPhase[dir][0][pair];
            this.pairMagnitude[dir][1][pair] = this.pairMagnitude[dir][0][pair];
          }
        }
      }
      if (migrated !== 0 || this.unity[1] !== this.unity[0]) envelope.loadShape(dat);
    } else {
      this.unity[0] = this.unity[1] = 0;
    }
  }
}

export class Tone {
  constructor() {
    this.frequencyBase = new Envelope();
    this.amplitudeBase = new Envelope();
    this.frequencyModRate = this.frequencyModRange = null;
    this.amplitudeModRate = this.amplitudeModRange = null;
    this.release = this.attack = null;
    this.harmonicVolume = new Int32Array(5);
    this.harmonicSemitone = new Int32Array(5);
    this.harmonicDelay = new Int32Array(5);
    this.reverbDelay = 0;
    this.reverbVolume = 100;
    this.length = 500;
    this.start = 0;
    this.filter = new SoundFilter();
    this.filterEnvelope = new Envelope();
  }

  static buf = new Int32Array(SAMPLE_RATE * 10);
  static fPos = new Int32Array(5);
  static fDel = new Int32Array(5);
  static fAmp = new Int32Array(5);
  static fMulti = new Int32Array(5);
  static fOffset = new Int32Array(5);

  waveFunc(amplitude, phase, form) {
    if (form === 1) return (phase & 0x7fff) < 16384 ? amplitude : -amplitude;
    if (form === 2) return (SINE[phase & 0x7fff] * amplitude) >> 14;
    if (form === 3) return (((phase & 0x7fff) * amplitude) >> 14) - amplitude;
    if (form === 4) return NOISE[((phase / 2607) | 0) & 0x7fff] * amplitude;
    return 0;
  }

  generate(sampleCount, length) {
    for (let s = 0; s < sampleCount; s++) Tone.buf[s] = 0;
    if (length < 10) return Tone.buf;

    const samplesPerStep = sampleCount / length;
    this.frequencyBase.genInit();
    this.amplitudeBase.genInit();

    let frequencyStart = 0, frequencyDuration = 0, frequencyPhase = 0;
    if (this.frequencyModRate && this.frequencyModRange) {
      this.frequencyModRate.genInit();
      this.frequencyModRange.genInit();
      frequencyStart = (((this.frequencyModRate.end - this.frequencyModRate.start) * 32.768) / samplesPerStep) | 0;
      frequencyDuration = ((this.frequencyModRate.start * 32.768) / samplesPerStep) | 0;
    }

    let amplitudeStart = 0, amplitudeDuration = 0, amplitudePhase = 0;
    if (this.amplitudeModRate && this.amplitudeModRange) {
      this.amplitudeModRate.genInit();
      this.amplitudeModRange.genInit();
      amplitudeStart = (((this.amplitudeModRate.end - this.amplitudeModRate.start) * 32.768) / samplesPerStep) | 0;
      amplitudeDuration = ((this.amplitudeModRate.start * 32.768) / samplesPerStep) | 0;
    }

    for (let h = 0; h < 5; h++) {
      if (this.harmonicVolume[h] !== 0) {
        Tone.fPos[h] = 0;
        Tone.fDel[h] = this.harmonicDelay[h] * samplesPerStep;
        Tone.fAmp[h] = ((this.harmonicVolume[h] << 14) / 100) | 0;
        Tone.fMulti[h] = (((this.frequencyBase.end - this.frequencyBase.start) * 32.768 * Math.pow(1.0057929410678534, this.harmonicSemitone[h])) / samplesPerStep) | 0;
        Tone.fOffset[h] = ((this.frequencyBase.start * 32.768) / samplesPerStep) | 0;
      }
    }

    for (let sample = 0; sample < sampleCount; sample++) {
      let frequency = this.frequencyBase.genNext(sampleCount);
      let amplitude = this.amplitudeBase.genNext(sampleCount);

      if (this.frequencyModRate && this.frequencyModRange) {
        const rate = this.frequencyModRate.genNext(sampleCount);
        const range = this.frequencyModRange.genNext(sampleCount);
        frequency += this.waveFunc(range, frequencyPhase, this.frequencyModRate.form) >> 1;
        frequencyPhase += ((rate * frequencyStart) >> 16) + frequencyDuration;
      }

      if (this.amplitudeModRate && this.amplitudeModRange) {
        const rate = this.amplitudeModRate.genNext(sampleCount);
        const range = this.amplitudeModRange.genNext(sampleCount);
        amplitude = (amplitude * ((this.waveFunc(range, amplitudePhase, this.amplitudeModRate.form) >> 1) + 32768)) >> 15;
        amplitudePhase += ((rate * amplitudeStart) >> 16) + amplitudeDuration;
      }

      for (let h = 0; h < 5; h++) {
        if (this.harmonicVolume[h] !== 0) {
          const position = sample + Tone.fDel[h];
          if (position < sampleCount) {
            Tone.buf[position] += this.waveFunc((amplitude * Tone.fAmp[h]) >> 15, Tone.fPos[h], this.frequencyBase.form);
            Tone.fPos[h] += ((frequency * Tone.fMulti[h]) >> 16) + Tone.fOffset[h];
          }
        }
      }
    }

    if (this.release && this.attack) {
      this.release.genInit();
      this.attack.genInit();
      let counter = 0, muted = true;
      for (let sample = 0; sample < sampleCount; sample++) {
        const releaseValue = this.release.genNext(sampleCount);
        const attackValue = this.attack.genNext(sampleCount);
        const threshold = muted
          ? this.release.start + (((this.release.end - this.release.start) * releaseValue) >> 8)
          : this.release.start + (((this.release.end - this.release.start) * attackValue) >> 8);
        counter += 256;
        if (counter >= threshold) { counter = 0; muted = !muted; }
        if (muted) Tone.buf[sample] = 0;
      }
    }

    if (this.reverbDelay > 0 && this.reverbVolume > 0) {
      const start = (this.reverbDelay * samplesPerStep) | 0;
      for (let sample = start; sample < sampleCount; sample++) {
        Tone.buf[sample] += ((Tone.buf[sample - start] * this.reverbVolume) / 100) | 0;
      }
    }

    // Adaptive IIR filter pass (Instrument.synthesise filter block).
    if (this.filter.pairCount[0] > 0 || this.filter.pairCount[1] > 0) {
      const buf = Tone.buf;
      const C0 = SoundFilter.coefInt[0], C1 = SoundFilter.coefInt[1];
      this.filterEnvelope.genInit();
      let t = this.filterEnvelope.genNext(sampleCount + 1);
      let M = this.filter.compute(0, t / 65536);
      let N = this.filter.compute(1, t / 65536);
      if (sampleCount >= M + N) {
        let n = 0;
        let delay = N;
        if (delay > sampleCount - M) delay = sampleCount - M;
        for (; n < delay; n++) {
          let y = shr16(buf[n + M] * SoundFilter.invUnity);
          for (let k = 0; k < M; k++) y += shr16(buf[n + M - 1 - k] * C0[k]);
          for (let j = 0; j < n; j++) y -= shr16(buf[n - 1 - j] * C1[j]);
          buf[n] = y;
          t = this.filterEnvelope.genNext(sampleCount + 1);
        }
        const STEP = 128;
        delay = STEP;
        for (;;) {
          if (delay > sampleCount - M) delay = sampleCount - M;
          for (; n < delay; n++) {
            let y = shr16(buf[n + M] * SoundFilter.invUnity);
            for (let k = 0; k < M; k++) y += shr16(buf[n + M - 1 - k] * C0[k]);
            for (let j = 0; j < N; j++) y -= shr16(buf[n - 1 - j] * C1[j]);
            buf[n] = y;
            t = this.filterEnvelope.genNext(sampleCount + 1);
          }
          if (n >= sampleCount - M) break;
          M = this.filter.compute(0, t / 65536);
          N = this.filter.compute(1, t / 65536);
          delay += STEP;
        }
        for (; n < sampleCount; n++) {
          let y = 0;
          for (let k = n + M - sampleCount; k < M; k++) y += shr16(buf[n + M - 1 - k] * C0[k]);
          for (let j = 0; j < N; j++) y -= shr16(buf[n - 1 - j] * C1[j]);
          buf[n] = y;
        }
      }
    }

    for (let s = 0; s < sampleCount; s++) {
      if (Tone.buf[s] < -32768) Tone.buf[s] = -32768;
      else if (Tone.buf[s] > 32767) Tone.buf[s] = 32767;
    }
    return Tone.buf;
  }

  load(dat) {
    this.frequencyBase = new Envelope(); this.frequencyBase.load(dat);
    this.amplitudeBase = new Envelope(); this.amplitudeBase.load(dat);
    if (dat.g1() !== 0) {
      dat.pos--;
      this.frequencyModRate = new Envelope(); this.frequencyModRate.load(dat);
      this.frequencyModRange = new Envelope(); this.frequencyModRange.load(dat);
    }
    if (dat.g1() !== 0) {
      dat.pos--;
      this.amplitudeModRate = new Envelope(); this.amplitudeModRate.load(dat);
      this.amplitudeModRange = new Envelope(); this.amplitudeModRange.load(dat);
    }
    if (dat.g1() !== 0) {
      dat.pos--;
      this.release = new Envelope(); this.release.load(dat);
      this.attack = new Envelope(); this.attack.load(dat);
    }
    // The client always advances the stream for up to 10 harmonics; only the
    // first 5 are actually synthesised (writes past index 4 are ignored, as in
    // the reference). Must read all of them or the byte position desyncs.
    for (let h = 0; h < 10; h++) {
      const volume = dat.gsmarts();
      if (volume === 0) break;
      const semitone = dat.gsmart();
      const delay = dat.gsmarts();
      if (h < 5) {
        this.harmonicVolume[h] = volume;
        this.harmonicSemitone[h] = semitone;
        this.harmonicDelay[h] = delay;
      }
    }
    this.reverbDelay = dat.gsmarts();
    this.reverbVolume = dat.gsmarts();
    this.length = dat.g2();
    this.start = dat.g2();
    this.filter.decode(dat, this.filterEnvelope);
  }
}

export class JagFX {
  constructor() { this.tones = new Array(10).fill(null); this.loopBegin = 0; this.loopEnd = 0; }

  load(dat) {
    for (let t = 0; t < 10; t++) {
      if (dat.g1() !== 0) {
        dat.pos--;
        this.tones[t] = new Tone();
        this.tones[t].load(dat);
      }
    }
    this.loopBegin = dat.g2();
    this.loopEnd = dat.g2();
  }

  /** Render to a Uint8Array of 8-bit unsigned PCM samples (no header). */
  makeSound(loopCount = 1) {
    let duration = 0;
    for (const tone of this.tones) {
      if (tone && tone.length + tone.start > duration) duration = tone.length + tone.start;
    }
    if (duration === 0) return new Uint8Array(0);

    const sampleCount = ((duration * SAMPLE_RATE) / 1000) | 0;
    let loopStart = ((this.loopBegin * SAMPLE_RATE) / 1000) | 0;
    let loopStop = ((this.loopEnd * SAMPLE_RATE) / 1000) | 0;
    if (loopStart < 0 || loopStop < 0 || loopStop > sampleCount || loopStart >= loopStop) loopCount = 0;
    // For one-shot extraction we never expand loops; force >=1 so an invalid loop
    // region (loopCount forced to 0 above) can't yield a negative buffer length.
    if (loopCount < 1) loopCount = 1;

    const totalSampleCount = sampleCount + (loopStop - loopStart) * (loopCount - 1);
    const out = new Uint8Array(totalSampleCount);
    out.fill(128); // -128 in two's complement = unsigned-8 silence

    for (const tone of this.tones) {
      if (!tone) continue;
      const toneSampleCount = ((tone.length * SAMPLE_RATE) / 1000) | 0;
      const start = ((tone.start * SAMPLE_RATE) / 1000) | 0;
      const samples = tone.generate(toneSampleCount, tone.length);
      for (let s = 0; s < toneSampleCount; s++) {
        const idx = s + start;
        if (idx < out.length) out[idx] = (out[idx] + ((((samples[s] >> 8) << 24) >> 24))) & 0xff;
      }
    }

    if (loopCount > 1) {
      for (let loop = 1; loop < loopCount; loop++) {
        const offset = (loopStop - loopStart) * loop;
        for (let s = loopStart; s < loopStop; s++) out[s + offset] = out[s];
      }
    }
    return out;
  }
}

/** Wrap raw 8-bit unsigned PCM samples in a 44-byte RIFF/WAVE header. */
function toWav(samples) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + samples.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);      // fmt chunk size
  header.writeUInt16LE(1, 20);       // PCM
  header.writeUInt16LE(1, 22);       // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE, 28); // byte rate (1 byte/sample)
  header.writeUInt16LE(1, 32);       // block align
  header.writeUInt16LE(8, 34);       // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, Buffer.from(samples)]);
}

async function renderId(cache, id) {
  const file = await cache.getFile(IndexType.SOUNDEFFECTS, id, 0).catch(() => null);
  const content = file?.content;
  if (!content || content.length < 4) return null;
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  try {
    const fx = new JagFX();
    fx.load(new Reader(bytes));
    const samples = fx.makeSound(1);
    if (samples.length === 0) return null;
    return { wav: toWav(samples), ms: Math.round((samples.length / SAMPLE_RATE) * 1000) };
  } catch {
    return null; // some ids aren't synth programs / malformed for offline render
  }
}

async function main() {
  if (!existsSync(join(CACHE_DIR, 'main_file_cache.dat2'))) {
    console.error(`No cache at ${CACHE_DIR}\nSet OSRS_CACHE_DIR.`);
    process.exit(1);
  }
  console.log(`Loading cache: ${CACHE_DIR}`);
  const cache = new RSCache(CACHE_DIR);
  await cache.onload;

  const dumpIdx = process.argv.indexOf('--dump');
  const onlyIdx = process.argv.indexOf('--only');
  const named = process.argv.includes('--named');

  // Render the verified named ids into category subfolders with readable names.
  if (named) {
    const base = join(REPO, 'tmp', 'osrs-sounds', 'named');
    let count = 0;
    for (const [category, ids] of Object.entries(CATALOG)) {
      const dir = join(base, category);
      mkdirSync(dir, { recursive: true });
      for (const [name, id] of Object.entries(ids)) {
        const r = await renderId(cache, id);
        if (!r) { console.warn(`! ${category}/${name} (${id}) undecodable`); continue; }
        writeFileSync(join(dir, `${name}_${id}.wav`), r.wav);
        count++;
        console.log(`✓ ${category}/${name} (${id}) ${r.ms}ms`);
      }
    }
    console.log(`Dumped ${count} named sound(s) → ${base}`);
    process.exit(0);
  }

  if (dumpIdx !== -1 || onlyIdx !== -1) {
    const from = dumpIdx !== -1 ? Number(process.argv[dumpIdx + 1] ?? 0) : Number(process.argv[onlyIdx + 1]);
    const to = dumpIdx !== -1 ? Number(process.argv[dumpIdx + 2] ?? from) : from;
    // Bucket by clip length so the unnamed space is navigable: short clips are
    // clicks/impacts, medium are casts/attacks, long are deaths/jingles.
    const base = join(REPO, 'tmp', 'osrs-sounds');
    const bucket = (ms) => (ms < 400 ? 'short' : ms < 1500 ? 'medium' : 'long');
    for (const b of ['short', 'medium', 'long']) mkdirSync(join(base, b), { recursive: true });
    let count = 0;
    for (let id = from; id <= to; id++) {
      const r = await renderId(cache, id);
      if (!r) continue;
      writeFileSync(join(base, bucket(r.ms), `${id}_${r.ms}ms.wav`), r.wav);
      count++;
      if (count % 250 === 0) console.log(`… ${count} dumped (at id ${id})`);
    }
    console.log(`Dumped ${count} sound(s) ${from}..${to} → ${base}/{short,medium,long}`);
    process.exit(0);
  }

  let ok = 0;
  for (const [slug, id] of Object.entries(TARGETS)) {
    const r = await renderId(cache, id);
    if (!r) { console.warn(`! sound ${id} (${slug}) empty/undecodable — skipped`); continue; }
    const outPath = join(REPO, 'public', 'assets', 'sounds', `${slug}.wav`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, r.wav);
    ok++;
    console.log(`✓ ${slug}: sound ${id} → public/assets/sounds/${slug}.wav (${r.ms}ms)`);
  }
  if (ok === 0 && Object.keys(TARGETS).length === 0) {
    console.log('No TARGETS configured. Use --dump <from> <to> to audition ids, then add them to TARGETS.');
  }
  process.exit(0);
}

// Only run when invoked directly, so the synth classes can be imported for tests/debug.
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/'))) {
  main();
}
