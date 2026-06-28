import { defineBackground } from 'wxt/utils/define-background';
import { getProfile } from '@/core/storage/profileStore';
import { mapFieldsWithLLM, draftAnswerWithLLM } from '@/core/llm/client';
import { findAnswer } from '@/core/llm/answerBank';
import type { ToBackground, FromBackground } from '@/core/messages';

// IMPLEMENTATION.md §16 — orchestrator + the ONLY context that talks to the LLM,
// so API keys never enter a web page. Also wires the toolbar icon to the side panel.

const HANDLED = new Set<ToBackground['type']>([
  'GET_PROFILE',
  'LLM_MAP_FIELDS',
  'LLM_DRAFT_ANSWER',
]);

export default defineBackground(() => {
  // Open the side panel when the toolbar icon is clicked.
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

  chrome.runtime.onMessage.addListener((msg: ToBackground, _sender, sendResponse) => {
    // Ignore broadcasts meant for the side panel (DETECTED/STATUS/FIELD_FILLED) so we
    // don't hold the message channel open for messages we never answer.
    if (!msg || !HANDLED.has(msg.type)) return false;

    (async () => {
      switch (msg.type) {
        case 'GET_PROFILE': {
          const profile = await getProfile();
          sendResponse({ type: 'PROFILE', profile } satisfies FromBackground);
          break;
        }
        case 'LLM_MAP_FIELDS': {
          const profile = await getProfile();
          let mappings: { uid: string; key: string | null; confidence: number }[] = [];
          if (profile.settings.llmEnabled) {
            // Guard the network call so a failure (no key, non-2xx, offline) resolves
            // the channel with an empty result instead of hanging the side panel (#21).
            try {
              mappings = await mapFieldsWithLLM(msg.unresolved, profile);
            } catch (e) {
              console.warn('LLM field mapping failed', e);
            }
          }
          sendResponse({ type: 'LLM_MAP_RESULT', mappings } satisfies FromBackground);
          break;
        }
        case 'LLM_DRAFT_ANSWER': {
          const profile = await getProfile();
          // Resolution order (§20): answer bank → LLM draft → leave blank.
          const saved = findAnswer(msg.question, profile.answerBank);
          let answer = saved?.answer ?? '';
          let source: 'answerBank' | 'llm' | 'none' = saved ? 'answerBank' : 'none';
          if (!answer && profile.settings.llmEnabled) {
            try {
              answer = await draftAnswerWithLLM(msg.question, profile);
              if (answer) source = 'llm';
            } catch (e) {
              console.warn('LLM draft failed', e);
            }
          }
          sendResponse({
            type: 'LLM_DRAFT_RESULT',
            uid: msg.uid,
            answer,
            source,
          } satisfies FromBackground);
          break;
        }
      }
    })();
    return true; // keep the channel open for the async sendResponse
  });
});
