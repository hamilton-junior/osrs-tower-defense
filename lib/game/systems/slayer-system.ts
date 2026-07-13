import type { GameEngine } from '../core/engine';
import type { EnemyType, SlayerTask } from '../types';
import { ENEMIES } from '../data/enemies';
import { SLAYER_MASTERS, SLAYER_REWARDS, SLAYER_HELMET_BONUS, SLAYER_ESSENCE_YIELD, type SlayerReward } from '../data/slayer';
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
      blockedEnemies: [],
      extendedTasks: [],
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

  /** Tally a kill toward the active task; completes and rewards it at zero. */
  recordKill(type: EnemyType) {
    const task = this.task;
    if (!task || task.type !== type) return;
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

  /** Tower-damage multiplier vs `type`: the Slayer Helmet's on-task bonus when
   *  owned and `type` is the current task target, else 1 (no effect). */
  onTaskBonus(type: EnemyType): number {
    return this.helmet && this.task?.type === type ? 1 + SLAYER_HELMET_BONUS : 1;
  }

  /** Spend Slayer points in the rewards shop (UI button). The sink for the
   *  points the system accrues: a one-time on-task damage helm, a task skip,
   *  or trading points into permanent Rune Essence. */
  buyReward(id: SlayerReward['id']) {
    const def = SLAYER_REWARDS.find(r => r.id === id);
    if (!def) return;
    if (def.once && id === 'helmet' && this.helmet) { this.e.notify('You already own the Slayer Helmet', SLAYER_ICON); return; }
    if (id === 'skip' && !this.task) { this.e.notify('No task to skip', SLAYER_ICON); return; }
    if (this.points < def.cost) { this.e.notify('Not enough Slayer points', SLAYER_ICON); return; }

    this.points -= def.cost;
    if (id === 'helmet') {
      this.helmet = true;
      this.e.notify('Slayer Helmet equipped', SLAYER_ICON);
    } else if (id === 'skip') {
      this.lastTaskType = this.task?.type ?? this.lastTaskType; // don't re-roll the same monster
      this.task = null;
      this.assignTask(); // rolls + announces the replacement
    } else if (id === 'essence') {
      this.e.meta.award(SLAYER_ESSENCE_YIELD);
    }
    this.e.playSound('sell'); // OSRS shop chime
    this.e.requestEmit();
  }

  reset() {
    this.task = null;
    this.points = 0;
    this.streak = 0;
    this.helmet = false;
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
      lastTaskType: this.lastTaskType,
      masterId: this.masterId,
    };
  }

  /** Restore a saved run's Slayer state. An unknown master id (a renamed master in
   *  a later patch) falls back to the first one rather than breaking the run. */
  load(state: ReturnType<SlayerSystem['snapshot']>) {
    this.task = state.task ? { ...state.task } : null;
    this.points = state.points;
    this.streak = state.streak;
    this.helmet = state.helmet;
    this.lastTaskType = state.lastTaskType;
    this.masterId = SLAYER_MASTERS.some(m => m.id === state.masterId) ? state.masterId : SLAYER_MASTERS[0].id;
  }
}
