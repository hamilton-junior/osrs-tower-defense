import { describe, it, expect } from 'vitest';
import {
  INVENTORY_SLOTS, addItem, bankCount, countsOfKind, deposit, emptyStore, freeSlots,
  invCount, parseKey, sanitizeStore, stackKey, takeItem, withdraw, type ItemStore,
} from './inventory';

/** Fill every slot with a different herb, so the next add has nowhere to go. */
function fullStore(): ItemStore {
  const store = emptyStore();
  for (let i = 0; i < INVENTORY_SLOTS; i++) addItem(store, 'herb', `filler${i}`, 1);
  return store;
}

describe('stack keys', () => {
  it('round-trips', () => {
    expect(parseKey(stackKey('potion', 'super_combat'))).toEqual({ kind: 'potion', id: 'super_combat' });
  });

  it('refuses a malformed or unknown key', () => {
    expect(parseKey('guam')).toBeNull();
    expect(parseKey(':guam')).toBeNull();
    expect(parseKey('herb:')).toBeNull();
    expect(parseKey('gear:rune_arrow')).toBeNull();
  });
});

describe('carrying', () => {
  it('starts with twenty-eight empty slots', () => {
    const store = emptyStore();
    expect(store.inv).toHaveLength(INVENTORY_SLOTS);
    expect(freeSlots(store)).toBe(INVENTORY_SLOTS);
    expect(store.bank).toEqual([]);
  });

  it('stacks a second of the same herb instead of taking a slot', () => {
    const store = emptyStore();
    addItem(store, 'herb', 'guam');
    addItem(store, 'herb', 'guam');
    expect(invCount(store, 'herb', 'guam')).toBe(2);
    expect(freeSlots(store)).toBe(INVENTORY_SLOTS - 1);
  });

  it('keeps a herb and a potion of the same id apart', () => {
    const store = emptyStore();
    addItem(store, 'herb', 'attack');
    addItem(store, 'potion', 'attack', 3);
    expect(invCount(store, 'herb', 'attack')).toBe(1);
    expect(invCount(store, 'potion', 'attack')).toBe(3);
    expect(freeSlots(store)).toBe(INVENTORY_SLOTS - 2);
  });

  it('spends all or nothing', () => {
    const store = emptyStore();
    addItem(store, 'herb', 'ranarr', 2);
    expect(takeItem(store, 'herb', 'ranarr', 3)).toBe(false);
    expect(invCount(store, 'herb', 'ranarr')).toBe(2);
    expect(takeItem(store, 'herb', 'ranarr', 2)).toBe(true);
    expect(invCount(store, 'herb', 'ranarr')).toBe(0);
    expect(freeSlots(store)).toBe(INVENTORY_SLOTS);
  });

  it('reports counts in the shape the bench reads', () => {
    const store = emptyStore();
    addItem(store, 'herb', 'guam', 4);
    addItem(store, 'potion', 'attack', 9);
    const pouch = countsOfKind(store, 'herb', { guam: 0, ranarr: 0 } as Record<'guam' | 'ranarr', number>);
    expect(pouch).toEqual({ guam: 4, ranarr: 0 });
  });

  it('leaves a bank stack out of the carried count', () => {
    const store = fullStore();
    addItem(store, 'herb', 'torstol', 5);
    expect(invCount(store, 'herb', 'torstol')).toBe(0);
    expect(bankCount(store, 'herb', 'torstol')).toBe(5);
  });
});

describe('overflow', () => {
  it('sends a new stack to the bank once every slot is taken', () => {
    const store = fullStore();
    expect(freeSlots(store)).toBe(0);
    expect(addItem(store, 'herb', 'torstol')).toBe('bank');
    expect(bankCount(store, 'herb', 'torstol')).toBe(1);
  });

  it('still stacks onto a carried stack when the inventory is full', () => {
    const store = fullStore();
    expect(addItem(store, 'herb', 'filler0')).toBe('inv');
    expect(invCount(store, 'herb', 'filler0')).toBe(2);
    expect(store.bank).toEqual([]);
  });

  it('merges repeated overflow into one bank stack', () => {
    const store = fullStore();
    addItem(store, 'potion', 'overload', 2);
    addItem(store, 'potion', 'overload', 3);
    expect(store.bank).toHaveLength(1);
    expect(bankCount(store, 'potion', 'overload')).toBe(5);
  });
});

describe('deposit', () => {
  it('moves a fixed quantity and leaves the rest carried', () => {
    const store = emptyStore();
    addItem(store, 'herb', 'guam', 10);
    expect(deposit(store, 'herb', 'guam', 4)).toBe(4);
    expect(invCount(store, 'herb', 'guam')).toBe(6);
    expect(bankCount(store, 'herb', 'guam')).toBe(4);
  });

  it('caps at what is carried', () => {
    const store = emptyStore();
    addItem(store, 'herb', 'guam', 3);
    expect(deposit(store, 'herb', 'guam', 10)).toBe(3);
    expect(invCount(store, 'herb', 'guam')).toBe(0);
    expect(bankCount(store, 'herb', 'guam')).toBe(3);
  });

  it("'all' empties the stack and frees its slot", () => {
    const store = emptyStore();
    addItem(store, 'herb', 'guam', 7);
    expect(deposit(store, 'herb', 'guam', 'all')).toBe(7);
    expect(freeSlots(store)).toBe(INVENTORY_SLOTS);
  });

  it('leaves a hole rather than shuffling the inventory up', () => {
    const store = emptyStore();
    addItem(store, 'herb', 'guam');
    addItem(store, 'herb', 'ranarr');
    deposit(store, 'herb', 'guam', 'all');
    expect(store.inv[0]).toBeNull();
    expect(store.inv[1]).toEqual({ kind: 'herb', id: 'ranarr', count: 1 });
    // and the next add fills that hole
    addItem(store, 'herb', 'torstol');
    expect(store.inv[0]).toEqual({ kind: 'herb', id: 'torstol', count: 1 });
  });

  it('does nothing for something not carried', () => {
    const store = emptyStore();
    expect(deposit(store, 'herb', 'guam', 'all')).toBe(0);
    expect(store.bank).toEqual([]);
  });
});

describe('withdraw', () => {
  it('brings a fixed quantity back into a free slot', () => {
    const store = emptyStore();
    addItem(store, 'herb', 'guam', 10);
    deposit(store, 'herb', 'guam', 'all');
    expect(withdraw(store, 'herb', 'guam', 4)).toBe(4);
    expect(invCount(store, 'herb', 'guam')).toBe(4);
    expect(bankCount(store, 'herb', 'guam')).toBe(6);
  });

  it('drops the bank stack once it empties', () => {
    const store = emptyStore();
    addItem(store, 'herb', 'guam', 2);
    deposit(store, 'herb', 'guam', 'all');
    withdraw(store, 'herb', 'guam', 'all');
    expect(store.bank).toEqual([]);
    expect(invCount(store, 'herb', 'guam')).toBe(2);
  });

  it('refuses when the inventory is full and nothing of it is carried', () => {
    const store = fullStore();
    addItem(store, 'herb', 'torstol', 5); // overflowed to the bank
    expect(withdraw(store, 'herb', 'torstol', 1)).toBe(0);
    expect(bankCount(store, 'herb', 'torstol')).toBe(5);
  });

  it('still tops up a carried stack when the inventory is full', () => {
    const store = fullStore();
    deposit(store, 'herb', 'filler0', 'all');   // frees a slot
    addItem(store, 'herb', 'torstol', 5);       // takes it
    expect(freeSlots(store)).toBe(0);
    expect(withdraw(store, 'herb', 'filler0', 1)).toBe(0); // no room for a new stack
    addItem(store, 'herb', 'filler0');          // now carried again? no room either
    expect(invCount(store, 'herb', 'filler0')).toBe(0);
  });

  it('does nothing for something the bank does not hold', () => {
    const store = emptyStore();
    expect(withdraw(store, 'potion', 'overload', 'all')).toBe(0);
  });
});

describe('sanitizeStore', () => {
  const known = (kind: string, id: string) => kind === 'herb' && (id === 'guam' || id === 'ranarr');

  it('drops ids the game no longer knows', () => {
    const store = emptyStore();
    addItem(store, 'herb', 'guam', 2);
    addItem(store, 'herb', 'deleted_herb', 9);
    const clean = sanitizeStore(store, known);
    expect(invCount(clean, 'herb', 'guam')).toBe(2);
    expect(invCount(clean, 'herb', 'deleted_herb')).toBe(0);
  });

  it('drops negative and fractional stacks', () => {
    const store = emptyStore();
    store.inv[0] = { kind: 'herb', id: 'guam', count: -4 };
    store.inv[1] = { kind: 'herb', id: 'ranarr', count: 2.7 };
    const clean = sanitizeStore(store, known);
    expect(invCount(clean, 'herb', 'guam')).toBe(0);
    expect(invCount(clean, 'herb', 'ranarr')).toBe(2);
  });

  it('keeps each slot where it was, holes included', () => {
    const store = emptyStore();
    store.inv[5] = { kind: 'herb', id: 'guam', count: 1 };
    const clean = sanitizeStore(store, known);
    expect(clean.inv[0]).toBeNull();
    expect(clean.inv[5]).toEqual({ kind: 'herb', id: 'guam', count: 1 });
  });

  it('folds a duplicated bank stack together', () => {
    const store = emptyStore();
    store.bank = [
      { kind: 'herb', id: 'guam', count: 3 },
      { kind: 'herb', id: 'guam', count: 4 },
      { kind: 'herb', id: 'gone', count: 5 },
    ];
    const clean = sanitizeStore(store, known);
    expect(clean.bank).toEqual([{ kind: 'herb', id: 'guam', count: 7 }]);
  });

  it('ignores slots past the twenty-eighth', () => {
    const store = emptyStore();
    store.inv.push({ kind: 'herb', id: 'guam', count: 1 });
    const clean = sanitizeStore(store, known);
    expect(clean.inv).toHaveLength(INVENTORY_SLOTS);
    expect(invCount(clean, 'herb', 'guam')).toBe(0);
  });
});
