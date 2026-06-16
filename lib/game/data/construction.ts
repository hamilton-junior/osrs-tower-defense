/**
 * Player-Owned House (POH) construction upgrades used by
 * `GameEngine.buildUpgrade`. Building one requires the Construction `levelReq`
 * and consumes `materials` (id → amount); several also grant passive bonuses
 * elsewhere in the engine (e.g. `teak_shelves` boosts drop rates).
 */
export interface PohUpgrade {
  levelReq: number;
  xpReward: number;
  materials: { id: string; amount: number }[];
}

export const POH_UPGRADES: Record<string, PohUpgrade> = {
  wooden_bed: { levelReq: 1, xpReward: 50, materials: [{ id: 'plank', amount: 3 }, { id: 'steel_nails', amount: 3 }] },
  oak_table: { levelReq: 22, xpReward: 150, materials: [{ id: 'oak_plank', amount: 4 }, { id: 'steel_nails', amount: 4 }] },
  teak_shelves: { levelReq: 45, xpReward: 400, materials: [{ id: 'teak_plank', amount: 3 }, { id: 'steel_nails', amount: 6 }] },
  mahogany_portal: { levelReq: 65, xpReward: 1000, materials: [{ id: 'mahogany_plank', amount: 5 }, { id: 'law_rune', amount: 10 }] },
};
