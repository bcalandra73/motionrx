import { useState } from 'react';
import type { JumpInputs } from '../types';

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

  return { inputs, setField, reset };
}
