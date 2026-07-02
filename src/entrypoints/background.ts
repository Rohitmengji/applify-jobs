import { defineBackground } from 'wxt/utils/define-background';
import { getProfile } from '@/core/storage/profileStore';
import { recordLearned } from '@/core/storage/learnStore';
import {
  mapFieldsWithLLM,
  draftAnswerWithLLM,
  extractResumeWithLLM,
  generateCoverLetter,
} from '@/core/llm/client';
import { findAnswer } from '@/core/llm/answerBank';
import type { ToBackground, FromBackground } from '@/core/messages';

// IMPLEMENTATION.md §16 — orchestrator + the ONLY context that talks to the LLM,
// so API keys never enter a web page. Also wires the toolbar icon to the side panel.

const HANDLED = new Set<ToBackground['type']>([
  'GET_PROFILE',
  'LLM_MAP_FIELDS',
  'LLM_DRAFT_ANSWER',
  'LLM_EXTRACT_RESUME',
  'LLM_COVER_LETTER',
]);

export default defineBackground(() => {
  // Open the side panel when the toolbar icon is clicked.
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

  // Keyboard shortcut: Ctrl+Shift+F → detect and fill all fields on active tab.
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'fill-page') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    // Send DETECT first, then FILL with all resolved values
    try {
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
      for (const frame of frames ?? []) {
        const res = await chrome.tabs
          .sendMessage(tab.id, { type: 'DETECT' }, { frameId: frame.frameId })
          .catch(() => null);
        if (res?.type === 'DETECTED' && res.fields?.length) {
          const fills = res.fields
            .filter((f: { value: string | null }) => f.value != null)
            .map((f: { uid: string; value: string }) => ({ uid: f.uid, value: f.value }));
          if (fills.length) {
            await chrome.tabs
              .sendMessage(tab.id, { type: 'FILL', fields: fills }, { frameId: frame.frameId })
              .catch(() => null);
          }
        }
      }
    } catch {
      /* tab not ready or no content script */
    }
  });

  // Badge: show field count on the toolbar icon for the active tab.
  // Listen for DETECTED broadcasts from content scripts.
  // Also handle LEARN_FIELD from the passive observer.
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type === 'DETECTED' && sender.tab?.id) {
      const count = (msg.fields as unknown[])?.length ?? 0;
      const text = count > 0 ? String(count) : '';
      chrome.action.setBadgeText({ text, tabId: sender.tab.id }).catch(() => {});
      chrome.action
        .setBadgeBackgroundColor({
          color: count > 0 ? '#6d28d9' : '#9ca3af',
          tabId: sender.tab.id,
        })
        .catch(() => {});
    }
    if (msg?.type === 'LEARN_FIELD' && msg.entries) {
      void recordLearned(msg.entries, msg.adapterId ?? null);
    }
    // Don't return true — don't hold the channel open for broadcasts
  });

  // Clear badge when switching to a tab without detected fields
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const text = await chrome.action.getBadgeText({ tabId }).catch(() => '');
    if (!text) chrome.action.setBadgeText({ text: '' }).catch(() => {});
  });

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
        case 'LLM_EXTRACT_RESUME': {
          const profile = await getProfile();
          let data: unknown = null;
          let error: string | undefined;
          if (profile.settings.llmEnabled) {
            try {
              data = await extractResumeWithLLM(msg.text);
            } catch (e) {
              error = String(e);
              console.warn('LLM résumé extraction failed', e);
            }
          } else {
            error = 'AI assist is disabled in settings';
          }
          sendResponse({ type: 'LLM_EXTRACT_RESULT', data, error } satisfies FromBackground);
          break;
        }
        case 'LLM_COVER_LETTER': {
          const profile = await getProfile();
          let text = '';
          let error: string | undefined;
          if (profile.settings.llmEnabled) {
            try {
              text = await generateCoverLetter(profile, {
                company: msg.company,
                role: msg.role,
                description: msg.description,
              });
            } catch (e) {
              error = String(e);
              console.warn('Cover letter generation failed', e);
            }
          } else {
            error = 'AI assist is disabled in settings';
          }
          sendResponse({ type: 'LLM_COVER_LETTER_RESULT', text, error } satisfies FromBackground);
          break;
        }
      }
    })();
    return true; // keep the channel open for the async sendResponse
  });
});
