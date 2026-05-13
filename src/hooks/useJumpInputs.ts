import { useState } from 'react';
import type { JumpInputs, Assessment } from '../types';

const defaultInputs: JumpInputs = {
  videoFps: 120,
  involvedLimb: '',
  protocol: '',
  timePostOp: '',
};

export function useJumpInputs() {
  const [inputs, setInputs] = useState<JumpInputs>(defaultInputs);

  function setField<K extends keyof JumpInputs>(key: K, value: JumpInputs[K]) {
    setInputs(prev => ({ ...prev, [key]: value }));
  }

  function reset() {
    setInputs(defaultInputs);
  }

  function load(a: Assessment) {
    setInputs(a.jump ?? defaultInputs);
  }

  return { inputs, setField, reset, load };
}
