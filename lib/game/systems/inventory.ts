/**
 * **The inventory and the bank** — where everything the player *carries* lives.
 *
 * Before this, each skill kept its own pile: a herb pouch for Farming, a shelf for
 * Herblore. Nothing capped either, so a long run ended with thirty stacks of
 * everything and no decision anywhere. OSRS answers that with twenty-eight slots
 * and a bank, and so does this: the inventory is the stock the run actually reads
 * from, and the bank is everything you own but did not bring.
 *
 * Three rules, all of them OSRS's:
 *
 * 1. **The inventory is the truth.** Brewing, drinking and every count the
 *    interface shows read the twenty-eight slots. A herb in the bank is a herb you
 *    left at home. Fourteen herbs plus twenty potions is thirty-four stacks against
 *    twenty-eight slots, so what to carry is a real question by the late run.
 * 2. **A full inventory sends the overflow to the bank.** Nothing is ever lost —
 *    a herb pulled with no room waits in the bank instead of falling on the floor.
 * 3. **A deposit leaves a hole.** OSRS does not shuffle the inventory up when a
 *    stack leaves it, and neither does this; an item added afterwards fills the
 *    first hole it finds.
 *
 * Everything here is arithmetic over plain objects: no engine, no React. The store
 * is mutated in place rather than rebuilt, because a harvest touches one slot and
 * the engine holds exactly one store.
 */

import type { SeedId } from '../data/farming';
import type { PotionId } from '../data/herblore';

/** OSRS's own number, and the whole point of the feature. */
export const INVENTORY_SLOTS = 28;

/** The two things that can sit in a slot today. Tower gear is deliberately absent:
 *  it lives in the looting bag, which is a different bag with a different job. */
export type StackKind = 'herb' | 'potion';

/** A stack of one thing. Herbs and potions both stack in OSRS, so a slot holds a
 *  count rather than one item — `id` is a {@link SeedId} for a herb and a
 *  {@link PotionId} for a potion, kept as a plain string here so this module stays
 *  ignorant of both tables. */
export interface Stack {
  kind: StackKind;
  id: string;
  count: number;
}

/** Everything the run owns: what is carried, and what is stored. */
export interface ItemStore {
  /** Exactly {@link INVENTORY_SLOTS} entries, `null` for an empty slot. */
  inv: (Stack | null)[];
  /** Unbounded, in the order stacks first reached it — OSRS's bank keeps its own
   *  order too, and a bank that re-sorted itself under the player would lose the
   *  one thing a bank is good at. */
  bank: Stack[];
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
  if ((kind !== 'herb' && kind !== 'potion') || !id) return null;
  return { kind, id };
}

export function emptyStore(): ItemStore {
  return { inv: Array.from({ length: INVENTORY_SLOTS }, () => null), bank: [] };
}

const same = (s: Stack | null, kind: StackKind, id: string): s is Stack =>
  !!s && s.kind === kind && s.id === id;

/** How many of one thing are *carried*. The only count the rest of the game reads. */
export function invCount(store: ItemStore, kind: StackKind, id: string): number {
  const slot = store.inv.find(s => same(s, kind, id));
  return slot ? slot.count : 0;
}

/** How many are in the bank. */
export function bankCount(store: ItemStore, kind: StackKind, id: string): number {
  const stack = store.bank.find(s => same(s, kind, id));
  return stack ? stack.count : 0;
}

/** Empty slots left. Zero is what sends an add to the bank. */
export function freeSlots(store: ItemStore): number {
  return store.inv.reduce((n, s) => n + (s ? 0 : 1), 0);
}

/**
 * Put `n` of something in. It joins a stack already carried, else takes the first
 * empty slot, else goes to the bank — which is the overflow rule, and the reason a
 * harvest can never be dropped for want of room.
 *
 * Returns where it landed, so the caller can say so.
 */
export function addItem(store: ItemStore, kind: StackKind, id: string, n = 1): 'inv' | 'bank' {
  if (n <= 0) return 'inv';
  const held = store.inv.find(s => same(s, kind, id));
  if (held) { held.count += n; return 'inv'; }
  const hole = store.inv.indexOf(null);
  if (hole >= 0) { store.inv[hole] = { kind, id, count: n }; return 'inv'; }
  const banked = store.bank.find(s => same(s, kind, id));
  if (banked) banked.count += n;
  else store.bank.push({ kind, id, count: n });
  return 'bank';
}

/**
 * Spend `n` out of the inventory. All or nothing: a brew that needs a herb it does
 * not carry must fail before it charges for the secondary, so a partial take would
 * be worse than none. Empties the slot when the stack runs out, leaving the hole.
 */
export function takeItem(store: ItemStore, kind: StackKind, id: string, n = 1): boolean {
  if (n <= 0) return true;
  const i = store.inv.findIndex(s => same(s, kind, id));
  if (i < 0 || store.inv[i]!.count < n) return false;
  const slot = store.inv[i]!;
  slot.count -= n;
  if (slot.count <= 0) store.inv[i] = null;
  return true;
}

/** A quantity a bank button asks for: OSRS's 1 / 5 / 10 / X, or the whole stack. */
export type MoveQty = number | 'all';

const wanted = (qty: MoveQty, have: number) =>
  qty === 'all' ? have : Math.max(0, Math.min(have, Math.floor(qty)));

/** Move carried stock into the bank. Returns how many actually moved. */
export function deposit(store: ItemStore, kind: StackKind, id: string, qty: MoveQty): number {
  const n = wanted(qty, invCount(store, kind, id));
  if (n <= 0) return 0;
  takeItem(store, kind, id, n);
  const banked = store.bank.find(s => same(s, kind, id));
  if (banked) banked.count += n;
  else store.bank.push({ kind, id, count: n });
  return n;
}

/**
 * Move stored stock back into the inventory. Capped by what the bank holds *and*
 * by room: with no free slot and no stack of this thing already carried, nothing
 * comes out — the same wall OSRS puts up, and the reason the bank is a loadout
 * decision rather than a second pocket.
 */
export function withdraw(store: ItemStore, kind: StackKind, id: string, qty: MoveQty): number {
  const i = store.bank.findIndex(s => same(s, kind, id));
  if (i < 0) return 0;
  const carried = store.inv.some(s => same(s, kind, id));
  if (!carried && freeSlots(store) < 1) return 0;
  const n = wanted(qty, store.bank[i].count);
  if (n <= 0) return 0;
  store.bank[i].count -= n;
  if (store.bank[i].count <= 0) store.bank.splice(i, 1);
  addItem(store, kind, id, n);
  return n;
}

/** Everything carried, as counts per id of one kind — the shape the older skill
 *  code reads (a `HerbPouch`, a `PotionStock`). Built fresh on each call, so a
 *  caller that needs it more than once should hold on to the result. */
export function countsOfKind<K extends SeedId | PotionId>(
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
 *  name a herb that was deleted, or carry a negative stack of one that was not. */
export function sanitizeStore(
  store: ItemStore, known: (kind: StackKind, id: string) => boolean,
): ItemStore {
  const clean = emptyStore();
  store.inv.slice(0, INVENTORY_SLOTS).forEach((s, i) => {
    if (!s || !known(s.kind, s.id)) return;
    const count = Math.floor(s.count);
    if (count > 0) clean.inv[i] = { kind: s.kind, id: s.id, count };
  });
  for (const s of store.bank) {
    if (!known(s.kind, s.id)) continue;
    const count = Math.floor(s.count);
    if (count > 0) {
      const held = clean.bank.find(b => same(b, s.kind, s.id));
      if (held) held.count += count;
      else clean.bank.push({ kind: s.kind, id: s.id, count });
    }
  }
  return clean;
}
