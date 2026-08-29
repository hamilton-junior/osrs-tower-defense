/**
 * The config normaliser is the one place that knows a clip may be posed on a model
 * that isn't the enemy's own, so it is worth pinning: the plain-number form must
 * keep working untouched, and a malformed source must fail loudly at bake time
 * rather than silently baking the wrong mesh.
 *
 * These are build-time scripts, not app code, hence .mjs beside the module it
 * covers (see the `scripts/**` glob in vitest.config.ts).
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clipSource, animId, animIds, isAltModel, sourceLabel, altGltfName, readAnimConfig } from './anim-source.mjs';

describe('clipSource', () => {
  it('reads a bare sequence id as the enemy\'s own model', () => {
    expect(clipSource(1515)).toEqual({ anim: 1515 });
    expect(isAltModel(1515)).toBe(false);
    expect(sourceLabel(1515)).toBe('own model');
  });

  it('reads each borrowed-model form', () => {
    expect(clipSource({ anim: 1520, obj: 21125 })).toEqual({ anim: 1520, obj: 21125 });
    expect(clipSource({ anim: 1520, npc: 1543 })).toEqual({ anim: 1520, npc: 1543 });
    expect(clipSource({ anim: 1520, model: 5034 })).toEqual({ anim: 1520, model: 5034 });
    expect(isAltModel({ anim: 1520, obj: 21125 })).toBe(true);
    expect(sourceLabel({ anim: 1520, model: 5034 })).toBe('model 5034');
  });

  it('rejects a clip that names two models', () => {
    expect(() => clipSource({ anim: 1520, npc: 1543, obj: 21125 })).toThrow(/pick one/);
  });

  it('rejects a value that names no sequence', () => {
    expect(() => clipSource({ obj: 21125 })).toThrow(/bad clip source/);
    expect(() => clipSource('1520')).toThrow(/bad clip source/);
    expect(() => clipSource(null)).toThrow(/bad clip source/);
  });

  it('ignores non-numeric source keys rather than borrowing a bad model', () => {
    expect(clipSource({ anim: 1520, obj: '21125' })).toEqual({ anim: 1520 });
  });
});

describe('animId / animIds', () => {
  it('flattens both forms to the sequence id', () => {
    expect(animId(1515)).toBe(1515);
    expect(animId({ anim: 1520, obj: 21125 })).toBe(1520);
    expect(animIds({ walk: 1515, death: { anim: 1520, obj: 21125 } })).toEqual({ walk: 1515, death: 1520 });
    expect(animIds(undefined)).toEqual({});
  });
});

describe('altGltfName', () => {
  it('keeps the borrowed clip in its own file beside the enemy\'s', () => {
    expect(altGltfName('gargoyle', 'death')).toBe('gargoyle__death');
  });
});

describe('readAnimConfig', () => {
  const write = (data) => {
    const path = join(mkdtempSync(join(tmpdir(), 'anim-cfg-')), 'enemy-anims.config.json');
    writeFileSync(path, JSON.stringify(data));
    return path;
  };
  const config = {
    gargoyle: { npc: 412, anims: { walk: 1515, death: { anim: 1520, obj: 21125 } }, loop: { walk: true } },
    imp: { npc: 5, anims: { walk: 168 } },
  };

  it('hands every reader flat sequence ids, config untouched otherwise', () => {
    const out = readAnimConfig(write(config));
    expect(out.gargoyle).toEqual({ npc: 412, anims: { walk: 1515, death: 1520 }, loop: { walk: true } });
    expect(out.imp.anims).toEqual({ walk: 168 });
  });

  it('drops borrowed clips for renderers that can only pose the NPC\'s own mesh', () => {
    const out = readAnimConfig(write(config), { skipAlt: true });
    expect(out.gargoyle.anims).toEqual({ walk: 1515 });
    expect(out.imp.anims).toEqual({ walk: 168 });
  });

  it('survives an enemy with no anims block', () => {
    expect(readAnimConfig(write({ imp: { npc: 5 } })).imp.anims).toEqual({});
  });
});
