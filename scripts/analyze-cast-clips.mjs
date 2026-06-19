// One-off offline analyser: downloads each wizard cast clip, decodes the MP3 to
// PCM (pure-WASM, no ffmpeg), and finds the boundary between the spell's "cast"
// portion and its "hit"/impact sfx. It writes lib/game/data/cast-timing.ts with a
// per-clip `castFrac` (fraction of the clip that is the cast) so the engine can
// land each bolt exactly as the cast ends: flight = clipDuration * castFrac.
//
// Why offline (not in the browser at runtime): reading a clip's PCM samples from
// a cross-origin wiki URL needs permissive CORS (the buffer would be tainted
// otherwise), and the game is a static export to GitHub Pages with no proxy to
// add those headers. Measuring once here sidesteps both, costs nothing at run
// time, and lets you hand-tweak any outlier in the generated table.
//
// Run: npm run analyze:sounds

import { MPEGDecoder } from 'mpg123-decoder';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Mirrors the cast-clip keys the engine looks up (lib/game/core/sound.ts) and the
// wiki file names in lib/game/assets.ts. Levels 1..4 → spell tier (index 0..3).
const ELEMENTS = { air: 'Wind', water: 'Water', earth: 'Earth', fire: 'Fire' };
const ELEM_TIER = ['Strike', 'Bolt', 'Blast', 'Wave'];
const ANCIENTS = { ice: 'Ice', blood: 'Blood', shadow: 'Shadow', smoke: 'Smoke' };
const ANC_TIER = ['Rush', 'Burst', 'Blitz', 'Barrage'];

const transcoded = (name) =>
  `https://oldschool.runescape.wiki/images/transcoded/${name}.ogg/${name}.ogg.mp3`;

/** @type {{ key: string; url: string }[]} */
const clips = [];
for (const [el, word] of Object.entries(ELEMENTS))
  for (let lvl = 1; lvl <= 4; lvl++)
    clips.push({ key: `cast_${el}_${lvl}`, url: transcoded(`${word}_${ELEM_TIER[lvl - 1]}`) });
for (const [an, word] of Object.entries(ANCIENTS))
  for (let lvl = 1; lvl <= 4; lvl++)
    clips.push({ key: `cast_${an}_${lvl}`, url: transcoded(`${word}_${ANC_TIER[lvl - 1]}`) });

// Smoke_Barrage is published as a plain .ogg (no transcoded mp3), which this
// MP3-only decoder can't read — let the engine fall back to DEFAULT_CAST_FRAC.
const SKIP = new Set(['cast_smoke_4']);

/**
 * Find the cast→hit boundary, returned as an absolute time (seconds) so trailing
 * silence in the clip can't skew it (these wiki clips are padded well past the
 * real audio). Steps: build an RMS envelope, trim leading/trailing silence to the
 * actual content, then take the strongest positive-flux frame (a sharp energy
 * rise = the impact transient) in the content *after* the initial cast attack.
 */
const SILENCE = 0.08; // normalised RMS below this counts as silence

function analyze(channelData, sampleRate) {
  const ch = channelData.length;
  const n = channelData[0].length;
  if (!n) return null;
  const mono = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const d = channelData[c];
    for (let i = 0; i < n; i++) mono[i] += d[i] / ch;
  }
  const dur = n / sampleRate;

  const hop = Math.max(1, Math.round(sampleRate * 0.005)); // 5ms RMS frames
  const frames = Math.floor(n / hop);
  if (frames < 4) return null;
  const env = new Float32Array(frames);
  let peak = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * hop;
    for (let i = 0; i < hop; i++) { const s = mono[start + i]; sum += s * s; }
    env[f] = Math.sqrt(sum / hop);
    if (env[f] > peak) peak = env[f];
  }
  if (peak === 0) return null;
  for (let f = 0; f < frames; f++) env[f] /= peak; // normalise 0..1

  // Trim to the actual content (ignore padded silence at both ends).
  let cStart = 0;
  while (cStart < frames && env[cStart] < SILENCE) cStart++;
  let cEnd = frames - 1;
  while (cEnd > cStart && env[cEnd] < SILENCE) cEnd--;
  if (cEnd - cStart < 3) return null;
  const contentEnd = (cEnd * hop) / sampleRate;

  // Positive energy flux = onset strength.
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, env[f] - env[f - 1]);

  // Skip the cast's own opening attack, then hunt the impact transient within
  // the content. lo = a bit past the cast onset; hi = end of content.
  const span = cEnd - cStart;
  const lo = cStart + Math.max(3, Math.floor(span * 0.15));
  const hi = cEnd;
  let best = -1, bestVal = 0, fluxSum = 0, fluxCount = 0;
  for (let f = lo; f <= hi; f++) {
    fluxSum += flux[f];
    fluxCount++;
    if (flux[f] > bestVal) { bestVal = flux[f]; best = f; }
  }
  const meanFlux = fluxCount ? fluxSum / fluxCount : 0;
  // How much the chosen transient stands out from the average — low ⇒ no clear
  // hit (continuous clip); the result should be reviewed / left to the fallback.
  const confidence = meanFlux > 0 ? bestVal / meanFlux : 0;

  let castEnd = best >= 0 ? (best * hop) / sampleRate : contentEnd * (1 - 1 / 4.5);
  castEnd = Math.min(Math.max(castEnd, 0.1), dur); // never negative / past the clip
  return { dur, contentEnd, castEnd, confidence };
}

const MIN_CONFIDENCE = 3; // below this, treat the detection as unreliable

async function main() {
  const decoder = new MPEGDecoder();
  await decoder.ready;

  /** @type {Record<string, number>} */
  const castEnds = {};
  const rows = [];
  for (const { key, url } of clips) {
    if (SKIP.has(key)) { rows.push([key, '—', '—', '—', 'skip (ogg)']); continue; }
    try {
      const res = await fetch(url);
      if (!res.ok) { rows.push([key, '—', '—', '—', `HTTP ${res.status}`]); continue; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      await decoder.reset();
      const { channelData, sampleRate } = decoder.decode(bytes);
      const a = analyze(channelData, sampleRate);
      if (!a) { rows.push([key, '—', '—', '—', 'no audio']); continue; }
      const castEnd = Math.round(a.castEnd * 1000) / 1000;
      const ok = a.confidence >= MIN_CONFIDENCE;
      if (ok) castEnds[key] = castEnd; // unreliable ones omitted → engine uses the default
      rows.push([
        key, a.dur.toFixed(3), a.contentEnd.toFixed(3), castEnd.toFixed(3),
        `conf ${a.confidence.toFixed(1)}${ok ? '' : ' ⚠ review'}`,
      ]);
    } catch (e) {
      rows.push([key, '—', '—', '—', `ERR ${e.message}`]);
    }
  }
  decoder.free();

  // Console report.
  const head = ['key', 'dur(s)', 'content', 'castEnd', 'note'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const fmt = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log(fmt(head));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(fmt(r));
  console.log(`\nMeasured ${Object.keys(castEnds).length}/${clips.length} clips (others fall back to DEFAULT_CAST_FRAC).`);

  // Emit the typed data table.
  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, '..', 'lib', 'game', 'data', 'cast-timing.ts');
  const entries = Object.keys(castEnds).sort().map(k => `  '${k}': ${castEnds[k]},`).join('\n');
  const file = `// AUTO-GENERATED by scripts/analyze-cast-clips.mjs — do not edit by hand.
// Re-run with \`npm run analyze:sounds\` after changing the cast clips.
//
// Each wizard cast clip is a single file containing both the spell's cast and its
// impact sfx. This maps a cast-clip sound key to the absolute time (seconds) of
// the cast→hit boundary, measured by detecting the impact transient offline. The
// engine times the projectile so it lands right then: flight = min(castEnd, dur).
// Absolute seconds (not a fraction) so the clips' trailing silence can't skew it.
export const CAST_END: Record<string, number> = {
${entries}
};

/** Fallback fraction for clips without a reliable measurement (≈ the old \`dur - dur/4.5\`). */
export const DEFAULT_CAST_FRAC = 1 - 1 / 4.5;
`;
  writeFileSync(out, file);
  console.log(`Wrote ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
