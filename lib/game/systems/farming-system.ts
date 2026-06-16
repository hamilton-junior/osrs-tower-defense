import type { GameEngine } from '../engine';
import type { Item, FarmingPatch } from '../types';
import { ITEMS } from '../data/items';
import { diseaseChance, baseFarmYield } from './farming';

/**
 * Farming subsystem: owns the herb/allotment/flower patches and the
 * plant → grow → (disease) → harvest lifecycle. Reads shared engine state
 * (inventory, skills, pets) and emits UI updates through `this.e`.
 */
export class FarmingSystem {
  patches: FarmingPatch[] = [];

  constructor(private e: GameEngine) {}

  init() {
    this.patches = [
      { id: 'patch_1', x: 100, y: 100, type: 'allotment', seed: null, stage: 0, timer: 0, yield: 0, maxStage: 4 },
      { id: 'patch_2', x: 150, y: 100, type: 'allotment', seed: null, stage: 0, timer: 0, yield: 0, maxStage: 4 },
      { id: 'patch_3', x: 250, y: 150, type: 'herb', seed: null, stage: 0, timer: 0, yield: 0, maxStage: 4 },
      { id: 'patch_4', x: 700, y: 500, type: 'flower', seed: null, stage: 0, timer: 0, yield: 0, maxStage: 4 },
      { id: 'patch_5', x: 750, y: 500, type: 'herb', seed: null, stage: 0, timer: 0, yield: 0, maxStage: 4 },
    ];
  }

  update(dt: number) {
    this.patches.forEach(patch => {
      if (patch.stage > 0 && patch.stage < patch.maxStage && !patch.diseased) {
        patch.timer -= dt;
        if (patch.timer <= 0) {
          patch.stage++;
          
          // Disease chance on stage up
          if (patch.stage < patch.maxStage && Math.random() < diseaseChance(patch.compost)) {
            patch.diseased = true;
            this.e.addMessage(`A farming patch has become diseased!`);
            this.e.playSound('error');
          }
          
          // If not at max stage, reset timer for next stage
          if (patch.stage < patch.maxStage) {
            const seedItem = Object.values(ITEMS).find(i => i.id === patch.seed);
            if (seedItem && seedItem.growthTime) {
              patch.timer = seedItem.growthTime / patch.maxStage;
            } else {
              patch.timer = 10;
            }
          }

          if (patch.stage === patch.maxStage) {
             this.e.addMessage(`A farming patch is ready to harvest!`);
             this.e.playSound('level_up');
          }
          this.e.onStateChange({ farmingPatches: [...this.patches] });
        }
      }
    });
  }

  plantSeed(patchId: string, seedItem: Item) {
    const patch = this.patches.find(p => p.id === patchId);
    if (!patch || patch.stage !== 0) return;
    
    if (patch.type !== seedItem.seedType) {
      this.e.addMessage(`You can't plant ${seedItem.name} in this patch.`);
      return;
    }
    
    const baseSeedItem = Object.values(ITEMS).find(i => seedItem.id.startsWith(i.id));
    if (!baseSeedItem) return;

    patch.seed = baseSeedItem.id;
    patch.stage = 1;
    patch.timer = (baseSeedItem.growthTime || 30) / patch.maxStage;
    
    patch.yield = baseFarmYield(this.e.playerSkills.farming.level, patch.compost);
    
    const idx = this.e.inventory.findIndex(i => i.id === seedItem.id);
    if (idx > -1) {
      this.e.inventory.splice(idx, 1);
      this.e.onStateChange({ inventory: this.e.inventory });
    }
    
    this.e.addMessage(`You plant the ${seedItem.name}.`);
    this.e.playSound('inventory_move');
    this.e.onStateChange({ farmingPatches: [...this.patches] });
  }

  applyCompost(patchId: string, compostItem: Item) {
    const patch = this.patches.find(p => p.id === patchId);
    if (!patch || patch.stage !== 0 || patch.compost) return;

    const idx = this.e.inventory.findIndex(i => i.id === compostItem.id);
    if (idx > -1) {
      this.e.inventory.splice(idx, 1);
      const baseCompostId = compostItem.id.split('_')[0]; // compost, supercompost, ultracompost
      patch.compost = baseCompostId as 'compost' | 'supercompost' | 'ultracompost';
      this.e.addMessage(`You treat the patch with ${compostItem.name}.`);
      this.e.playSound('inventory_move');
      this.e.onStateChange({ inventory: this.e.inventory, farmingPatches: [...this.patches] });
    }
  }

  curePatch(patchId: string) {
    const patch = this.patches.find(p => p.id === patchId);
    if (!patch || !patch.diseased) return;

    const idx = this.e.inventory.findIndex(i => i.id.startsWith('plant_cure'));
    if (idx > -1) {
      this.e.inventory.splice(idx, 1);
      patch.diseased = false;
      this.e.addMessage('You cured the diseased patch.');
      this.e.playSound('inventory_move');
      this.e.onStateChange({ inventory: this.e.inventory, farmingPatches: [...this.patches] });
    }
  }

  harvestPatch(patchId: string) {
    const patch = this.patches.find(p => p.id === patchId);
    if (!patch || patch.stage !== patch.maxStage) return;
    
    const seedItem = Object.values(ITEMS).find(i => i.id === patch.seed);
    const xp = (seedItem?.bonus.xpBonus || 50) * (patch.yield / 3);
    this.e.awardPlayerXP('farming', xp, patch.x, patch.y);
    
    // Add harvested items
    const yieldItemId = seedItem?.harvestItem || 'grimy_guam';
    const yieldItem = ITEMS[yieldItemId];
    
    for(let i=0; i<patch.yield; i++) {
      if (yieldItem) {
        this.e.addItemToInventory(yieldItem);
      } else {
        // Fallback
        this.e.addItemToInventory({
          id: yieldItemId,
          name: yieldItemId.replace('_', ' '),
          description: 'A harvested crop.',
          type: 'herb',
          bonus: {},
          sellPrice: 100
        });
      }
    }
    
    // Tangleroot Pet Drop Chance
    if (Math.random() < 0.02) { // 2% chance per harvest
      if (!this.e.pets.find(p => p.name === 'Tangleroot')) {
        this.e.pets.push({ id: Math.random().toString(), name: 'Tangleroot', type: 'tangleroot', bonus: "Nature's Gift: +10% Rune Essence drops" });
        this.e.playSound('level_up');
        this.e.addMessage("You have a funny feeling you're being followed...");
      }
    }

    this.e.addMessage(`You harvested ${patch.yield} crops!`);
    this.e.playSound('pick_up');
    
    patch.seed = null;
    patch.stage = 0;
    patch.timer = 0;
    patch.yield = 0;
    patch.diseased = false;
    patch.compost = undefined;
    
    this.e.onStateChange({ 
      inventory: [...this.e.inventory],
      farmingPatches: [...this.patches]
    });
  }
}
