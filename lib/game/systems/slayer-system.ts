import type { GameEngine } from '../core/engine';
import type { EnemyType, SlayerTask } from '../types';
import { ENEMIES } from '../data/enemies';
import { SLAYER_MASTERS } from '../data/slayer';
import { rollSlayerTask, slayerCompletionGold } from './slayer';

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

  /** Roll a new task from the current master (no-op if one is already active). */
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
      this.e.notify('No Slayer task available yet');
      return;
    }
    this.task = task;
    const name = ENEMIES[task.type]?.name ?? task.type;
    this.e.playSound('click');
    this.e.notify(`${master.name}: kill ${task.count} ${name}`);
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
    // Task complete: award points + gold, bump the streak, then clear it.
    const gold = slayerCompletionGold(task, this.e.wave, this.streak);
    this.points += task.reward;
    this.streak += 1;
    this.e.money += gold;
    this.e.goldEarned += gold;
    this.lastTaskType = task.type;
    this.task = null;
    const name = ENEMIES[type]?.name ?? type;
    this.e.playSound('wave');
    this.e.notify(`Task complete! +${task.reward} pts, +${gold} gp (${name})`);
  }

  reset() {
    this.task = null;
    this.points = 0;
    this.streak = 0;
    this.lastTaskType = null;
    this.masterId = SLAYER_MASTERS[0].id;
  }
}
