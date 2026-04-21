import { useState } from 'react';
import type { PatientFormData, MovementType, InjuredSide } from '../types';

const defaultForm: PatientFormData = {
  patientName: '',
  patientAge: '',
  diagnosis: '',
  movementType: '' as MovementType,
  patientHeight: '',
  heightUnit: 'in',
  injuredSide: '' as InjuredSide,
  clinicalNotes: '',
};

export function usePatientForm() {
  const [form, setForm] = useState<PatientFormData>(defaultForm);

  function setField<K extends keyof PatientFormData>(key: K, value: PatientFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function reset() {
    setForm(defaultForm);
  }

  function restore(partial: Partial<PatientFormData>) {
    setForm(prev => ({ ...prev, ...partial }));
  }

  const isRunning = /running|gait|walk/i.test(form.movementType);
  const isJump = /drop jump|countermovement jump|single-leg landing|tuck jump/i.test(form.movementType);
  const showTapeMarkers = isRunning || isJump;

  return { form, setField, reset, restore, isRunning, isJump, showTapeMarkers };
}
