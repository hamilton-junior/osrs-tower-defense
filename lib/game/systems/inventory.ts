/**
 * **The inventory and the looting bag** — where everything the player *carries* lives.
 *
 * Before this, each skill kept its own pile: a herb pouch for Farming, a shelf for
 * Herblore. Nothing capped either, so a long run ended with thirty stacks of
 * everything and no decision anywhere. OSRS answers that with twenty-eight squares,
 * and so does this: twenty-seven of them are the stock the run actually reads from,
 * the twenty-eighth is the looting bag itself, and the bag holds everything that did
 * not fit.
 *
 * Three rules, all of them OSRS's:
 *
 * 1. **The inventory is the truth.** Brewing, drinking and every count the
 *    interface shows read the twenty-seven slots. A herb in the bag is a herb you
 *    left at home.
 * 2. **Nothing stacks in the inventory.** A herb is one slot and a potion is one
 *    slot, the way an unnoted item is in OSRS. Twenty-seven is therefore a real
 *    wall, and what to carry is a real question by the late run.
 * 3. **The overflow goes to the looting bag**, which is unbounded and *does* stack.
 *    Nothing is ever lost — an item pulled with no room waits in the bag instead of
 *    falling on the floor.
 *
 * A take leaves its hole where it was: OSRS does not shuffle the inventory up when
 * a slot empties, and neither does this; an item added afterwards fills the first
 * hole it finds.
 *
 * Everything here is arithmetic over plain objects: no engine, no React. The store
 * is mutated in place rather than rebuilt, because a harvest touches one slot and
 * the engine holds exactly one store.
 */

import type { SeedId } from '../data/farming';
import type { PotionId } from '../data/herblore';
import type { FishId } from '../data/fishing';

/** OSRS's own twenty-eight, less the square the looting bag itself sits in: the bag
 *  is an item in the backpack now, not a page beside it, so twenty-seven squares are
 *  left to carry with. */
export const INVENTORY_SLOTS = 27;

/** What a stack is. Herbs and potions come out of Farming and Herblore; food is
 *  the fish Fishing pulls out of the water, and the only stack that pays lives. */
export type StackKind = 'herb' | 'potion' | 'food';

/** A stack of one thing. In the inventory `count` is always 1 — nothing stacks
 *  there — and in the bag it is however many piled up. `id` is a {@link SeedId} for
 *  a herb and a {@link PotionId} for a potion, kept as a plain string here so this
 *  module stays ignorant of both tables. */
export interface Stack {
  kind: StackKind;
  id: string;
  count: number;
}

/** Everything the run owns: what is carried, and what the bag holds. */
export interface ItemStore {
  /** Exactly {@link INVENTORY_SLOTS} entries, `null` for an empty slot. Each filled
   *  slot is one item — a second herb of the same kind takes a second slot. */
  inv: (Stack | null)[];
  /** The looting bag's herbs and potions. Unbounded, stacking, in the order stacks
   *  first reached it — a bag that re-sorted itself under the player would lose the
   *  one thing a bag is good at. */
  bag: Stack[];
}

/** One address for a stack, so callers can pass a single string around the UI. */
export const stackKey = (kind: StackKind, id: string) => `${kind}:${id}`;

/** Split a {@link stackKey} back apart. Returns null on anything malformed, so a
 *  stale key out of React state can never name a stack that does not exist. */
export function parseKey(key: string): { kind: StackKind; id: string } | null {
  const cut = key.indexOf(':');
  if (cut < 1) return null;
  const kind = key.slice(0, cut);
  const id = key.slice(cut + 1);
  if ((kind !== 'herb' && kind !== 'potion' && kind !== 'food') || !id) return null;
  return { kind, id };
}

export function emptyStore(): ItemStore {
  return { inv: Array.from({ length: INVENTORY_SLOTS }, () => null), bag: [] };
}

const same = (s: Stack | null, kind: StackKind, id: string): s is Stack =>
  !!s && s.kind === kind && s.id === id;

/** How many of one thing are *carried*, counted across slots. The only count the
 *  rest of the game reads. */
export function invCount(store: ItemStore, kind: StackKind, id: string): number {
  return store.inv.reduce((n, s) => n + (same(s, kind, id) ? 1 : 0), 0);
}

/** How many of one thing the looting bag holds. */
export function bagCount(store: ItemStore, kind: StackKind, id: string): number {
  const stack = store.bag.find(s => same(s, kind, id));
  return stack ? stack.count : 0;
}

/** Empty slots left. Zero is what sends an add to the bag. */
export function freeSlots(store: ItemStore): number {
  return store.inv.reduce((n, s) => n + (s ? 0 : 1), 0);
}

/** Pile `n` of something into the bag, joining a stack already there. */
function pileInBag(store: ItemStore, kind: StackKind, id: string, n: number): void {
  const held = store.bag.find(s => same(s, kind, id));
  if (held) held.count += n;
  else store.bag.push({ kind, id, count: n });
}

/**
 * Put `n` of something in. Each unit takes its own empty slot; whatever is left
 * over once the slots run out piles into the looting bag — the overflow rule, and
 * the reason a harvest can never be dropped for want of room.
 *
 * Returns where the *last* unit landed, so the caller can say so: `'bag'` as soon
 * as any of it overflowed.
 */
export function addItem(store: ItemStore, kind: StackKind, id: string, n = 1): 'inv' | 'bag' {
  if (n <= 0) return 'inv';
  let left = n;
  for (let i = 0; i < store.inv.length && left > 0; i++) {
    if (store.inv[i] === null) { store.inv[i] = { kind, id, count: 1 }; left -= 1; }
  }
  if (left <= 0) return 'inv';
  pileInBag(store, kind, id, left);
  return 'bag';
}

/**
 * Spend `n` out of the inventory. All or nothing: a brew that needs a herb it does
 * not carry must fail before it charges for the secondary, so a partial take would
 * be worse than none. Empties each slot it takes, leaving the holes.
 */
export function takeItem(store: ItemStore, kind: StackKind, id: string, n = 1): boolean {
  if (n <= 0) return true;
  if (invCount(store, kind, id) < n) return false;
  let left = n;
  for (let i = 0; i < store.inv.length && left > 0; i++) {
    if (same(store.inv[i], kind, id)) { store.inv[i] = null; left -= 1; }
  }
  return true;
}

/** A quantity a bag button asks for: OSRS's 1 / 5 / 10 / X, or the whole stack. */
export type MoveQty = number | 'all';

const wanted = (qty: MoveQty, have: number) =>
  qty === 'all' ? have : Math.max(0, Math.min(have, Math.floor(qty)));

/** Move carried stock into the looting bag. Returns how many actually moved. */
export function toBag(store: ItemStore, kind: StackKind, id: string, qty: MoveQty): number {
  const n = wanted(qty, invCount(store, kind, id));
  if (n <= 0) return 0;
  takeItem(store, kind, id, n);
  pileInBag(store, kind, id, n);
  return n;
}

/**
 * Move stored stock back into the inventory. Capped by what the bag holds *and* by
 * room: one free slot per unit, because nothing stacks in the inventory. With no
 * free slot nothing comes out — the same wall OSRS puts up, and the reason the bag
 * is a loadout decision rather than a second pocket.
 */
export function toInv(store: ItemStore, kind: StackKind, id: string, qty: MoveQty): number {
  const i = store.bag.findIndex(s => same(s, kind, id));
  if (i < 0) return 0;
  const n = Math.min(wanted(qty, store.bag[i].count), freeSlots(store));
  if (n <= 0) return 0;
  store.bag[i].count -= n;
  if (store.bag[i].count <= 0) store.bag.splice(i, 1);
  addItem(store, kind, id, n);
  return n;
}

/** Everything carried, as counts per id of one kind — the shape the older skill
 *  code reads (a `HerbPouch`, a `PotionStock`). Built fresh on each call, so a
 *  caller that needs it more than once should hold on to the result. */
export function countsOfKind<K extends SeedId | PotionId | FishId>(
  store: ItemStore, kind: StackKind, base: Record<K, number>,
): Record<K, number> {
  const out = { ...base };
  for (const s of store.inv) {
    if (s && s.kind === kind && s.id in out) out[s.id as K] += s.count;
  }
  return out;
}

/** Drop stacks the game no longer knows about, and clamp the rest to whole
 *  non-negative counts. The load path's guard: a hand-edited save can otherwise
 *  name a herb that was deleted, or carry a negative stack of one that was not.
 *  An inventory slot is forced back to a single item, whatever the save claimed. */
export function sanitizeStore(
  store: ItemStore, known: (kind: StackKind, id: string) => boolean,
): ItemStore {
  const clean = emptyStore();
  store.inv.slice(0, INVENTORY_SLOTS).forEach((s, i) => {
    if (!s || !known(s.kind, s.id)) return;
    if (Math.floor(s.count) > 0) clean.inv[i] = { kind: s.kind, id: s.id, count: 1 };
  });
  for (const s of store.bag) {
    if (!known(s.kind, s.id)) continue;
    const count = Math.floor(s.count);
    if (count > 0) pileInBag(clean, s.kind, s.id, count);
  }
  return clean;
}
