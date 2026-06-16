import { describe, it, expect, vi, afterEach } from 'vitest';
import type { FarmingPatch } from '../types';
import { FarmingSystem } from './farming-system';

// Minimal engine stub — FarmingSystem.update only calls these on the engine.
const mockEngine = () => ({ addMessage() {}, playSound() {}, onStateChange() {} }) as any;

const growingPatch = (over: Partial<FarmingPatch> = {}): FarmingPatch => ({
  id: 'p', x: 0, y: 0, type: 'allotment', seed: null, stage: 1, timer: 5, yield: 3, maxStage: 4, ...over,
});

afterEach(() => vi.restoreAllMocks());

describe('FarmingSystem.update', () => {
  it('advances a growing patch a stage when its timer elapses', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // never diseased
    const fs = new FarmingSystem(mockEngine());
    fs.patches = [growingPatch()];

    fs.update(5); // timer 5 -> 0

    expect(fs.patches[0].stage).toBe(2);
  });

  it('does not advance an unplanted (stage 0) patch', () => {
    const fs = new FarmingSystem(mockEngine());
    fs.patches = [growingPatch({ stage: 0 })];
    fs.update(100);
    expect(fs.patches[0].stage).toBe(0);
  });

  it('does not advance a diseased patch', () => {
    const fs = new FarmingSystem(mockEngine());
    fs.patches = [growingPatch({ diseased: true })];
    fs.update(100);
    expect(fs.patches[0].stage).toBe(1);
  });

  it('reaches the harvestable max stage over time', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const fs = new FarmingSystem(mockEngine());
    fs.patches = [growingPatch()];
    // Each elapsed timer advances one stage; drive well past maxStage.
    for (let i = 0; i < 10; i++) fs.update(100);
    expect(fs.patches[0].stage).toBe(4);
  });
});
