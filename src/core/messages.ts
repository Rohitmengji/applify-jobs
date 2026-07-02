import type { DetectedField, WizardStatus } from './types';

// IMPLEMENTATION.md §10 — all cross-context communication is one typed union.

// --- side panel / background  →  content script -------------------------
export type ToContent =
  | { type: 'DETECT' } // detect fields on the current page
  | { type: 'FILL'; fields: ResolvedFill[] } // fill these values
  | { type: 'FILL_FILE'; uid: string; filename: string; mime: string; b64: string }
  | { type: 'FILL_AND_NEXT' } // fill current step + click Next (generic, no adapter needed)
  | { type: 'FILL_SECTIONS' } // fill repeatable Work Experience / Education sections
  | { type: 'GET_PAGE_INFO' } // extract company + role from the page
  | { type: 'WIZARD_NEXT' } // advance one step
  | { type: 'WIZARD_RUN' } // run to the review step
  | { type: 'PING' };

export interface ResolvedFill {
  uid: string;
  value: string;
}

// --- content script  →  side panel / background -------------------------
export type FromContent =
  | { type: 'DETECTED'; fields: DetectedField[]; adapterId: string | null; multiStep: boolean }
  | { type: 'STATUS'; status: WizardStatus }
  | { type: 'FIELD_FILLED'; uid: string; ok: boolean; error?: string }
  | { type: 'PAGE_INFO'; company: string; role: string; url: string; description?: string }
  | {
      type: 'SECTIONS_RESULT';
      experience: number; // rows actually filled
      education: number;
      expFound: boolean; // was a Work Experience section present on the page?
      eduFound: boolean;
    }
  | { type: 'PONG' };

// --- side panel  →  background (LLM work) -------------------------------
export type ToBackground =
  | { type: 'LLM_MAP_FIELDS'; unresolved: { uid: string; signals: unknown }[] }
  | { type: 'LLM_DRAFT_ANSWER'; uid: string; question: string }
  | { type: 'LLM_EXTRACT_RESUME'; text: string }
  | { type: 'LLM_COVER_LETTER'; company: string; role: string; description?: string }
  | { type: 'GET_PROFILE' };

export type FromBackground =
  | {
      type: 'LLM_MAP_RESULT';
      mappings: { uid: string; key: string | null; confidence: number }[];
    }
  | { type: 'LLM_DRAFT_RESULT'; uid: string; answer: string; source: 'answerBank' | 'llm' | 'none' }
  | { type: 'LLM_EXTRACT_RESULT'; data: unknown; error?: string } // raw JSON; validated at merge time
  | { type: 'LLM_COVER_LETTER_RESULT'; text: string; error?: string }
  | { type: 'PROFILE'; profile: unknown };

// Typed helpers -----------------------------------------------------------
export function sendToContent<R = FromContent>(tabId: number, msg: ToContent): Promise<R> {
  return chrome.tabs.sendMessage(tabId, msg) as Promise<R>;
}
export function sendToBackground<R = FromBackground>(msg: ToBackground): Promise<R> {
  return chrome.runtime.sendMessage(msg) as Promise<R>;
}

// In the content script, listen with:
//   chrome.runtime.onMessage.addListener((msg: ToContent, _s, sendResponse) => { ... ; return true })
// Return `true` to keep the channel open for an async sendResponse.
