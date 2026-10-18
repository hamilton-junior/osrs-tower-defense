'use client';

import { useEffect, useState } from 'react';
import { barLayoutFor, type BarLayout } from '@/lib/game/systems/touch-input';

const COARSE = '(pointer: coarse)';

const coarseNow = () => typeof window !== 'undefined' && window.matchMedia(COARSE).matches;

/**
 * Whether the main pointer is a finger. A laptop with a touch screen still answers
 * no: its main pointer is the trackpad, and it keeps the mouse interface.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(coarseNow);
  useEffect(() => {
    const mq = window.matchMedia(COARSE);
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return coarse;
}

const screenNow = (coarse: boolean) => typeof window === 'undefined'
  ? { width: Infinity, height: Infinity, coarse }
  : { width: window.innerWidth, height: window.innerHeight, coarse };

/**
 * Which bottom bar this screen gets (`barLayoutFor`). Held as the layout rather
 * than the window size, so dragging a desktop window re-renders the game only when
 * it crosses a line, not on every pixel.
 */
export function useBarLayout(coarse: boolean): BarLayout {
  const [layout, setLayout] = useState<BarLayout>(() => barLayoutFor(screenNow(coarse)));
  useEffect(() => {
    const sync = () => setLayout(barLayoutFor(screenNow(coarse)));
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [coarse]);
  return layout;
}
