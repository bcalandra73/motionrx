import { useState } from 'react';
import type { RunningInputs, Assessment } from '../types';

const defaultInputs: RunningInputs = {
  treadmillSpeed: '',
  speedUnit: 'mph',
  treadmillIncline: '',
  runningSurface: 'treadmill',
  videoFps: 30,
  shoe: '',
  experience: '',
  includeFootwear: true,
};

export function useRunningInputs() {
  const [inputs, setInputs] = useState<RunningInputs>(defaultInputs);

  function setField<K extends keyof RunningInputs>(key: K, value: RunningInputs[K]) {
    setInputs(prev => ({ ...prev, [key]: value }));
  }

  function reset() {
    setInputs(defaultInputs);
  }

  function load(a: Assessment) {
    setInputs(a.running ?? defaultInputs);
  }

  function speedToMps(): number | null {
    const val = parseFloat(inputs.treadmillSpeed);
    if (isNaN(val) || val <= 0) return null;
    if (inputs.speedUnit === 'mps') return val;
    if (inputs.speedUnit === 'kph') return val / 3.6;
    return val * 0.44704; // mph → m/s
  }

  return { inputs, setField, reset, load, speedToMps };
}
