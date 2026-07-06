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
  | { type: 'VERIFY'; uids: string[] } // read back filled values for verification
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
  | { type: 'VERIFY_RESULT'; mismatches: { uid: string; expected: string; actual: string }[] }
  | { type: 'PONG' };

// --- side panel  →  background (LLM work) -------------------------------
export type ToBackground =
  | { type: 'LLM_MAP_FIELDS'; unresolved: { uid: string; signals: unknown }[] }
  | { type: 'LLM_DRAFT_ANSWER'; uid: string; question: string }
  | { type: 'LLM_EXTRACT_RESUME'; text: string }
  | { type: 'LLM_COVER_LETTER'; company: string; role: string; description?: string }
  | {
      type: 'LLM_TAILOR_RESUME';
      jobInfo: { company: string; role: string; description?: string };
      baseText?: string; // extracted text of the user's existing résumé (PDF), if available
    }
  | { type: 'GET_PROFILE' }
  | { type: 'CAPTURE_TAB' }; // capture visible tab screenshot from background (has permission)

export type FromBackground =
  | {
      type: 'LLM_MAP_RESULT';
      mappings: { uid: string; key: string | null; confidence: number }[];
    }
  | { type: 'LLM_DRAFT_RESULT'; uid: string; answer: string; source: 'answerBank' | 'llm' | 'none' }
  | { type: 'LLM_EXTRACT_RESULT'; data: unknown; error?: string } // raw JSON; validated at merge time
  | { type: 'LLM_COVER_LETTER_RESULT'; text: string; error?: string }
  | { type: 'LLM_TAILOR_RESULT'; data: unknown; error?: string } // raw JSON; validated at render time
  | { type: 'PROFILE'; profile: unknown }
  | { type: 'CAPTURE_TAB_RESULT'; dataUrl: string | null };

// Typed helpers -----------------------------------------------------------

// Maps a ToContent request type → its expected FromContent response type.
// Used by sendTyped() to give callers narrowed return types without manual casting.
type ContentResponseMap = {
  DETECT: Extract<FromContent, { type: 'DETECTED' }>;
  FILL: Extract<FromContent, { type: 'FIELD_FILLED' }>;
  FILL_FILE: Extract<FromContent, { type: 'FIELD_FILLED' }>;
  FILL_SECTIONS: Extract<FromContent, { type: 'SECTIONS_RESULT' }>;
  GET_PAGE_INFO: Extract<FromContent, { type: 'PAGE_INFO' }>;
  VERIFY: Extract<FromContent, { type: 'VERIFY_RESULT' }>;
  PING: Extract<FromContent, { type: 'PONG' }>;
  STATUS: Extract<FromContent, { type: 'STATUS' }>;
  WIZARD_NEXT: Extract<FromContent, { type: 'STATUS' }>;
  WIZARD_RUN: Extract<FromContent, { type: 'STATUS' }>;
  FILL_AND_NEXT: Extract<FromContent, { type: 'STATUS' }>;
};

// Maps a ToBackground request type → its expected FromBackground response type.
type BackgroundResponseMap = {
  LLM_MAP_FIELDS: Extract<FromBackground, { type: 'LLM_MAP_RESULT' }>;
  LLM_DRAFT_ANSWER: Extract<FromBackground, { type: 'LLM_DRAFT_RESULT' }>;
  LLM_EXTRACT_RESUME: Extract<FromBackground, { type: 'LLM_EXTRACT_RESULT' }>;
  LLM_COVER_LETTER: Extract<FromBackground, { type: 'LLM_COVER_LETTER_RESULT' }>;
  LLM_TAILOR_RESUME: Extract<FromBackground, { type: 'LLM_TAILOR_RESULT' }>;
  GET_PROFILE: Extract<FromBackground, { type: 'PROFILE' }>;
};

/**
 * Send a message to a content script frame with a narrowed response type.
 * Usage: `const r = await sendTypedToFrame(tabId, 0, { type: 'DETECT' }); // r is DETECTED`
 */
export function sendTypedToFrame<T extends ToContent & { type: keyof ContentResponseMap }>(
  tabId: number,
  frameId: number,
  msg: T,
): Promise<ContentResponseMap[T['type']]> {
  return chrome.tabs.sendMessage(tabId, msg, { frameId }) as Promise<ContentResponseMap[T['type']]>;
}

/**
 * Send a message to the background worker with a narrowed response type.
 * Usage: `const r = await sendTypedToBackground({ type: 'LLM_DRAFT_ANSWER', ... }); // r is LLM_DRAFT_RESULT`
 */
export function sendTypedToBackground<
  T extends ToBackground & { type: keyof BackgroundResponseMap },
>(msg: T): Promise<BackgroundResponseMap[T['type']]> {
  return chrome.runtime.sendMessage(msg) as Promise<BackgroundResponseMap[T['type']]>;
}

// Legacy untyped helpers (still used in existing code; prefer sendTyped* for new code)
export function sendToContent<R = FromContent>(tabId: number, msg: ToContent): Promise<R> {
  return chrome.tabs.sendMessage(tabId, msg) as Promise<R>;
}
export function sendToBackground<R = FromBackground>(msg: ToBackground): Promise<R> {
  return chrome.runtime.sendMessage(msg) as Promise<R>;
}

// In the content script, listen with:
//   chrome.runtime.onMessage.addListener((msg: ToContent, _s, sendResponse) => { ... ; return true })
// Return `true` to keep the channel open for an async sendResponse.
