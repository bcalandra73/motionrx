import { useState } from 'react';
import type { LEFSData, ODIData, NPRSData, PSFSItem, Assessment } from '../types';

const LEFS_ITEMS = [
  'Any of your usual work, housework, or school activities',
  'Your usual hobbies, recreational or sporting activities',
  'Getting into or out of the bath',
  'Walking between rooms',
  'Putting on your shoes or socks',
  'Squatting',
  'Lifting an object from the floor',
  'Performing light activities around your home',
  'Performing heavy activities around your home',
  'Getting into or out of a car',
  'Walking 2 blocks',
  'Walking a mile',
  'Going up or down 10 stairs',
  'Standing for 1 hour',
  'Sitting for 1 hour',
  'Running on even ground',
  'Running on uneven ground',
  'Making sharp turns while running fast',
  'Hopping',
  'Rolling over in bed',
] as const;

export const LEFS_OPTIONS = ['Unable', 'Extreme', 'Quite a bit', 'Moderate', 'A little', 'No difficulty'] as const;
export const ODI_ITEMS = [
  { label: 'Pain Intensity', opts: ['No pain','Very mild','Moderate','Fairly severe','Very severe','Worst imaginable'] },
  { label: 'Personal Care',  opts: ['Normal, no extra pain','Normal, some extra pain','Slow, careful','Mostly independent','Need some help','Need full help'] },
  { label: 'Lifting',        opts: ['Heavy weights, no pain','Heavy with extra pain','Can lift but stays on floor','Too heavy to lift from floor','Only light objects','Cannot lift at all'] },
  { label: 'Walking',        opts: ['No pain any distance','Pain but > 1 mile','Pain limits to 0.5 mile','Pain limits to 100m','Only with walking aid','Mostly in bed'] },
  { label: 'Sitting',        opts: ['As long as I like, no pain','As long as I like, some pain','1 hour max','30 minutes max','10 minutes max','Sitting makes pain worse'] },
  { label: 'Standing',       opts: ['As long as I like, no pain','As long as I like, some pain','1 hour max','30 minutes max','10 minutes max','Standing makes pain worse'] },
] as const;

export { LEFS_ITEMS };

export function usePROMs() {
  const [lefsScores, setLefsScores] = useState<(number | null)[]>(Array(LEFS_ITEMS.length).fill(null));
  const [odiScores,  setOdiScores]  = useState<(number | null)[]>(Array(ODI_ITEMS.length).fill(null));
  const [nprs, setNprs] = useState<NPRSData>({ current: null, best: null, worst: null });

  function patchNprs(patch: Partial<NPRSData>) {
    setNprs(prev => ({ ...prev, ...patch }));
  }
  const [psfs, setPsfs] = useState<PSFSItem[]>([
    { activity: '', score: null },
    { activity: '', score: null },
    { activity: '', score: null },
  ]);
  // Injured vs uninjured LSI values (jump/hop tests)
  const [lsiInjured,   setLsiInjured]   = useState<string>('');
  const [lsiUninjured, setLsiUninjured] = useState<string>('');

  function setLefsScore(index: number, value: number | null) {
    setLefsScores(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function setOdiScore(index: number, value: number | null) {
    setOdiScores(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function setPsfsItem(index: number, patch: Partial<PSFSItem>) {
    setPsfs(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  const lefsTotal: number | null = (() => {
    const filled = lefsScores.filter(v => v !== null) as number[];
    return filled.length === LEFS_ITEMS.length ? filled.reduce((a, b) => a + b, 0) : null;
  })();

  const odiScore: number | null = (() => {
    const filled = odiScores.filter(v => v !== null) as number[];
    if (filled.length < ODI_ITEMS.length) return null;
    const sum = filled.reduce((a, b) => a + b, 0);
    return Math.round((sum / (ODI_ITEMS.length * 5)) * 100);
  })();

  const lsi: number | null = (() => {
    const inj  = parseFloat(lsiInjured);
    const uninj = parseFloat(lsiUninjured);
    if (isNaN(inj) || isNaN(uninj) || uninj === 0) return null;
    return Math.round((inj / uninj) * 100);
  })();

  function getLEFSData(): LEFSData {
    return { scores: lefsScores, total: lefsTotal };
  }

  function getODIData(): ODIData {
    return { scores: odiScores, total: odiScore };
  }

  function reset() {
    setLefsScores(Array(LEFS_ITEMS.length).fill(null));
    setOdiScores(Array(ODI_ITEMS.length).fill(null));
    setNprs({ current: null, best: null, worst: null });
    setPsfs([
      { activity: '', score: null },
      { activity: '', score: null },
      { activity: '', score: null },
    ]);
    setLsiInjured('');
    setLsiUninjured('');
  }

  function load(a: Assessment) {
    const p = a.proms;
    if (!p) { reset(); return; }
    if (p.nprs) setNprs(p.nprs);
    if (p.psfs) {
      // Pad to at least 3 slots
      const slots = [...p.psfs];
      while (slots.length < 3) slots.push({ activity: '', score: null });
      setPsfs(slots);
    }
    if (p.lefsScores) {
      const scores = [...p.lefsScores];
      while (scores.length < LEFS_ITEMS.length) scores.push(null);
      setLefsScores(scores.slice(0, LEFS_ITEMS.length));
    }
    if (p.odiScores) {
      const scores = [...p.odiScores];
      while (scores.length < ODI_ITEMS.length) scores.push(null);
      setOdiScores(scores.slice(0, ODI_ITEMS.length));
    }
    if (p.lsiInjured   != null) setLsiInjured(p.lsiInjured);
    if (p.lsiUninjured != null) setLsiUninjured(p.lsiUninjured);
  }

  return {
    lefsScores, lefsTotal, setLefsScore,
    odiScores, odiScore, setOdiScore,
    nprs, setNprs,
    psfs, setPsfsItem,
    lsiInjured, setLsiInjured,
    lsiUninjured, setLsiUninjured,
    lsi,
    getLEFSData, getODIData,
    patchNprs,
    reset, load,
  };
}
