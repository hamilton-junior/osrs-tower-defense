import type { GameEngine } from '../core/engine';
import type { EnemyType, SlayerTask } from '../types';
import { ENEMIES } from '../data/enemies';
import {
  SLAYER_MASTERS, SLAYER_REWARDS, SLAYER_HELMET_BONUS, SLAYER_HELMET_IMBUED_BONUS,
  SLAYER_ESSENCE_YIELD, SLAYER_ESSENCE_SACK_YIELD, BIGGER_BADDER_CHANCE, SUPERIOR_OF,
  taskMonsterType,
  type SlayerReward,
} from '../data/slayer';
import { ASSETS } from '../assets';
import { rollSlayerTask, slayerCompletionGold } from './slayer';

/** Icon shown on Slayer-related notifications. */
const SLAYER_ICON = ASSETS.misc.slayer_crossbow;

/**
 * Slayer subsystem for the new core: owns the current task, accumulated Slayer
 * points and the completion streak. The engine reports kills via
 * {@link recordKill}; the UI requests a new task via {@link assignTask}. Reward
 * maths live in the pure `systems/slayer` module so they stay tested; this class
 * just orchestrates state and pushes updates through the engine (`this.e`).
 */
export class SlayerSystem {
  task: SlayerTask | null = null;
  points = 0;
  /** Completed tasks in a row; raises both point and gold rewards. */
  streak = 0;
  /** Slayer Helmet bought this run — towers hit the task target harder. */
  helmet = false;
  /** The helm has been imbued: the on-task bonus is raised (it does not stack). */
  imbued = false;
  /** Bigger and Badder: a task kill can rise again as its Superior form. */
  biggerBadder = false;
  /** Monsters bought out of the rotation — never assigned again this run. */
  blocked: EnemyType[] = [];
  /** Monsters whose tasks come doubled from now on (Bracelet of slaughter). */
  extended: EnemyType[] = [];
  private lastTaskType: EnemyType | null = null;
  masterId = SLAYER_MASTERS[0].id;

  constructor(private e: GameEngine) {}

  /** Best master the player can use, using the wave count as a level proxy. */
  private currentMaster() {
    const usable = SLAYER_MASTERS.filter(m => m.levelReq <= this.e.wave);
    return usable[usable.length - 1] ?? SLAYER_MASTERS[0];
  }

  /** Display name of the master that would assign the next task. */
  get masterName(): string {
    return this.currentMaster().name;
  }

  /**
   * Ensure a task is assigned: rolls a new one from the current master, or
   * does nothing if one is already active (so it's safe to call on every wave
   * start). Tasks are assigned automatically — there is no manual "get task".
   */
  assignTask() {
    if (this.task) return;
    const master = this.currentMaster();
    this.masterId = master.id;
    const task = rollSlayerTask(master, {
      enemies: Object.values(ENEMIES),
      wave: this.e.wave,
      lastTaskType: this.lastTaskType,
      blockedEnemies: this.blocked,
      extendedTasks: this.extended,
      consecutiveTasks: this.streak,
      slayerRewardMultiplier: 1,
    });
    if (!task) {
      this.e.notify('No Slayer task available yet', SLAYER_ICON);
      return;
    }
    this.task = task;
    const name = ENEMIES[task.type]?.name ?? task.type;
    this.e.playSound('click');
    this.e.notify(`${master.name}: kill ${task.count} ${name}`, SLAYER_ICON);
  }

  /** Tally a kill toward the active task; completes and rewards it at zero. A
   *  Superior monster counts toward its base form's task (see {@link taskMonsterType}). */
  recordKill(type: EnemyType) {
    const task = this.task;
    if (!task || taskMonsterType(type) !== task.type) return;
    task.count -= 1;
    if (task.count > 0) {
      this.e.requestEmit();
      return;
    }
    // Task complete: award points + gold, bump the streak, then clear it. The
    // rewards still accrue (the system works); they're just not surfaced yet.
    const gold = slayerCompletionGold(task, this.e.wave, this.streak);
    this.points += task.reward;
    this.streak += 1;
    this.e.money += gold;
    this.e.goldEarned += gold;
    this.lastTaskType = task.type;
    this.task = null;
    this.e.playSound('wave');
    this.e.notify('Slayer task complete!', SLAYER_ICON);
  }

  /** Whether the shop should show `id` as already bought (a spent one-time unlock). */
  owns(id: SlayerReward['id']): boolean {
    if (id === 'helmet') return this.helmet;
    if (id === 'helmet_i') return this.imbued;
    if (id === 'bigger_badder') return this.biggerBadder;
    return false;
  }

  /** Tower-damage multiplier vs `type`: the Slayer Helmet's on-task bonus when
   *  owned and `type` is the current task target, else 1 (no effect). The imbue
   *  raises that bonus — it replaces it rather than stacking. */
  onTaskBonus(type: EnemyType): number {
    // A Superior of the task monster is still the task target, so the helm hits it
    // harder too (it counts toward the task — see {@link taskMonsterType}).
    if (!this.helmet || !this.task || taskMonsterType(type) !== this.task.type) return 1;
    return 1 + (this.imbued ? SLAYER_HELMET_IMBUED_BONUS : SLAYER_HELMET_BONUS);
  }

  /**
   * Whether a task kill of `type` should raise its Superior form — Bigger and
   * Badder, bought in the shop. Only on-task monsters that *have* a superior can,
   * and a superior's own death never chains into another.
   */
  rollSuperior(type: EnemyType, rng: () => number = Math.random): EnemyType | null {
    if (!this.biggerBadder || this.task?.type !== type) return null;
    const superior = SUPERIOR_OF[type];
    if (!superior) return null;
    return rng() < BIGGER_BADDER_CHANCE ? superior : null;
  }

  /**
   * Spend Slayer points in the rewards shop (UI button) — the sink for the points
   * the system accrues. Each purchase is gated on its own precondition (the imbue
   * needs the helm; blocking and extending need a task to act on) and refuses with
   * a notice rather than silently eating the points.
   */
  buyReward(id: SlayerReward['id']) {
    const def = SLAYER_REWARDS.find(r => r.id === id);
    if (!def) return;
    if (def.once && this.owns(id)) { this.e.notify(`You already own the ${def.name}`, SLAYER_ICON); return; }
    if (def.requires && !this.owns(def.requires)) {
      const need = SLAYER_REWARDS.find(r => r.id === def.requires);
      this.e.notify(`You need the ${need?.name ?? 'unlock'} first`, SLAYER_ICON);
      return;
    }
    if ((id === 'skip' || id === 'block' || id === 'extend') && !this.task) {
      this.e.notify('You have no task', SLAYER_ICON);
      return;
    }
    if (this.points < def.cost) { this.e.notify('Not enough Slayer points', SLAYER_ICON); return; }

    this.points -= def.cost;
    switch (id) {
      case 'helmet':
        this.helmet = true;
        this.e.notify('Slayer Helmet equipped', SLAYER_ICON);
        break;
      case 'helmet_i':
        this.imbued = true;
        this.e.notify(`Helm imbued — +${SLAYER_HELMET_IMBUED_BONUS * 100}% on task`, SLAYER_ICON);
        break;
      case 'bigger_badder':
        this.biggerBadder = true;
        this.e.notify('Superior monsters now stalk your tasks', SLAYER_ICON);
        break;
      case 'block': {
        // Blocking retires the monster for the run *and* drops the task it was on,
        // so the block is felt immediately rather than at the next assignment.
        const blocked = this.task!.type;
        if (!this.blocked.includes(blocked)) this.blocked.push(blocked);
        this.lastTaskType = blocked;
        this.task = null;
        this.e.notify(`${ENEMIES[blocked]?.name ?? blocked} blocked`, SLAYER_ICON);
        this.assignTask();
        break;
      }
      case 'extend': {
        // Double what is *left* (not the original total) and the payout with it, so
        // buying it late is worth less than buying it early — and remember the
        // monster, so its future tasks roll extended.
        const task = this.task!;
        task.count *= 2;
        task.total += task.count / 2;
        task.reward *= 2;
        if (!this.extended.includes(task.type)) this.extended.push(task.type);
        this.e.notify(`Task extended — ${task.count} left`, SLAYER_ICON);
        break;
      }
      case 'skip':
        this.lastTaskType = this.task?.type ?? this.lastTaskType; // don't re-roll the same monster
        this.task = null;
        this.assignTask(); // rolls + announces the replacement
        break;
      case 'essence':
        this.e.meta.award(SLAYER_ESSENCE_YIELD);
        break;
      case 'essence_sack':
        this.e.meta.award(SLAYER_ESSENCE_SACK_YIELD);
        break;
    }
    this.e.playSound('sell'); // OSRS shop chime
    this.e.requestEmit();
  }

  reset() {
    this.task = null;
    this.points = 0;
    this.streak = 0;
    this.helmet = false;
    this.imbued = false;
    this.biggerBadder = false;
    this.blocked = [];
    this.extended = [];
    this.lastTaskType = null;
    this.masterId = SLAYER_MASTERS[0].id;
  }

  /** Snapshot for the in-progress-run save (see `systems/run-save`). */
  snapshot() {
    return {
      task: this.task ? { ...this.task } : null,
      points: this.points,
      streak: this.streak,
      helmet: this.helmet,
      imbued: this.imbued,
      biggerBadder: this.biggerBadder,
      blocked: [...this.blocked],
      extended: [...this.extended],
      lastTaskType: this.lastTaskType,
      masterId: this.masterId,
    };
  }

  /** Restore a saved run's Slayer state. An unknown master id (a renamed master in
   *  a later patch) falls back to the first one rather than breaking the run, and
   *  the shop unlocks default to "not bought" so a save written before they existed
   *  still loads. */
  load(state: ReturnType<SlayerSystem['snapshot']>) {
    this.task = state.task ? { ...state.task } : null;
    this.points = state.points;
    this.streak = state.streak;
    this.helmet = state.helmet;
    this.imbued = state.imbued ?? false;
    this.biggerBadder = state.biggerBadder ?? false;
    this.blocked = [...(state.blocked ?? [])];
    this.extended = [...(state.extended ?? [])];
    this.lastTaskType = state.lastTaskType;
    this.masterId = SLAYER_MASTERS.some(m => m.id === state.masterId) ? state.masterId : SLAYER_MASTERS[0].id;
  }
}
