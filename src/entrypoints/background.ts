import { defineBackground } from 'wxt/utils/define-background';
import { getProfile } from '@/core/storage/profileStore';
import { getFile } from '@/core/storage/blobStore';
import { recordLearned } from '@/core/storage/learnStore';
import {
  mapFieldsWithLLM,
  draftAnswerWithLLM,
  extractResumeWithLLM,
  generateCoverLetter,
  tailorResumeWithLLM,
} from '@/core/llm/client';
import { findAnswer } from '@/core/llm/answerBank';
import type { ToBackground, FromBackground, FromContent } from '@/core/messages';

// base64-encode a File, chunked to avoid the call-stack limit on large résumés (§25).
async function fileToB64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK)
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

// IMPLEMENTATION.md §16 — orchestrator + the ONLY context that talks to the LLM,
// so API keys never enter a web page. Also wires the toolbar icon to the side panel.

const HANDLED = new Set<ToBackground['type']>([
  'GET_PROFILE',
  'LLM_MAP_FIELDS',
  'LLM_DRAFT_ANSWER',
  'LLM_EXTRACT_RESUME',
  'LLM_COVER_LETTER',
  'LLM_TAILOR_RESUME',
]);

export default defineBackground(() => {
  // Open the side panel when the toolbar icon is clicked.
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

  // --- Service worker keep-alive for long LLM calls ---
  // MV3 service workers are killed after 30s of inactivity. LLM calls (résumé tailoring,
  // cover letters) can take 15-60s. Arm a periodic alarm while an LLM call is in flight
  // so Chrome doesn't terminate us mid-request.
  const KEEPALIVE_ALARM = 'sw-keepalive';
  let inflightLLM = 0;
  function armKeepAlive() {
    inflightLLM++;
    if (inflightLLM === 1) {
      chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 }); // ~24s ping
    }
  }
  function disarmKeepAlive() {
    inflightLLM = Math.max(0, inflightLLM - 1);
    if (inflightLLM === 0) {
      chrome.alarms.clear(KEEPALIVE_ALARM).catch(() => {});
    }
  }
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEPALIVE_ALARM) {
      // no-op — the alarm firing keeps the service worker alive
    }
  });

  // Keyboard shortcut: Ctrl+Shift+F → detect, attach résumé, and fill all fields on the
  // active tab — a complete one-key fill without opening the panel. Stops at review (the
  // content script never submits).
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'fill-page') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const tabId = tab.id;
    try {
      const profile = await getProfile();

      // Prepare the résumé once (bytes live in the extension's IndexedDB, reachable here).
      let resume: { b64: string; filename: string; mime: string } | null = null;
      const defaultDoc =
        profile.documents.resumes?.find((r) => r.id === profile.documents.defaultResumeId) ??
        profile.documents.resumes?.[0];
      const resumeBlobId = defaultDoc?.blobId ?? profile.documents.resumeBlobId;
      if (resumeBlobId) {
        const file = await getFile(resumeBlobId);
        if (file) resume = { b64: await fileToB64(file), filename: file.name, mime: file.type };
      }

      const frames = await chrome.webNavigation.getAllFrames({ tabId });
      for (const frame of frames ?? []) {
        const res = (await chrome.tabs
          .sendMessage(tabId, { type: 'DETECT' }, { frameId: frame.frameId })
          .catch(() => null)) as FromContent | null;
        if (res?.type !== 'DETECTED' || !res.fields.length) continue;

        // Résumé first (most file inputs on applications ARE the résumé), then the rest.
        if (resume) {
          const fileField =
            res.fields.find((f) => f.mappedKey === 'documents.resume') ??
            res.fields.find((f) => f.kind === 'file');
          if (fileField) {
            await chrome.tabs
              .sendMessage(
                tabId,
                { type: 'FILL_FILE', uid: fileField.uid, ...resume },
                { frameId: frame.frameId },
              )
              .catch(() => null);
          }
        }

        const fills = res.fields
          .filter((f) => f.value != null && f.mappedKey !== 'documents.resume')
          .map((f) => ({ uid: f.uid, value: f.value as string }));
        if (fills.length) {
          await chrome.tabs
            .sendMessage(tabId, { type: 'FILL', fields: fills }, { frameId: frame.frameId })
            .catch(() => null);
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

    // Keep service worker alive during LLM calls
    const isLLM = msg.type.startsWith('LLM_');
    if (isLLM) armKeepAlive();

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
          // Resolution order (§20): answer bank (threshold 0.4) → learned store → LLM → blank.
          // Lower threshold (0.4 vs default 0.5) catches more bank hits, reducing LLM calls
          // for repeat applicants where label wording varies slightly across ATSes.
          const saved = findAnswer(msg.question, profile.answerBank, 0.4);
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
        case 'LLM_TAILOR_RESUME': {
          const profile = await getProfile();
          let data: unknown = null;
          let error: string | undefined;
          if (profile.settings.llmEnabled) {
            try {
              data = await tailorResumeWithLLM(profile, msg.jobInfo, msg.baseText);
            } catch (e) {
              error = String(e);
              console.warn('Résumé tailoring failed', e);
            }
          } else {
            error = 'AI assist is disabled in settings';
          }
          sendResponse({ type: 'LLM_TAILOR_RESULT', data, error } satisfies FromBackground);
          break;
        }
      }
    })().finally(() => {
      if (isLLM) disarmKeepAlive();
    });
    return true; // keep the channel open for the async sendResponse
  });
});
