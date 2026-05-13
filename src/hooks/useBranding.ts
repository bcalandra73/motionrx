import { useState, useEffect } from 'react';
import type { Branding } from '../types';
import { loadBranding, saveBranding } from '../api/storage';

const defaultBranding: Branding = {
  practice: '',
  clinician: '',
  address: '',
  contact: '',
};

export function useBranding() {
  const [branding, setBranding] = useState<Branding>(defaultBranding);

  useEffect(() => {
    const stored = loadBranding();
    if (stored) setBranding(stored);
  }, []);

  function setField<K extends keyof Branding>(key: K, value: string) {
    setBranding(prev => {
      const next = { ...prev, [key]: value };
      saveBranding(next);
      return next;
    });
  }

  return { branding, setField };
}
