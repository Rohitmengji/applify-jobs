import type { ProfileKey } from './profile.schema';

// IMPLEMENTATION.md §8 — shared engine + message types.

export type FieldKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'textarea'
  | 'select-native'
  | 'select-custom'
  | 'checkbox'
  | 'radio-group'
  | 'file'
  | 'date'
  | 'unknown';

export interface FieldSignals {
  label: string; // best human-readable label text
  name: string;
  id: string;
  placeholder: string;
  ariaLabel: string;
  autocomplete: string; // the HTML autocomplete attribute, if any
  nearbyText: string; // visible text immediately preceding the control
  required: boolean;
  options?: string[]; // for selects / radio groups / custom dropdowns
}

export type FillSource = 'adapter' | 'heuristic' | 'answerBank' | 'llm' | 'manual' | 'none';

export interface DetectedField {
  uid: string; // stable id assigned at detection (data-oca-uid on the el)
  kind: FieldKind;
  signals: FieldSignals;
  mappedKey: ProfileKey | null;
  confidence: number; // 0..1
  value: string | null; // resolved string value to fill (files handled separately)
  source: FillSource;
  filled: boolean;
  error?: string;
  /** Index of the frame this field was detected in (0 = top frame). */
  frameId?: number;
}

export type WizardStatus =
  | { phase: 'idle' }
  | { phase: 'detecting' }
  | { phase: 'ready'; step: number; totalSteps?: number }
  | { phase: 'filling'; step: number }
  | { phase: 'review'; step: number }
  | { phase: 'error'; message: string };
