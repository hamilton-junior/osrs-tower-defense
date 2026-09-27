/**
 * The GameVal name reader decides which configured clips the audit flags, so its
 * word matching is pinned against real names out of the roster: the compound tokens
 * (`human_unarmedblock`), the trailing qualifiers (`spider_update_defend_large`), and
 * the names that say nothing and must stay silent (`flip`, `lizard_cleric_heal`).
 */
import { describe, it, expect } from 'vitest';
import { nameRole, nameClash, nameFamily, nameAffinity, inFamily } from './anim-names.mjs';

describe('nameRole', () => {
  it.each([
    ['human_unarmedblock', 'block'],
    ['human_halberdwalk_f', 'walk'],
    ['human_transdeath', 'death'],
    ['human_staffready', 'stand'],
    ['cave_slime_walks', 'walk'],
    ['corpbeast_walking', 'walk'],
    ['bat_rework_flying', 'walk'],
    ['gargoyle_fly', 'walk'],
    ['demons_parry', 'block'],
    ['slayer_harpie_hit', 'block'],
    ['spider_update_defend_large', 'block'],
    ['zombie_update_attack_normal', 'attack'],
    ['dragon_firebreath_all_attack', 'attack'],
    ['contact_offensive_spell', 'attack'],
    ['ds2_vorkath_stomp', 'attack'],
    ['gg_dusk_idle_defensive', 'stand'],
    ['cow_just_ready_update', 'stand'],
    ['cow_boss_despawn_lowprio', 'spawn'],
    ['mole_burrow_down', 'spawn'],
    ['npc_rat_boss_death_01', 'death'],
  ])('%s reads as %s', (name, role) => {
    expect(nameRole(name)).toBe(role);
  });

  it.each(['flip', 'snakeboss_sinkfast', 'lizard_cleric_heal', 'nex_spin_out', 'slayer_harpie_swarm'])(
    '%s names no role',
    (name) => {
      expect(nameRole(name)).toBeNull();
    },
  );

  it('matches short words only as a whole token', () => {
    expect(nameRole('white_knight')).toBeNull();
    expect(nameRole('rock_stable')).toBeNull();
    expect(nameRole('nex_run')).toBe('walk');
  });

  it('tolerates a missing name', () => {
    expect(nameRole(null)).toBeNull();
    expect(nameRole(undefined)).toBeNull();
  });
});

describe('nameClash', () => {
  it('flags a clip whose name reads as a different role', () => {
    expect(nameClash('hurt', 'mole_attack')).toEqual({ expected: 'block', actual: 'attack' });
    expect(nameClash('hurt', 'cow_boss_despawn_lowprio')).toEqual({ expected: 'block', actual: 'spawn' });
    expect(nameClash('death', 'demon_block')).toEqual({ expected: 'death', actual: 'block' });
  });

  it('stays silent when the name agrees, says nothing, or the clip has no expected role', () => {
    expect(nameClash('hurt', 'dog_update_jackal_defend')).toBeNull();
    expect(nameClash('hurt', 'lizard_cleric_heal')).toBeNull();
    expect(nameClash('death', 'snakeboss_sinkfast')).toBeNull();
    expect(nameClash('burrow', 'mole_burrow_down')).toBeNull();
    expect(nameClash('rage', 'cow_boss_heavy_breath')).toBeNull();
    expect(nameClash('hurt', null)).toBeNull();
  });
});

describe('nameFamily', () => {
  it('is the shared prefix of the stand and walk names, cut before the role word', () => {
    expect(nameFamily('cow_boss_idle', 'cow_boss_walk')).toBe('cow_boss');
    expect(nameFamily('npc_rat_boss_idle_01', 'npc_rat_boss_walk_01')).toBe('npc_rat_boss');
    expect(nameFamily('gg_dusk_idle_defensive', 'gg_dusk_walk_defensive')).toBe('gg_dusk');
  });

  it('handles an NPC whose stand and walk are one clip, or that has only one of them', () => {
    expect(nameFamily('gargoyle_marble_walk', 'gargoyle_marble_walk')).toBe('gargoyle_marble');
    expect(nameFamily('snakeboss_idle', null)).toBe('snakeboss');
    expect(nameFamily(null, null)).toBeNull();
  });

  it('ranks a tenant by the leading tokens its name shares', () => {
    expect(nameAffinity('dog_update_wolf_attack', 'dog_update_wolf_defend')).toBe(3);
    expect(nameAffinity('dog_update_wolf_attack', 'dog_update_godwars_defend')).toBe(2);
    expect(nameAffinity('contact_offensive_spell', 'human_unarmedblock')).toBe(0);
    expect(nameAffinity(null, 'mole_defend')).toBe(0);
  });

  it('matches whole tokens only', () => {
    expect(inFamily('cow_boss_defend', 'cow_boss')).toBe(true);
    expect(inFamily('cowboss_pet_emote', 'cow_boss')).toBe(false);
    expect(inFamily('cow_boss_defend', null)).toBe(false);
  });
});
