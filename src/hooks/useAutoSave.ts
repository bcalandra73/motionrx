import { useState, useEffect } from 'react';
import type { AutoSaveState } from '../types';
import { loadAutoSave, saveAutoSave, clearAutoSave } from '../api/storage';

export function useAutoSave() {
  const [pending, setPending] = useState<AutoSaveState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const state = loadAutoSave();
    if (state) setPending(state);
  }, []);

  function save(state: AutoSaveState) {
    saveAutoSave(state);
  }

  function dismiss() {
    clearAutoSave();
    setPending(null);
    setDismissed(true);
  }

  const bannerVisible = !!pending && !dismissed;

  return { pending, bannerVisible, save, dismiss };
}
