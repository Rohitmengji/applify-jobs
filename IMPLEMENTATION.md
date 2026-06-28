# OneClick Apply — Full Implementation Specification

**A Manifest V3 Chrome extension that fills job application forms across every major ATS with one click, human-in-the-loop.**

> **How to use this document with GitHub Copilot**
> This is the single source of truth for the build. Keep it at the repo root as `IMPLEMENTATION.md` so Copilot indexes it as workspace context. Build in the milestone order in §22 — do **not** try to scaffold everything at once. For each file, open it, paste the relevant interface/contract from this doc as a comment at the top, then let Copilot complete against it. Code blocks marked **REFERENCE** are complete and correct — use them verbatim. Blocks marked **STUB** are intentionally partial; Copilot fills them in against the documented contract.

---

## Table of contents

1. Product definition
2. Why an extension (the non-negotiable constraint)
3. System architecture
4. Tech stack & exact dependencies
5. Repository structure
6. Environment setup & commands
7. Manifest / `wxt.config.ts`
8. Type system & the Profile schema
9. Storage layer
10. Messaging protocol
11. The field engine (core)
12. Fill primitives (the DOM-reality layer)
13. Multi-step wizard state machine
14. Site adapters
15. The content script
16. The background service worker
17. The side panel UI
18. The options page UI
19. LLM integration
20. The answer bank
21. Permissions, privacy & legal guardrails
22. Build milestones with acceptance criteria
23. Testing strategy
24. Packaging & distribution
25. Edge-case & gotcha appendix
26. Driving Copilot effectively

> **Version note:** dependency versions below are known-good as of early 2026. Run `pnpm outdated` after install and bump to current minors; the APIs referenced (MV3, WXT, Zod, Dexie) are stable across recent versions.

---

## 1. Product definition

**Job to be done.** A job seeker is on an application page (Workday, Greenhouse, Lever, Workable, Ashby, SmartRecruiters, JazzHR, iCIMS, SuccessFactors, Oracle/Taleo, or an arbitrary company career site). They click the extension's **Fill** button. The extension detects every field on the page, maps each to the user's saved profile, fills it, and — for multi-step wizards — advances through the steps until the review screen. The user reviews everything in a side panel, fixes anything wrong, and clicks **Submit themselves**.

**Hard product rules.**

- **The extension never auto-submits.** It stops at review. The human submits. This is a deliberate design pillar, not a v1 limitation — it sidesteps CAPTCHAs, avoids ToS violations, and keeps a human eye on every application.
- **The profile is the single source of truth.** One master record fills every ATS.
- **Deterministic before probabilistic.** Hand-tuned adapters first, generic heuristics second, LLM only for what's left.
- **Everything degrades gracefully.** A broken adapter falls through to heuristics + LLM rather than failing cold.
- **Data is local by default.** No backend is required for the core product. A backend is optional and only proxies LLM calls.

**Out of scope for v1:** mass "apply to 500 jobs unattended," LinkedIn/Indeed Easy-Apply automation (see §21), and account creation/login automation.

---

## 2. Why an extension (the non-negotiable constraint)

A web app at `yourapp.com` **cannot** read or write the DOM of `company.wd1.myworkdayjobs.com`. The browser's same-origin policy forbids cross-origin DOM access, with no flag or workaround from page JS. Therefore the autofill logic must run **inside** the job page. Only two things can do that:

1. **A content script** injected by a browser extension — runs in the user's real, authenticated session, with a human present. Low bot-detection risk.
2. **Headless automation** (Playwright/Puppeteer) — drives a browser programmatically; trips CAPTCHAs and bot detection constantly; brittle on login/2FA.

For "I'm on the page, fill it, I'll review and submit," the **MV3 extension, human-in-the-loop** wins decisively. That is what this document builds.

---

## 3. System architecture

Five components, standard MV3 shape:

```
┌──────────────────────────────────────────────────────────────────────┐
│                            JOB APPLICATION PAGE                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  CONTENT SCRIPT  (src/entrypoints/content.ts)                    │  │
│  │  • detects fields (adapter → heuristic → llm)                    │  │
│  │  • applies fill primitives to the live DOM                       │  │
│  │  • drives the multi-step wizard state machine                    │  │
│  │  • reports detected fields + status to the side panel            │  │
│  └───────────────▲────────────────────────────────┬─────────────────┘  │
└──────────────────┼────────────────────────────────┼────────────────────┘
                   │ messages (typed)                │ messages (typed)
        ┌──────────┴───────────┐          ┌──────────▼───────────────────┐
        │  SIDE PANEL  (React)  │          │  BACKGROUND SERVICE WORKER    │
        │  src/entrypoints/     │◄────────►│  src/entrypoints/background.ts│
        │  sidepanel/           │ messages │  • message router             │
        │  • review table       │          │  • ONLY caller of the LLM     │
        │  • per-field overrides │          │  • holds/forwards API key     │
        │  • Fill / Next / state │          │  • reads profile from storage │
        └───────────────────────┘          └──────────┬───────────────────┘
                                                       │
                          ┌────────────────────────────┼───────────────────┐
                          │                             │                   │
                 ┌────────▼─────────┐        ┌──────────▼────────┐   ┌──────▼──────┐
                 │ chrome.storage   │        │  IndexedDB (Dexie) │   │  LLM API /  │
                 │ .local           │        │  • resume blob     │   │  backend    │
                 │ • profile JSON   │        │  • cover letters   │   │  proxy      │
                 │ • settings       │        │  • large docs      │   │ (optional)  │
                 └──────────────────┘        └────────────────────┘   └─────────────┘

        OPTIONS PAGE (React)  src/entrypoints/options/
        • full profile editor • resume upload • answer-bank editor • settings
```

**Data flow for one fill:**

1. User opens side panel on a job page → side panel asks content script to `DETECT`.
2. Content script picks the matching adapter (or generic), builds `DetectedField[]`, asks background to resolve low-confidence/free-text fields via LLM, returns the list.
3. Side panel renders the review table. User edits mappings if needed.
4. User clicks **Fill** → side panel sends `FILL` with resolved values → content script applies primitives.
5. If multi-step: content script runs the wizard loop, re-emitting `DETECT` results per step, stopping at review.
6. User reviews on the page and submits manually.

**Why the side panel, not a popup:** a popup closes the instant the user clicks into the form. The Chrome **Side Panel API** stays pinned beside the form through the whole review-and-fix loop.

---

## 4. Tech stack & exact dependencies

| Concern             | Choice                                                                                   | Why                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Language            | **TypeScript 5.x** (strict)                                                              | Types are load-bearing across the message boundary and the schema.                                                     |
| Extension framework | **WXT** (`wxt` ~0.20)                                                                    | Handles all MV3 boilerplate, manifest generation, HMR, multi-entrypoint builds. Far less config than raw MV3 or CRXJS. |
| UI                  | **React 18** + **Tailwind CSS 3**                                                        | Side panel + options page. Tailwind keeps styling local and fast.                                                      |
| Schema/validation   | **Zod 3.x**                                                                              | One schema validates the profile at every boundary (storage read, import, form fill).                                  |
| Large-blob storage  | **Dexie 4.x** (IndexedDB)                                                                | Resume/cover-letter blobs exceed `chrome.storage` limits.                                                              |
| State (UI)          | **Zustand** (small) or React context                                                     | Side panel/options local state. Zustand recommended for the review table.                                              |
| Testing             | **Vitest** + **@testing-library/react** + **jsdom**; **Playwright** for adapter fixtures | Unit-test the matcher; fixture-test adapters against saved HTML.                                                       |
| Lint/format         | **ESLint** + **Prettier**                                                                | Standard.                                                                                                              |
| Package manager     | **pnpm**                                                                                 | Fast, disk-efficient; examples below use `pnpm`.                                                                       |

**`package.json` dependencies (starting point):**

```jsonc
{
  "name": "oneclick-apply",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "compile": "tsc --noEmit",
    "test": "vitest",
    "lint": "eslint . && prettier --check .",
  },
  "dependencies": {
    "dexie": "^4.0.8",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zod": "^3.23.8",
    "zustand": "^4.5.4",
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/chrome": "^0.0.270",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@wxt-dev/module-react": "^1.1.0",
    "autoprefixer": "^10.4.19",
    "eslint": "^9.8.0",
    "jsdom": "^24.1.1",
    "postcss": "^8.4.40",
    "prettier": "^3.3.3",
    "tailwindcss": "^3.4.7",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5",
    "wxt": "^0.20.0",
  },
}
```

---

## 5. Repository structure

```
oneclick-apply/
├── IMPLEMENTATION.md            ← this file
├── README.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── wxt.config.ts                ← manifest + build config
├── tailwind.config.js
├── postcss.config.js
├── .eslintrc.cjs
├── .prettierrc
├── public/
│   └── icons/                   ← 16/32/48/128 px PNGs
└── src/
    ├── entrypoints/
    │   ├── background.ts        ← service worker (orchestrator + LLM caller)
    │   ├── content.ts           ← content script (detect + fill + wizard)
    │   ├── sidepanel/
    │   │   ├── index.html
    │   │   ├── main.tsx
    │   │   ├── App.tsx
    │   │   └── components/
    │   │       ├── ReviewTable.tsx
    │   │       ├── FieldRow.tsx
    │   │       ├── FillButton.tsx
    │   │       └── StatusBar.tsx
    │   └── options/
    │       ├── index.html
    │       ├── main.tsx
    │       ├── App.tsx
    │       └── sections/
    │           ├── PersonalSection.tsx
    │           ├── ExperienceSection.tsx
    │           ├── EducationSection.tsx
    │           ├── LinksSection.tsx
    │           ├── WorkAuthSection.tsx
    │           ├── EeoSection.tsx
    │           ├── DocumentsSection.tsx
    │           └── AnswerBankSection.tsx
    ├── core/
    │   ├── types.ts             ← shared TS types (DetectedField, messages…)
    │   ├── profile.schema.ts    ← Zod schema + inferred Profile type
    │   ├── messages.ts          ← message contracts + typed send/receive
    │   ├── storage/
    │   │   ├── profileStore.ts   ← chrome.storage.local wrapper
    │   │   └── blobStore.ts      ← Dexie (resume/cover letters)
    │   ├── engine/
    │   │   ├── detect.ts         ← collect fields + signals from DOM
    │   │   ├── signals.ts        ← extract label/name/aria/nearby text
    │   │   ├── heuristic.ts      ← synonym dictionary + scoring matcher
    │   │   ├── synonyms.ts       ← profile-key → synonym lists
    │   │   ├── resolve.ts        ← orchestrates adapter→heuristic→llm
    │   │   ├── fill.ts           ← fill primitives (React setter, file, dropdown…)
    │   │   ├── wizard.ts         ← multi-step state machine + waitForDomSettle
    │   │   └── adapters/
    │   │       ├── index.ts      ← registry + matchAdapter(url, doc)
    │   │       ├── types.ts      ← SiteAdapter interface
    │   │       ├── greenhouse.ts
    │   │       ├── lever.ts
    │   │       ├── workable.ts
    │   │       ├── ashby.ts
    │   │       ├── smartrecruiters.ts
    │   │       ├── jazzhr.ts
    │   │       ├── workday.ts
    │   │       ├── icims.ts
    │   │       ├── successfactors.ts
    │   │       └── oracle.ts
    │   └── llm/
    │       ├── client.ts         ← Anthropic call (from background only)
    │       ├── prompts.ts        ← field-mapping + answer-drafting prompts
    │       └── answerBank.ts     ← match saved answers to questions
    └── tests/
        ├── heuristic.test.ts
        ├── fixtures/             ← saved ATS HTML snapshots
        │   ├── greenhouse.html
        │   └── lever.html
        └── adapters.test.ts
```

---

## 6. Environment setup & commands

```bash
# prerequisites: Node 20+, pnpm
corepack enable && corepack prepare pnpm@latest --activate

pnpm create wxt@latest oneclick-apply   # choose: react + typescript
cd oneclick-apply
pnpm add dexie zod zustand
pnpm add -D tailwindcss postcss autoprefixer @types/chrome vitest jsdom \
          @testing-library/react @wxt-dev/module-react
npx tailwindcss init -p

# develop (auto-reload, opens a dev browser profile)
pnpm dev

# type-check
pnpm compile

# production build → .output/chrome-mv3/
pnpm build

# zip for the Chrome Web Store
pnpm zip
```

**Load unpacked manually:** Chrome → `chrome://extensions` → enable _Developer mode_ → _Load unpacked_ → select `.output/chrome-mv3/`.

---

## 7. Manifest / `wxt.config.ts`

WXT generates `manifest.json` from this config and from entrypoint files. **REFERENCE:**

```ts
// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'OneClick Apply',
    description: 'Fill job application forms across every ATS with one click.',
    version: '0.1.0',
    permissions: [
      'storage', // profile + settings
      'sidePanel', // the review surface
      'scripting', // programmatic injection if needed
      'activeTab', // act on the current tab on user gesture
    ],
    host_permissions: [
      // Broad to start; tighten before store submission (see §21).
      'https://*/*',
    ],
    side_panel: { default_path: 'sidepanel/index.html' },
    action: { default_title: 'OneClick Apply' },
    options_ui: { page: 'options/index.html', open_in_tab: true },
    // Opening the side panel from the toolbar icon requires this in the SW:
    //   chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  },
});
```

Content-script registration is declared **in the entrypoint file** (WXT convention), not the manifest — see §15.

> **Store-review reality:** `https://*/*` host permission will draw scrutiny. For submission, either enumerate ATS domains in `host_permissions`, or keep broad host access but use `activeTab` + `scripting.executeScript` so injection only happens on an explicit user click. The §15 content script shows the declarative path for development; switch to on-demand injection before publishing.

---

## 8. Type system & the Profile schema

The profile is the contract everything maps to. Define it once with Zod; infer the TS type. **REFERENCE:**

```ts
// src/core/profile.schema.ts
import { z } from 'zod';

const dateStr = z.string().regex(/^\d{4}(-\d{2})?(-\d{2})?$/, 'use YYYY, YYYY-MM, or YYYY-MM-DD');

export const ExperienceSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().optional(),
  startDate: dateStr,
  endDate: dateStr.optional(),
  current: z.boolean().default(false),
  description: z.string().default(''),
});

export const EducationSchema = z.object({
  id: z.string().uuid(),
  school: z.string().min(1),
  degree: z.string().min(1),
  field: z.string().optional(),
  startDate: dateStr.optional(),
  endDate: dateStr.optional(),
  gpa: z.string().optional(),
});

export const AnswerSchema = z.object({
  id: z.string().uuid(),
  questionPattern: z.string().min(1), // matched fuzzily against field labels
  answer: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export const ProfileSchema = z.object({
  schemaVersion: z.literal(1),
  personal: z.object({
    firstName: z.string().min(1),
    middleName: z.string().optional(),
    lastName: z.string().min(1),
    preferredName: z.string().optional(),
    email: z.string().email(),
    phone: z.string().min(1),
    address: z.object({
      line1: z.string().optional(),
      line2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      country: z.string().default('United States'),
    }),
  }),
  links: z.object({
    linkedin: z.string().url().optional().or(z.literal('')),
    github: z.string().url().optional().or(z.literal('')),
    portfolio: z.string().url().optional().or(z.literal('')),
    website: z.string().url().optional().or(z.literal('')),
  }),
  workAuth: z.object({
    authorizedToWork: z.boolean().default(true),
    needsSponsorship: z.boolean().default(false),
    requiresVisa: z.boolean().default(false),
  }),
  // EEO/voluntary disclosures — all optional, default to "decline to self-identify".
  eeo: z
    .object({
      gender: z.string().optional(),
      race: z.string().optional(),
      hispanicLatino: z.string().optional(),
      veteranStatus: z.string().optional(),
      disabilityStatus: z.string().optional(),
    })
    .default({}),
  experience: z.array(ExperienceSchema).default([]),
  education: z.array(EducationSchema).default([]),
  skills: z.array(z.string()).default([]),
  documents: z
    .object({
      resumeBlobId: z.string().optional(), // FK into Dexie blobStore
      resumeFilename: z.string().optional(),
      coverLetterBlobId: z.string().optional(),
      coverLetterFilename: z.string().optional(),
    })
    .default({}),
  answerBank: z.array(AnswerSchema).default([]),
  settings: z
    .object({
      llmEnabled: z.boolean().default(true),
      autoAdvanceWizard: z.boolean().default(true),
      confidenceThreshold: z.number().min(0).max(1).default(0.6),
    })
    .default({}),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type SavedAnswer = z.infer<typeof AnswerSchema>;

// Dot-path keys the engine maps fields to. Keep in sync with the schema.
export type ProfileKey =
  | 'personal.firstName'
  | 'personal.middleName'
  | 'personal.lastName'
  | 'personal.preferredName'
  | 'personal.email'
  | 'personal.phone'
  | 'personal.address.line1'
  | 'personal.address.line2'
  | 'personal.address.city'
  | 'personal.address.state'
  | 'personal.address.zip'
  | 'personal.address.country'
  | 'links.linkedin'
  | 'links.github'
  | 'links.portfolio'
  | 'links.website'
  | 'workAuth.authorizedToWork'
  | 'workAuth.needsSponsorship'
  | 'workAuth.requiresVisa'
  | 'eeo.gender'
  | 'eeo.race'
  | 'eeo.hispanicLatino'
  | 'eeo.veteranStatus'
  | 'eeo.disabilityStatus'
  | 'documents.resume'
  | 'documents.coverLetter'
  | 'skills'
  | 'experience'
  | 'education' // resolved per-row by the experience/education filler
  | 'freeText'; // routed to answer bank / LLM
```

Shared engine + message types live in `src/core/types.ts`. **REFERENCE:**

```ts
// src/core/types.ts
import type { ProfileKey } from './profile.schema';

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
}

export type WizardStatus =
  | { phase: 'idle' }
  | { phase: 'detecting' }
  | { phase: 'ready'; step: number; totalSteps?: number }
  | { phase: 'filling'; step: number }
  | { phase: 'review'; step: number }
  | { phase: 'error'; message: string };
```

---

## 9. Storage layer

Two stores. JSON profile in `chrome.storage.local`; binary blobs in IndexedDB via Dexie. Never put the resume in `chrome.storage.sync` (≈100 KB ceiling).

**REFERENCE — profile store:**

```ts
// src/core/storage/profileStore.ts
import { ProfileSchema, type Profile } from '../profile.schema';

const KEY = 'profile';

const EMPTY: Profile = ProfileSchema.parse({
  schemaVersion: 1,
  personal: {
    firstName: '',
    lastName: '',
    email: 'x@x.com',
    phone: '',
    address: { country: 'United States' },
  },
  links: {},
  workAuth: {},
  eeo: {},
  experience: [],
  education: [],
  skills: [],
  documents: {},
  answerBank: [],
  settings: {},
});

export async function getProfile(): Promise<Profile> {
  const raw = await chrome.storage.local.get(KEY);
  if (!raw[KEY]) return EMPTY;
  const parsed = ProfileSchema.safeParse(raw[KEY]);
  if (!parsed.success) {
    console.warn('Profile failed validation, migrating/repairing', parsed.error);
    return repair(raw[KEY]); // see §25 for migration strategy
  }
  return parsed.data;
}

export async function saveProfile(p: Profile): Promise<void> {
  const valid = ProfileSchema.parse(p); // throws on invalid — fail loud in the editor
  await chrome.storage.local.set({ [KEY]: valid });
}

export function onProfileChange(cb: (p: Profile) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]?.newValue) {
      const parsed = ProfileSchema.safeParse(changes[KEY].newValue);
      if (parsed.success) cb(parsed.data);
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

function repair(_raw: unknown): Profile {
  return EMPTY;
} // STUB: implement migrations
```

**REFERENCE — blob store (Dexie):**

```ts
// src/core/storage/blobStore.ts
import Dexie, { type Table } from 'dexie';

export interface StoredBlob {
  id: string; // uuid
  filename: string;
  mime: string;
  bytes: ArrayBuffer; // store bytes, not a File (File isn't structured-clone-stable everywhere)
  createdAt: number;
}

class OcaDB extends Dexie {
  blobs!: Table<StoredBlob, string>;
  constructor() {
    super('oneclick-apply');
    this.version(1).stores({ blobs: 'id, filename, createdAt' });
  }
}
export const db = new OcaDB();

export async function putBlob(file: File): Promise<string> {
  const id = crypto.randomUUID();
  await db.blobs.put({
    id,
    filename: file.name,
    mime: file.type || 'application/octet-stream',
    bytes: await file.arrayBuffer(),
    createdAt: Date.now(),
  });
  return id;
}

export async function getFile(id: string): Promise<File | null> {
  const b = await db.blobs.get(id);
  if (!b) return null;
  return new File([b.bytes], b.filename, { type: b.mime });
}

export async function deleteBlob(id: string): Promise<void> {
  await db.blobs.delete(id);
}
```

> **Where blobs live vs. who needs them:** Dexie runs in the **side panel / options** context (a normal DOM context). The **content script** needs the actual `File` to attach to a file input. Send the file from side panel → content script as bytes over `chrome.runtime` messaging (base64 or transferable), then reconstruct a `File` in the content script. See §10 and §12.

---

## 10. Messaging protocol

All cross-context communication is one typed union. Define contracts; wrap `chrome.runtime`/`chrome.tabs` so call sites stay typed. **REFERENCE:**

```ts
// src/core/messages.ts
import type { DetectedField, WizardStatus } from './types';

// --- side panel / background  →  content script -------------------------
export type ToContent =
  | { type: 'DETECT' } // detect fields on current page
  | { type: 'FILL'; fields: ResolvedFill[] } // fill these values
  | { type: 'FILL_FILE'; uid: string; filename: string; mime: string; b64: string }
  | { type: 'WIZARD_NEXT' } // advance one step
  | { type: 'WIZARD_RUN' } // run to review step
  | { type: 'PING' };

export interface ResolvedFill {
  uid: string;
  value: string;
}

// --- content script  →  side panel / background -------------------------
export type FromContent =
  | { type: 'DETECTED'; fields: DetectedField[]; adapterId: string | null }
  | { type: 'STATUS'; status: WizardStatus }
  | { type: 'FIELD_FILLED'; uid: string; ok: boolean; error?: string }
  | { type: 'PONG' };

// --- side panel  →  background (LLM work) -------------------------------
export type ToBackground =
  | { type: 'LLM_MAP_FIELDS'; unresolved: { uid: string; signals: unknown }[] }
  | { type: 'LLM_DRAFT_ANSWER'; uid: string; question: string }
  | { type: 'GET_PROFILE' };

export type FromBackground =
  | { type: 'LLM_MAP_RESULT'; mappings: { uid: string; key: string | null; confidence: number }[] }
  | { type: 'LLM_DRAFT_RESULT'; uid: string; answer: string }
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
```

**Conventions:**

- The side panel always resolves the active tab id (`chrome.tabs.query({active:true,currentWindow:true})`) before sending to a content script.
- Long-running work (wizard run) reports progress via repeated `STATUS` messages rather than a single response.
- Files cross the boundary as base64 (`FILL_FILE`) because structured clone of `File` across contexts is unreliable in MV3.

---

## 11. The field engine (core)

This is the part that decides whether the product is great or garbage. Three layers, deterministic-first. The orchestrator in `resolve.ts` runs them in order and stops as soon as a field is confidently mapped.

### 11.1 Detection — collecting fields and signals

Walk the document for fillable controls, assign each a stable `uid` (written to a `data-oca-uid` attribute so we can find it again after re-render), and gather every signal. **REFERENCE:**

```ts
// src/core/engine/signals.ts
import type { FieldSignals, FieldKind } from '../types';

export function classifyKind(el: Element): FieldKind {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select-native';
  if (el instanceof HTMLInputElement) {
    switch (el.type) {
      case 'email':
        return 'email';
      case 'tel':
        return 'tel';
      case 'url':
        return 'url';
      case 'number':
        return 'number';
      case 'checkbox':
        return 'checkbox';
      case 'radio':
        return 'radio-group';
      case 'file':
        return 'file';
      case 'date':
      case 'month':
        return 'date';
      default:
        return 'text';
    }
  }
  // Custom combobox pattern (div-based)
  const role = el.getAttribute('role');
  if (role === 'combobox' || role === 'listbox') return 'select-custom';
  return 'unknown';
}

export function getLabelText(el: Element): string {
  const id = el.getAttribute('id');
  if (id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (lbl?.textContent) return clean(lbl.textContent);
  }
  const wrapping = el.closest('label');
  if (wrapping?.textContent) return clean(wrapping.textContent);
  const ariaId = el.getAttribute('aria-labelledby');
  if (ariaId) {
    const t = ariaId
      .split(/\s+/)
      .map((i) => document.getElementById(i)?.textContent ?? '')
      .join(' ');
    if (t.trim()) return clean(t);
  }
  return '';
}

// Nearest visible text preceding the control — fallback when no <label>.
export function getNearbyText(el: Element): string {
  let node: Element | null = el;
  for (let hops = 0; hops < 4 && node; hops++) {
    const prev = node.previousElementSibling;
    if (prev && prev.textContent && prev.textContent.trim())
      return clean(prev.textContent).slice(0, 120);
    node = node.parentElement;
  }
  return '';
}

export function extractSignals(el: Element): FieldSignals {
  const input = el as HTMLInputElement;
  return {
    label: getLabelText(el),
    name: el.getAttribute('name') ?? '',
    id: el.getAttribute('id') ?? '',
    placeholder: el.getAttribute('placeholder') ?? '',
    ariaLabel: el.getAttribute('aria-label') ?? '',
    autocomplete: el.getAttribute('autocomplete') ?? '',
    nearbyText: getNearbyText(el),
    required: input.required || el.getAttribute('aria-required') === 'true',
    options: extractOptions(el),
  };
}

function extractOptions(el: Element): string[] | undefined {
  if (el instanceof HTMLSelectElement) return Array.from(el.options).map((o) => clean(o.text));
  // custom dropdowns: options usually appear only when open — adapters supply these.
  return undefined;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/\*+$/, '').trim();
```

```ts
// src/core/engine/detect.ts
import { classifyKind, extractSignals } from './signals';
import type { DetectedField } from '../types';

const SELECTOR = [
  'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset])',
  'textarea',
  'select',
  '[role=combobox]',
  '[role=listbox]',
].join(',');

// Radios share a name; collapse them into one DetectedField per group.
export function detectFields(root: ParentNode = document): DetectedField[] {
  const els = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR));
  const seenRadioNames = new Set<string>();
  const out: DetectedField[] = [];

  for (const el of els) {
    if (!isVisible(el)) continue;
    const kind = classifyKind(el);

    if (kind === 'radio-group') {
      const name = el.getAttribute('name') ?? '';
      if (!name || seenRadioNames.has(name)) continue;
      seenRadioNames.add(name);
    }

    const uid = el.getAttribute('data-oca-uid') ?? crypto.randomUUID();
    el.setAttribute('data-oca-uid', uid);

    out.push({
      uid,
      kind,
      signals: enrichRadioOptions(el, kind),
      mappedKey: null,
      confidence: 0,
      value: null,
      source: 'none',
      filled: false,
    });
  }
  return out;
}

function enrichRadioOptions(el: HTMLElement, kind: string) {
  const signals = extractSignals(el);
  if (kind === 'radio-group') {
    const name = el.getAttribute('name') ?? '';
    const radios = document.querySelectorAll<HTMLInputElement>(
      `input[type=radio][name="${CSS.escape(name)}"]`,
    );
    signals.options = Array.from(radios).map((r) => {
      const id = r.id;
      const lbl = id
        ? document.querySelector(`label[for="${CSS.escape(id)}"]`)
        : r.closest('label');
      return (lbl?.textContent ?? r.value).replace(/\s+/g, ' ').trim();
    });
    // label of the *group* is usually a fieldset legend
    const legend = el.closest('fieldset')?.querySelector('legend')?.textContent;
    if (legend && !signals.label) signals.label = legend.replace(/\s+/g, ' ').trim();
  }
  return signals;
}

function isVisible(el: HTMLElement): boolean {
  const s = getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
```

### 11.2 Layer 1 — site adapters (deterministic)

An adapter knows a specific ATS's exact DOM. The registry picks one by hostname/markup. Full interface and examples in §14. The orchestrator calls `adapter.detectFields()` if present; otherwise it uses the generic detector above, then the heuristic matcher.

### 11.3 Layer 2 — heuristic matcher

For each detected field, score it against a synonym dictionary keyed by `ProfileKey`. The signal sources are weighted (autocomplete and label are the strongest signals; nearby text the weakest). **REFERENCE:**

```ts
// src/core/engine/synonyms.ts
import type { ProfileKey } from '../profile.schema';

// Each key → list of lowercased substrings that indicate it.
export const SYNONYMS: Partial<Record<ProfileKey, string[]>> = {
  'personal.firstName': [
    'first name',
    'given name',
    'fname',
    'firstname',
    'legal first',
    'forename',
  ],
  'personal.lastName': ['last name', 'surname', 'lname', 'lastname', 'legal last', 'family name'],
  'personal.middleName': ['middle name', 'middle initial', 'mname'],
  'personal.preferredName': ['preferred name', 'nickname', 'goes by', 'preferred first'],
  'personal.email': ['email', 'e-mail', 'email address'],
  'personal.phone': ['phone', 'mobile', 'telephone', 'cell', 'contact number'],
  'personal.address.line1': ['address', 'street address', 'address line 1', 'addr'],
  'personal.address.line2': ['address line 2', 'apt', 'suite', 'unit'],
  'personal.address.city': ['city', 'town', 'municipality'],
  'personal.address.state': ['state', 'province', 'region'],
  'personal.address.zip': ['zip', 'postal code', 'postcode', 'zip code'],
  'personal.address.country': ['country'],
  'links.linkedin': ['linkedin'],
  'links.github': ['github', 'git hub'],
  'links.portfolio': ['portfolio'],
  'links.website': ['website', 'personal site', 'web site', 'url'],
  'workAuth.authorizedToWork': [
    'authorized to work',
    'legally authorized',
    'work authorization',
    'eligible to work',
  ],
  'workAuth.needsSponsorship': [
    'sponsorship',
    'require sponsorship',
    'visa sponsorship',
    'now or in the future require',
  ],
  'workAuth.requiresVisa': ['require a visa', 'visa status'],
  'eeo.gender': ['gender', 'sex'],
  'eeo.race': ['race', 'ethnicity'],
  'eeo.hispanicLatino': ['hispanic', 'latino'],
  'eeo.veteranStatus': ['veteran', 'protected veteran', 'military'],
  'eeo.disabilityStatus': ['disability', 'disabled'],
  'documents.resume': ['resume', 'résumé', 'cv', 'curriculum vitae', 'upload resume'],
  'documents.coverLetter': ['cover letter', 'covering letter'],
  skills: ['skills', 'key skills'],
};

// autocomplete attribute values map directly and are high-confidence.
export const AUTOCOMPLETE_MAP: Record<string, ProfileKey> = {
  'given-name': 'personal.firstName',
  'additional-name': 'personal.middleName',
  'family-name': 'personal.lastName',
  email: 'personal.email',
  tel: 'personal.phone',
  'address-line1': 'personal.address.line1',
  'address-line2': 'personal.address.line2',
  'address-level2': 'personal.address.city',
  'address-level1': 'personal.address.state',
  'postal-code': 'personal.address.zip',
  'country-name': 'personal.address.country',
  url: 'links.website',
};
```

```ts
// src/core/engine/heuristic.ts
import type { DetectedField } from '../types';
import type { ProfileKey } from '../profile.schema';
import { SYNONYMS, AUTOCOMPLETE_MAP } from './synonyms';

const WEIGHTS = {
  autocomplete: 1.0,
  label: 0.9,
  ariaLabel: 0.85,
  name: 0.7,
  id: 0.6,
  placeholder: 0.6,
  nearbyText: 0.4,
} as const;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function matchField(field: DetectedField): { key: ProfileKey | null; confidence: number } {
  const s = field.signals;

  // 1) autocomplete is authoritative when present
  if (s.autocomplete && AUTOCOMPLETE_MAP[s.autocomplete]) {
    return { key: AUTOCOMPLETE_MAP[s.autocomplete], confidence: 0.98 };
  }

  const haystacks: [keyof typeof WEIGHTS, string][] = [
    ['label', norm(s.label)],
    ['ariaLabel', norm(s.ariaLabel)],
    ['name', norm(s.name)],
    ['id', norm(s.id)],
    ['placeholder', norm(s.placeholder)],
    ['nearbyText', norm(s.nearbyText)],
  ];

  let best: { key: ProfileKey | null; confidence: number } = { key: null, confidence: 0 };

  for (const [key, syns] of Object.entries(SYNONYMS) as [ProfileKey, string[]][]) {
    let score = 0;
    for (const [src, text] of haystacks) {
      if (!text) continue;
      for (const syn of syns) {
        if (text === syn)
          score = Math.max(score, WEIGHTS[src]); // exact
        else if (text.includes(syn)) score = Math.max(score, WEIGHTS[src] * 0.9); // contains
      }
    }
    if (score > best.confidence) best = { key, confidence: score };
  }
  return best;
}
```

### 11.4 Layer 3 — LLM fallback

Anything below the confidence threshold, plus all free-text questions, goes to the LLM (called only from the background worker — §16, §19). Two jobs: (a) "which `ProfileKey` is this field?" for ambiguous structured fields, (b) "draft an answer from the résumé/profile" for open questions like _"Why do you want to work here?"_ Always check the **answer bank** (§20) before calling the LLM.

### 11.5 The orchestrator

```ts
// src/core/engine/resolve.ts   (runs in the content script)
import { detectFields } from './detect';
import { matchField } from './heuristic';
import { matchAdapter } from './adapters';
import { getProfile } from '../storage/profileStore';
import { valueForKey } from './values'; // STUB: read dot-path off the profile
import type { DetectedField } from '../types';

export async function resolveAll(): Promise<{ fields: DetectedField[]; adapterId: string | null }> {
  const profile = await getProfile();
  const adapter = matchAdapter(new URL(location.href), document);

  // 1) detection: adapter-specific if available, else generic
  let fields = adapter?.detectFields ? adapter.detectFields(document) : detectFields();

  // 2) mapping + value resolution
  for (const f of fields) {
    // adapter may have pre-mapped during detection; respect a confident mapping
    if (!f.mappedKey || f.confidence < (profile.settings.confidenceThreshold ?? 0.6)) {
      const m = matchField(f);
      if (m.confidence >= (f.confidence ?? 0)) {
        f.mappedKey = m.key;
        f.confidence = m.confidence;
        f.source = 'heuristic';
      }
    } else {
      f.source = 'adapter';
    }
    if (f.mappedKey) {
      const v = valueForKey(profile, f.mappedKey, f);
      if (v != null) f.value = v;
    }
  }

  // 3) low-confidence + free-text fields are returned unresolved;
  //    the side panel asks the background for LLM mapping/drafting,
  //    then sends back ResolvedFill[] via the FILL message.
  return { fields, adapterId: adapter?.id ?? null };
}
```

---

## 12. Fill primitives (the DOM-reality layer)

These functions are why the extension works on real sites instead of mysteriously not working. Treat them as the foundation.

### 12.1 The React value trap — the single most important function

Most modern ATSes are React apps. `input.value = "x"` sets the DOM property but **does not** notify React, so the value silently reverts on submit. You must call the native setter and dispatch real events. **REFERENCE — use verbatim:**

```ts
// src/core/engine/fill.ts
export function setReactInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true })); // some validators run on blur
}
```

### 12.2 Native `<select>`

```ts
export function setNativeSelect(el: HTMLSelectElement, value: string): boolean {
  const target = norm(value);
  const match = Array.from(el.options).find(
    (o) =>
      norm(o.text) === target ||
      norm(o.value) === target ||
      norm(o.text).includes(target) ||
      target.includes(norm(o.text)),
  );
  if (!match) return false;
  el.value = match.value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
const norm = (s: string) => s.toLowerCase().trim();
```

### 12.3 Custom dropdowns (div comboboxes)

Can't set a value — open, optionally type to filter, click the matching option by text. The generic version below works for many React-Select/Downshift widgets; adapters override for their specifics. **REFERENCE:**

```ts
export async function setCustomDropdown(
  trigger: HTMLElement,
  value: string,
  opts: { optionSelector?: string; typeToFilter?: boolean } = {},
): Promise<boolean> {
  const optionSelector = opts.optionSelector ?? '[role=option], [class*=option], li[id*=option]';
  trigger.click(); // open
  trigger.focus();
  await sleep(120);

  if (opts.typeToFilter !== false) {
    const search = document.querySelector<HTMLInputElement>(
      'input[role=combobox], input[aria-autocomplete=list], [class*=menu] input',
    );
    if (search) {
      setReactInputValue(search, value);
      await sleep(180);
    }
  }

  const target = value.toLowerCase().trim();
  const options = Array.from(document.querySelectorAll<HTMLElement>(optionSelector)).filter(
    (o) => o.offsetParent !== null,
  ); // visible only
  const hit =
    options.find((o) => o.textContent!.toLowerCase().trim() === target) ??
    options.find((o) => o.textContent!.toLowerCase().includes(target));
  if (!hit) {
    trigger.click();
    return false;
  } // close, report miss
  hit.click();
  await sleep(80);
  return true;
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
```

### 12.4 Checkbox & radio group

```ts
export function setCheckbox(el: HTMLInputElement, checked: boolean): void {
  if (el.checked !== checked) el.click(); // click drives React + fires change
}

export function setRadioGroup(name: string, value: string): boolean {
  const radios = document.querySelectorAll<HTMLInputElement>(
    `input[type=radio][name="${CSS.escape(name)}"]`,
  );
  const target = value.toLowerCase().trim();
  for (const r of radios) {
    const lbl = r.id
      ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`)
      : r.closest('label');
    const text = (lbl?.textContent ?? r.value).toLowerCase().trim();
    if (text === target || text.includes(target) || r.value.toLowerCase() === target) {
      r.click();
      return true;
    }
  }
  return false;
}
```

### 12.5 File upload (resume) — the DataTransfer trick

A file input can't be given a path, but you can inject a `File` via `DataTransfer`. The content script receives bytes over messaging (§10) and reconstructs the `File`. **REFERENCE:**

```ts
export function attachFile(input: HTMLInputElement, file: File): void {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// For drag-and-drop zones (Greenhouse and others) that don't expose a file input:
export function dropFileOnZone(zone: HTMLElement, file: File): void {
  const dt = new DataTransfer();
  dt.items.add(file);
  for (const type of ['dragenter', 'dragover', 'drop'] as const) {
    const ev = new DragEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    zone.dispatchEvent(ev);
  }
}

// Reconstruct a File from a base64 FILL_FILE message:
export function fileFromB64(b64: string, name: string, mime: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}
```

### 12.6 Date fields

```ts
export function setDate(el: HTMLInputElement, isoOrYmd: string): void {
  // native date input wants YYYY-MM-DD; many custom ones want typed text.
  if (el.type === 'date' || el.type === 'month') {
    setReactInputValue(el, isoOrYmd);
  } else {
    setReactInputValue(el, isoOrYmd); // adapters override for masked/segmented date UIs
  }
}
```

### 12.7 The dispatcher

```ts
// src/core/engine/fill.ts (continued)
import type { DetectedField } from '../types';

export async function fillOne(field: DetectedField, file?: File): Promise<void> {
  const el = document.querySelector<HTMLElement>(`[data-oca-uid="${field.uid}"]`);
  if (!el) throw new Error('element gone (re-render?)');

  switch (field.kind) {
    case 'text':
    case 'email':
    case 'tel':
    case 'url':
    case 'number':
    case 'textarea':
      setReactInputValue(el as HTMLInputElement, field.value ?? '');
      break;
    case 'select-native':
      if (!setNativeSelect(el as HTMLSelectElement, field.value ?? ''))
        throw new Error('no option matched');
      break;
    case 'select-custom':
      if (!(await setCustomDropdown(el, field.value ?? ''))) throw new Error('no option matched');
      break;
    case 'checkbox':
      setCheckbox(
        el as HTMLInputElement,
        ['yes', 'true', '1', 'on'].includes((field.value ?? '').toLowerCase()),
      );
      break;
    case 'radio-group':
      if (!setRadioGroup(field.signals.name, field.value ?? ''))
        throw new Error('no radio matched');
      break;
    case 'date':
      setDate(el as HTMLInputElement, field.value ?? '');
      break;
    case 'file':
      if (file) attachFile(el as HTMLInputElement, file);
      break;
    default:
      throw new Error(`unhandled kind ${field.kind}`);
  }
}
```

---

## 13. Multi-step wizard state machine

Workday and other multi-page flows need a loop that fills the current step, clicks Next, **waits for the next step to actually render**, and repeats until review. Never click final submit.

**REFERENCE — DOM-settle wait (MutationObserver, debounced, with timeout):**

```ts
// src/core/engine/wizard.ts
export function waitForDomSettle(
  opts: { quietMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  const quietMs = opts.quietMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? 8000;
  return new Promise((resolve) => {
    let quietTimer: number;
    const obs = new MutationObserver(() => {
      clearTimeout(quietTimer);
      quietTimer = window.setTimeout(done, quietMs);
    });
    const done = () => {
      obs.disconnect();
      clearTimeout(hardTimer);
      resolve();
    };
    const hardTimer = window.setTimeout(done, timeoutMs);
    quietTimer = window.setTimeout(done, quietMs);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}
```

**REFERENCE — wizard runner (uses the adapter's step helpers):**

```ts
// src/core/engine/wizard.ts (continued)
import type { SiteAdapter } from './adapters/types';
import { resolveAll } from './resolve';
import { fillOne } from './fill';
import { waitForDomSettle } from './wizard';

export async function runWizard(
  adapter: SiteAdapter,
  emitStatus: (s: any) => void,
  fillStep: () => Promise<void>, // fills the currently-rendered step
  maxSteps = 15,
): Promise<void> {
  for (let step = 0; step < maxSteps; step++) {
    if (adapter.isReviewStep?.(document)) {
      emitStatus({ phase: 'review', step });
      return;
    }
    emitStatus({ phase: 'filling', step });
    await fillStep();

    const next = adapter.findNextButton?.(document);
    if (!next) {
      emitStatus({ phase: 'review', step });
      return;
    } // no next → treat as end
    next.click();
    await waitForDomSettle();
    emitStatus({ phase: 'ready', step: step + 1 });
  }
  emitStatus({ phase: 'error', message: 'exceeded max steps' });
}
```

The content script wires `fillStep` to: re-run `resolveAll()` for the new step, send fresh `DETECTED` to the side panel, wait for the user's confirm (or auto-fill if `settings.autoAdvanceWizard`), then `fillOne` each field.

---

## 14. Site adapters

### 14.1 The interface

```ts
// src/core/engine/adapters/types.ts
import type { DetectedField } from '../../types';

export interface SiteAdapter {
  id: string; // 'greenhouse', 'lever', …
  /** Return true if this adapter handles the current page. */
  matches(url: URL, doc: Document): boolean;
  /** Optional adapter-specific detection. If omitted, the generic detector is used. */
  detectFields?(doc: Document): DetectedField[];
  /** Optional per-field fill override for tricky custom controls. Return true if handled. */
  fillField?(field: DetectedField, value: string): Promise<boolean>;

  // --- multi-step support (Workday, iCIMS, SF, Oracle) ---
  isMultiStep?(doc: Document): boolean;
  isReviewStep?(doc: Document): boolean;
  findNextButton?(doc: Document): HTMLElement | null;
  findSubmitButton?(doc: Document): HTMLElement | null;
}
```

### 14.2 Registry

```ts
// src/core/engine/adapters/index.ts
import type { SiteAdapter } from './types';
import { greenhouse } from './greenhouse';
import { lever } from './lever';
import { workable } from './workable';
import { ashby } from './ashby';
import { smartrecruiters } from './smartrecruiters';
import { jazzhr } from './jazzhr';
import { workday } from './workday';
import { icims } from './icims';
import { successfactors } from './successfactors';
import { oracle } from './oracle';

// order matters: most specific first
const ADAPTERS: SiteAdapter[] = [
  greenhouse,
  lever,
  workable,
  ashby,
  smartrecruiters,
  jazzhr,
  workday,
  icims,
  successfactors,
  oracle,
];

export function matchAdapter(url: URL, doc: Document): SiteAdapter | null {
  return (
    ADAPTERS.find((a) => {
      try {
        return a.matches(url, doc);
      } catch {
        return false;
      }
    }) ?? null
  );
}
```

### 14.3 Greenhouse — full reference adapter (start here)

Greenhouse application forms have stable, semantic IDs. Two surfaces exist: the **embedded** form (`grnhse_app` iframe / `boards.greenhouse.io` host) and the newer **job-boards** hosted form. Detect the host, map the canonical fields, leave custom questions for heuristics/LLM. **REFERENCE:**

```ts
// src/core/engine/adapters/greenhouse.ts
import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { DetectedField } from '../../types';
import type { ProfileKey } from '../../profile.schema';

// canonical Greenhouse field ids → profile keys
const MAP: Record<string, ProfileKey> = {
  first_name: 'personal.firstName',
  last_name: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  // common custom-link question ids vary; heuristics catch LinkedIn/website.
};

export const greenhouse: SiteAdapter = {
  id: 'greenhouse',

  matches(url, doc) {
    return (
      /greenhouse\.io|boards\.greenhouse|job-boards\.greenhouse/.test(url.hostname) ||
      !!doc.querySelector('#grnhse_app, form[action*="greenhouse"], #application_form')
    );
  },

  detectFields(doc) {
    const fields: DetectedField[] = detectFields(doc); // generic pass first
    // upgrade confidence/mapping for known ids
    for (const f of fields) {
      const key = MAP[f.signals.id];
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.99;
        f.source = 'adapter';
      }
    }
    return fields;
  },

  async fillField(field, _value) {
    // Greenhouse resume is a drag-zone with a hidden input near #resume / "Attach"
    if (field.mappedKey === 'documents.resume') {
      // handled by attachFile/dropFileOnZone in the content script; nothing special here
      return false;
    }
    return false; // fall back to default dispatcher for everything else
  },
};
```

> **Greenhouse resume specifics:** the upload control is usually a button labeled _Attach_ plus a hidden `input[type=file]`. Find it with `input[type=file]` inside the resume section; if absent, locate the dropzone (`[id*=resume] [class*=dropzone], [data-field=resume]`) and use `dropFileOnZone`. Verify both paths against `tests/fixtures/greenhouse.html`.

### 14.4 Lever — full reference adapter

Lever postings (`jobs.lever.co/<company>/<id>`) use `name`-attribute fields. **REFERENCE:**

```ts
// src/core/engine/adapters/lever.ts
import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

const NAME_MAP: Record<string, ProfileKey> = {
  name: 'personal.firstName', // Lever uses a single "Full name" → see note
  email: 'personal.email',
  phone: 'personal.phone',
  org: 'experience', // "Current company" — handled specially
  'urls[LinkedIn]': 'links.linkedin',
  'urls[GitHub]': 'links.github',
  'urls[Portfolio]': 'links.portfolio',
  'urls[Other]': 'links.website',
  resume: 'documents.resume',
};

export const lever: SiteAdapter = {
  id: 'lever',

  matches(url, doc) {
    return (
      /jobs\.lever\.co|lever\.co/.test(url.hostname) ||
      !!doc.querySelector('form[action*="lever"], .application-form[data-qa]')
    );
  },

  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const key = NAME_MAP[f.signals.name];
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.97;
        f.source = 'adapter';
      }
    }
    return fields;
  },
};
```

> **Lever "Full name" note:** Lever's primary field is a single full-name input (`name="name"`), not first/last. Special-case it: when filling `name="name"`, write `${firstName} ${lastName}`. Add a small `composedValue` hook in the content script for fields whose `mappedKey` is `personal.firstName` but whose `signals.name === 'name'`.

### 14.5 Workday — the boss fight (dedicated adapter)

Workday (`*.myworkdayjobs.com`, `*.wd1/.wd3/.wd5.myworkdayjobs.com`) is a thick SPA: custom widgets, **auto-generated unstable element IDs**, `data-automation-id` attributes (the one stable hook), occasional iframes, multi-page wizard, aggressive async rendering. Strategy:

- **Match:** `/myworkdayjobs\.com|\.wd\d\./`.
- **Use `data-automation-id`,** never generated `id`s. Examples seen in the wild: `legalNameSection_firstName`, `legalNameSection_lastName`, `email`, `phone-number`, `addressSection_*`, `sourcePrompt`, `bottom-navigation-next-button`. **Verify against a live page — these drift.**
- **Custom dropdowns** are button + popup; use `setCustomDropdown` with a Workday-specific `optionSelector` (`[role=option], [data-automation-id*=promptOption]`).
- **Multi-step:** implement `isReviewStep` (look for a "Review" heading / Submit button present) and `findNextButton` (`[data-automation-id*=bottom-navigation-next-button], button:contains("Save and Continue")`). Use `waitForDomSettle` between steps.
- **Do not gate launch on Workday.** Ship Greenhouse/Lever first.

```ts
// src/core/engine/adapters/workday.ts   — STUB: fill selectors against a live page
import type { SiteAdapter } from './types';
import { detectFields } from '../detect';

const DA = (doc: Document, id: string) =>
  doc.querySelector<HTMLElement>(`[data-automation-id="${id}"]`);

export const workday: SiteAdapter = {
  id: 'workday',
  matches(url) {
    return /myworkdayjobs\.com|\.wd\d\./.test(url.hostname);
  },
  detectFields(doc) {
    /* map known data-automation-ids; fall back to generic */ return detectFields(doc);
  },
  isMultiStep() {
    return true;
  },
  isReviewStep(doc) {
    return !!doc.querySelector(
      '[data-automation-id*=reviewSubmit], h2:has(+ * [data-automation-id*=submit])',
    );
  },
  findNextButton(doc) {
    return (
      DA(doc, 'bottom-navigation-next-button') ??
      Array.from(doc.querySelectorAll('button')).find((b) =>
        /save and continue|continue|next/i.test(b.textContent ?? ''),
      ) ??
      null
    );
  },
  findSubmitButton(doc) {
    return (
      Array.from(doc.querySelectorAll('button')).find((b) =>
        /^submit$/i.test((b.textContent ?? '').trim()),
      ) ?? null
    );
  },
};
```

### 14.6 Remaining adapters — match rules & notes (STUBs)

Implement each against a live page + a saved fixture. Difficulty and the key hook for each:

| Adapter                  | Host match                                                | Difficulty    | Key hook / note                                                                                                                                 |
| ------------------------ | --------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **workable**             | `apply.workable.com`, `workable.com`                      | Moderate      | Mostly native inputs with `name`/`aria-label`; resume is a clear file input.                                                                    |
| **ashby**                | `jobs.ashbyhq.com`                                        | Moderate      | React; stable-ish `name`s; custom selects need `setCustomDropdown`.                                                                             |
| **smartrecruiters**      | `jobs.smartrecruiters.com`, `careers.smartrecruiters.com` | Moderate      | Sectioned form; `data-test` attributes are the stable hook.                                                                                     |
| **jazzhr**               | `app.jazz.co`, `*.applytojob.com`                         | Easy–Moderate | Classic server-rendered forms; `name`/`id` reliable.                                                                                            |
| **icims**                | `*.icims.com`                                             | Hard          | Often inside an iframe (`#icims_content_iframe`); multi-page; dated markup. Content script must run in the iframe — declare `all_frames: true`. |
| **successfactors**       | `*.successfactors.com`, `career*.sapsf.com`               | Hard          | Heavy SAP UI5 controls; ids are generated; match on labels + UI5 roles. Multi-step.                                                             |
| **oracle** (Taleo / ORC) | `*.taleo.net`, `*.oraclecloud.com/hcmUI`                  | Hard          | Two distinct products. Taleo = legacy multi-page; ORC = ADF/Redwood SPA. Separate code paths inside the adapter. Multi-step.                    |

For iCIMS specifically, set `all_frames: true` in the content-script entrypoint (§15) so the script runs inside `#icims_content_iframe`.

---

## 15. The content script

WXT declares content scripts in the entrypoint file. This script listens for messages, runs detection/fill, and drives the wizard. **REFERENCE (structure) + STUB (handlers):**

```ts
// src/entrypoints/content.ts
import { defineContentScript } from 'wxt/sandbox';
import { resolveAll } from '@/core/engine/resolve';
import { fillOne, fileFromB64, dropFileOnZone, attachFile } from '@/core/engine/fill';
import { matchAdapter } from '@/core/engine/adapters';
import { runWizard } from '@/core/engine/wizard';
import type { ToContent, FromContent, ResolvedFill } from '@/core/messages';
import type { DetectedField } from '@/core/types';

export default defineContentScript({
  matches: ['https://*/*'], // broad in dev; narrow before publishing (see §7/§21)
  allFrames: true, // needed for iCIMS and other iframe-embedded forms
  runAt: 'document_idle',

  main() {
    let lastFields: DetectedField[] = [];
    let pendingFile: File | null = null;

    chrome.runtime.onMessage.addListener((msg: ToContent, _sender, sendResponse) => {
      (async () => {
        switch (msg.type) {
          case 'PING':
            sendResponse({ type: 'PONG' } satisfies FromContent);
            break;

          case 'DETECT': {
            const { fields, adapterId } = await resolveAll();
            lastFields = fields;
            sendResponse({ type: 'DETECTED', fields, adapterId } satisfies FromContent);
            break;
          }

          case 'FILL_FILE': {
            pendingFile = fileFromB64(msg.b64, msg.filename, msg.mime);
            // attach immediately to the matching field
            const f = lastFields.find((x) => x.uid === msg.uid);
            if (f) {
              const el = document.querySelector<HTMLElement>(`[data-oca-uid="${f.uid}"]`);
              if (el instanceof HTMLInputElement && el.type === 'file') attachFile(el, pendingFile);
              else if (el) dropFileOnZone(el, pendingFile);
            }
            sendResponse({ type: 'FIELD_FILLED', uid: msg.uid, ok: true } satisfies FromContent);
            break;
          }

          case 'FILL': {
            await fillMany(msg.fields, lastFields, pendingFile, sendResponse);
            break;
          }

          case 'WIZARD_RUN': {
            const adapter = matchAdapter(new URL(location.href), document);
            if (!adapter) {
              sendResponse({ type: 'STATUS', status: { phase: 'error', message: 'no adapter' } });
              break;
            }
            await runWizard(
              adapter,
              (status) =>
                chrome.runtime.sendMessage({ type: 'STATUS', status } satisfies FromContent),
              async () => {
                // fillStep
                const { fields } = await resolveAll();
                lastFields = fields;
                chrome.runtime.sendMessage({
                  type: 'DETECTED',
                  fields,
                  adapterId: adapter.id,
                } satisfies FromContent);
                for (const f of fields.filter((x) => x.value != null)) {
                  try {
                    await fillOne(f, pendingFile ?? undefined);
                  } catch {
                    /* report */
                  }
                }
              },
            );
            sendResponse({ type: 'STATUS', status: { phase: 'idle' } });
            break;
          }
        }
      })();
      return true; // keep channel open for async sendResponse
    });
  },
});

async function fillMany(
  resolved: ResolvedFill[],
  fields: DetectedField[],
  file: File | null,
  sendResponse: (r: FromContent) => void,
) {
  for (const r of resolved) {
    const f = fields.find((x) => x.uid === r.uid);
    if (!f) continue;
    f.value = r.value;
    try {
      await fillOne(f, file ?? undefined);
      chrome.runtime.sendMessage({
        type: 'FIELD_FILLED',
        uid: r.uid,
        ok: true,
      } satisfies FromContent);
    } catch (e) {
      chrome.runtime.sendMessage({
        type: 'FIELD_FILLED',
        uid: r.uid,
        ok: false,
        error: String(e),
      } satisfies FromContent);
    }
  }
  sendResponse({ type: 'STATUS', status: { phase: 'idle' } } as any);
}
```

---

## 16. The background service worker

Orchestrator + the **only** context that talks to the LLM (so API keys never enter a web page). Also wires the toolbar icon to open the side panel. **REFERENCE + STUB:**

```ts
// src/entrypoints/background.ts
import { defineBackground } from 'wxt/sandbox';
import { getProfile } from '@/core/storage/profileStore';
import { mapFieldsWithLLM, draftAnswerWithLLM } from '@/core/llm/client';
import type { ToBackground, FromBackground } from '@/core/messages';

export default defineBackground(() => {
  // open side panel when the toolbar icon is clicked
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  chrome.runtime.onMessage.addListener((msg: ToBackground, _sender, sendResponse) => {
    (async () => {
      switch (msg.type) {
        case 'GET_PROFILE': {
          const profile = await getProfile();
          sendResponse({ type: 'PROFILE', profile } satisfies FromBackground);
          break;
        }
        case 'LLM_MAP_FIELDS': {
          const profile = await getProfile();
          const mappings = profile.settings.llmEnabled
            ? await mapFieldsWithLLM(msg.unresolved, profile)
            : [];
          sendResponse({ type: 'LLM_MAP_RESULT', mappings } satisfies FromBackground);
          break;
        }
        case 'LLM_DRAFT_ANSWER': {
          const profile = await getProfile();
          const answer = profile.settings.llmEnabled
            ? await draftAnswerWithLLM(msg.question, profile)
            : '';
          sendResponse({ type: 'LLM_DRAFT_RESULT', uid: msg.uid, answer } satisfies FromBackground);
          break;
        }
      }
    })();
    return true;
  });
});
```

---

## 17. The side panel UI

The review surface. Stays pinned beside the form. Component tree:

```
App
├── StatusBar         (wizard phase, step x/y, adapter name)
├── ReviewTable
│   └── FieldRow[]    (label · detected value · source badge · editable input · ✓/✗)
└── FillButton        (Fill all · Next step · Run to review)
```

**Behavior spec:**

- On open, resolve active tab, send `PING`; if `PONG`, send `DETECT`.
- Render each `DetectedField` as a row: left = label (+ required asterisk), middle = the value input (text/select/checkbox mirror of the real control), right = a **source badge** (`adapter` green · `heuristic` blue · `llm` purple · `answerBank` teal · `none` grey) and a confidence dot.
- Rows with `mappedKey === null` or `confidence < threshold` are highlighted "needs review" and sorted to the top.
- Editing a row's value sets `source = 'manual'` and confidence 1.0.
- For free-text/unmapped fields, show a **"Draft with AI"** button → `LLM_DRAFT_ANSWER` → fills the row; user can save it to the answer bank.
- **Fill all** sends `FILL` with every row that has a value; resume goes first as `FILL_FILE`.
- For multi-step, show **Next step** (one step) and **Run to review** (auto-advance). Disable submit; show a banner: _"Review on the page and submit yourself."_

**REFERENCE (entry):**

```tsx
// src/entrypoints/sidepanel/App.tsx
import { useEffect, useState } from 'react';
import type { DetectedField } from '@/core/types';
import type { FromContent, ToContent, ResolvedFill } from '@/core/messages';
import { ReviewTable } from './components/ReviewTable';
import { StatusBar } from './components/StatusBar';
import { getFile } from '@/core/storage/blobStore';
import { getProfile } from '@/core/storage/profileStore';

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab.id!;
}
const send = async (msg: ToContent) =>
  chrome.tabs.sendMessage(await activeTabId(), msg) as Promise<FromContent>;

export function App() {
  const [fields, setFields] = useState<DetectedField[]>([]);
  const [adapterId, setAdapterId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const detect = async () => {
    setBusy(true);
    const res = await send({ type: 'DETECT' });
    if (res.type === 'DETECTED') {
      setFields(res.fields);
      setAdapterId(res.adapterId);
    }
    setBusy(false);
  };

  useEffect(() => {
    detect();
  }, []);

  const fillAll = async () => {
    setBusy(true);
    const profile = await getProfile();

    // 1) resume first
    const resumeField = fields.find((f) => f.mappedKey === 'documents.resume');
    if (resumeField && profile.documents.resumeBlobId) {
      const file = await getFile(profile.documents.resumeBlobId);
      if (file) {
        const b64 = await fileToB64(file);
        await send({
          type: 'FILL_FILE',
          uid: resumeField.uid,
          filename: file.name,
          mime: file.type,
          b64,
        });
      }
    }
    // 2) everything else with a value
    const resolved: ResolvedFill[] = fields
      .filter((f) => f.value != null && f.mappedKey !== 'documents.resume')
      .map((f) => ({ uid: f.uid, value: f.value! }));
    await send({ type: 'FILL', fields: resolved });
    setBusy(false);
  };

  return (
    <div className="flex h-screen flex-col bg-white text-sm">
      <StatusBar adapterId={adapterId} busy={busy} onRedetect={detect} />
      <ReviewTable fields={fields} onChange={setFields} />
      <div className="border-t p-3 space-y-2">
        <button
          onClick={fillAll}
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white disabled:opacity-50"
        >
          Fill all
        </button>
        {adapterId && (
          <div className="flex gap-2">
            <button
              onClick={() => send({ type: 'WIZARD_NEXT' })}
              className="flex-1 rounded-lg border py-2"
            >
              Next step
            </button>
            <button
              onClick={() => send({ type: 'WIZARD_RUN' })}
              className="flex-1 rounded-lg border py-2"
            >
              Run to review
            </button>
          </div>
        )}
        <p className="text-xs text-amber-700">Review on the page and submit yourself.</p>
      </div>
    </div>
  );
}

async function fileToB64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fileToB64Compat() {} // STUB: for very large files, chunk to avoid call-stack limits
```

`ReviewTable`/`FieldRow`/`StatusBar` are STUBs — build against the behavior spec above and the `DetectedField` shape.

---

## 18. The options page UI

The master profile editor. Each section maps to a slice of the schema and validates on save with Zod. Tabs/accordion:

- **Personal** — name, email, phone, address.
- **Links** — LinkedIn / GitHub / portfolio / website.
- **Work authorization** — authorized / sponsorship / visa toggles.
- **EEO (voluntary)** — gender/race/veteran/disability, each defaulting to "decline to self-identify"; a one-line note that these are optional.
- **Experience** — repeatable rows (title, company, dates, current toggle, description); add/remove/reorder.
- **Education** — repeatable rows.
- **Skills** — tag input.
- **Documents** — drag-drop resume + cover letter → `putBlob`, store `resumeBlobId`/filename in profile; show current file with replace/remove.
- **Answer bank** — list of `{questionPattern, answer, tags}`; add/edit/delete; this is also where "Save this answer" lands from the side panel.
- **Settings** — `llmEnabled`, `autoAdvanceWizard`, `confidenceThreshold` slider, LLM API key field (stored in `chrome.storage.local`, never synced).
- **Import / Export** — dump/load profile JSON (validate with `ProfileSchema` on import). Useful for backup and for seeding from a résumé parse.

**Form pattern (REFERENCE):** keep a working draft in local state, validate the whole `Profile` with `ProfileSchema.safeParse` on save, surface field errors inline, call `saveProfile` only when valid. Autosave-on-blur per section is a nice-to-have.

```tsx
// src/entrypoints/options/App.tsx  (shape)
import { useEffect, useState } from 'react';
import { getProfile, saveProfile } from '@/core/storage/profileStore';
import { ProfileSchema, type Profile } from '@/core/profile.schema';

export function App() {
  const [draft, setDraft] = useState<Profile | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    getProfile().then(setDraft);
  }, []);
  if (!draft) return null;

  const save = async () => {
    const res = ProfileSchema.safeParse(draft);
    if (!res.success) {
      setErrors(res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
      return;
    }
    setErrors([]);
    await saveProfile(res.data);
  };
  // render <PersonalSection draft={draft} onChange={setDraft} /> … then a Save button
  return null; // STUB
}
```

---

## 19. LLM integration

Called **only** from the background worker. Two jobs: field mapping and answer drafting. Use Claude's Messages API. Force JSON-only output for mapping; parse defensively. Store the key in `chrome.storage.local`.

> Better than embedding a key in the extension: run a tiny serverless proxy (Vercel/Cloudflare Worker) that holds the key and exposes `/map` and `/draft`. The extension calls your proxy. For a personal tool, an in-extension key is acceptable to start; the code below supports both via a configurable base URL.

**REFERENCE — prompts:**

```ts
// src/core/llm/prompts.ts
import type { ProfileKey } from '../profile.schema';

export const PROFILE_KEYS: ProfileKey[] = [
  'personal.firstName',
  'personal.middleName',
  'personal.lastName',
  'personal.preferredName',
  'personal.email',
  'personal.phone',
  'personal.address.line1',
  'personal.address.line2',
  'personal.address.city',
  'personal.address.state',
  'personal.address.zip',
  'personal.address.country',
  'links.linkedin',
  'links.github',
  'links.portfolio',
  'links.website',
  'workAuth.authorizedToWork',
  'workAuth.needsSponsorship',
  'workAuth.requiresVisa',
  'eeo.gender',
  'eeo.race',
  'eeo.hispanicLatino',
  'eeo.veteranStatus',
  'eeo.disabilityStatus',
  'documents.resume',
  'documents.coverLetter',
  'skills',
  'freeText',
];

export function mappingSystemPrompt(): string {
  return [
    'You map web form fields to profile keys for a job-application autofill tool.',
    'You will receive an array of fields (each with a label and HTML attributes).',
    `Valid keys: ${PROFILE_KEYS.join(', ')}.`,
    'Use "freeText" for open questions (e.g. "why do you want to work here").',
    'Use null if no key fits.',
    'Respond with ONLY a JSON array, no prose, no markdown fences:',
    '[{"uid":"...","key":"personal.firstName"|null,"confidence":0.0-1.0}]',
  ].join('\n');
}

export function draftSystemPrompt(): string {
  return [
    'You draft concise, professional answers to job-application free-text questions,',
    'in the first person, grounded ONLY in the provided candidate profile.',
    'Do not invent facts not present in the profile. 2–5 sentences unless the question implies otherwise.',
    'Respond with ONLY the answer text.',
  ].join('\n');
}
```

**REFERENCE — client (background context):**

````ts
// src/core/llm/client.ts
import type { Profile } from '../profile.schema';
import { mappingSystemPrompt, draftSystemPrompt } from './prompts';

const MODEL = 'claude-sonnet-4-6';

async function getKeyAndBase(): Promise<{ key: string; base: string }> {
  const { llmApiKey = '', llmBaseUrl = 'https://api.anthropic.com' } =
    await chrome.storage.local.get(['llmApiKey', 'llmBaseUrl']);
  return { key: llmApiKey, base: llmBaseUrl };
}

async function callClaude(system: string, user: string, maxTokens = 1024): Promise<string> {
  const { key, base } = await getKeyAndBase();
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const data = await res.json();
  return (data.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');
}

export async function mapFieldsWithLLM(
  unresolved: { uid: string; signals: unknown }[],
  _profile: Profile,
): Promise<{ uid: string; key: string | null; confidence: number }[]> {
  if (!unresolved.length) return [];
  const text = await callClaude(mappingSystemPrompt(), JSON.stringify(unresolved));
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

export async function draftAnswerWithLLM(question: string, profile: Profile): Promise<string> {
  const ctx = {
    name: `${profile.personal.firstName} ${profile.personal.lastName}`,
    skills: profile.skills,
    experience: profile.experience.map((e) => ({
      title: e.title,
      company: e.company,
      summary: e.description,
    })),
    education: profile.education.map((e) => ({
      degree: e.degree,
      field: e.field,
      school: e.school,
    })),
  };
  return callClaude(
    draftSystemPrompt(),
    `QUESTION: ${question}\n\nCANDIDATE PROFILE:\n${JSON.stringify(ctx)}`,
  );
}
````

> The MV3 service worker can `fetch` cross-origin to your LLM/proxy host. Add that host to `host_permissions` (e.g. `https://api.anthropic.com/*` or your proxy domain).

---

## 20. The answer bank

The feature that makes the tool feel smart over time. Before any LLM draft, check whether a saved answer matches the question; reuse it. Saved answers are editable in options and savable from the side panel.

**REFERENCE — fuzzy match:**

```ts
// src/core/llm/answerBank.ts
import type { SavedAnswer } from '../profile.schema';

const tokenize = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

export function findAnswer(question: string, bank: SavedAnswer[], min = 0.5): SavedAnswer | null {
  const q = tokenize(question);
  let best: { ans: SavedAnswer; score: number } | null = null;
  for (const a of bank) {
    const score = jaccard(q, tokenize(a.questionPattern));
    if (!best || score > best.score) best = { ans: a, score };
  }
  return best && best.score >= min ? best.ans : null;
}
```

Resolution order for a free-text field: **answer bank → LLM draft → leave blank + flag.** When the user accepts/edits an LLM draft, offer "Save to answer bank" so the next occurrence is instant.

---

## 21. Permissions, privacy & legal guardrails

**Permissions and why:**

| Permission                      | Why                                | Tighten later?                                                                                                  |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `storage`                       | profile + settings                 | keep                                                                                                            |
| `sidePanel`                     | review surface                     | keep                                                                                                            |
| `activeTab`                     | act on current tab on user gesture | keep                                                                                                            |
| `scripting`                     | on-demand injection (publish path) | keep                                                                                                            |
| `host_permissions: https://*/*` | read/write any career site         | **yes** — enumerate ATS domains, or switch to `activeTab` + `scripting.executeScript` on click for store review |
| `host_permissions: <llm host>`  | background `fetch` to LLM/proxy    | keep (or proxy domain only)                                                                                     |

**Privacy posture (state this in README + store listing):**

- The profile and résumé never leave the browser except: (a) the résumé bytes go to the active job page when the user clicks Fill; (b) field labels + profile context go to the LLM/proxy only when LLM assist is enabled. No analytics, no third-party servers beyond the optional LLM proxy the user configures.
- Store the LLM key in `chrome.storage.local` only; never `sync`.

**Legal / ToS — bake this into the product, not just the docs:**

- The ATS surfaces above are the **employer's own** instance; a human-in-the-loop fill where the user reviews and submits is low risk and consistent with normal browser autofill.
- **LinkedIn and Indeed explicitly prohibit automation** of their flows (including Easy Apply) and actively detect and enforce it; automating them risks account restriction. For v1, **do not** automate LinkedIn/Indeed Easy Apply. If you support them at all, limit to filling fields the user can see and submit manually, and surface a clear warning. The whole point of the tool is to make _your own_ job search easier — losing the account you search from defeats it.
- Never defeat CAPTCHAs or bot checks. The human-in-the-loop design means you never need to.

---

## 22. Build milestones with acceptance criteria

Build strictly in this order. Each milestone is shippable/usable on its own.

**M0 — Scaffold.** WXT + React + TS + Tailwind project builds; loads unpacked; side panel and options pages open.
_Done when:_ `pnpm dev` loads the extension, both pages render, `pnpm compile` is clean.

**M1 — Profile + storage + options.** Full schema, options editor for all sections, résumé upload to Dexie, validation, import/export.
_Done when:_ you can fill out a complete profile, reload the browser, and it persists and re-validates; résumé round-trips through Dexie.

**M2 — Greenhouse + Lever autofill + side-panel review.** Detection, the React setter, native/file fill, the review table, Fill all. (This is the "it's real" moment.)
_Done when:_ on a live Greenhouse and a live Lever posting, one click fills name/email/phone/links and attaches the résumé, values survive a manual submit attempt (no React reversion), and the review table shows correct source badges.

**M3 — Custom dropdowns + Workable, Ashby, SmartRecruiters, JazzHR.** Generic `setCustomDropdown` plus four adapters.
_Done when:_ custom selects (e.g. country, "how did you hear about us") fill on at least Ashby and SmartRecruiters; all four ATSes fill core fields.

**M4 — Wizard state machine + Workday.** `waitForDomSettle`, `runWizard`, Workday adapter.
_Done when:_ on a live Workday application, "Run to review" advances through steps filling each, and **stops at review without submitting**.

**M5 — iCIMS, SuccessFactors, Oracle.** Iframe handling (`all_frames`), the three hard adapters.
_Done when:_ each fills core fields on a live posting; iCIMS works inside its iframe.

**M6 — Generic heuristic matcher hardening.** Tune synonyms/weights against arbitrary company career sites.
_Done when:_ on 5 random non-adapter career sites, ≥70% of standard fields map correctly with no adapter.

**M7 — LLM fallback + answer bank.** Background LLM calls, free-text drafting, answer-bank match + save.
_Done when:_ an unmapped field gets a correct LLM mapping; a "why this company" box gets a reasonable draft from the profile; saving it makes the next identical question instant.

**M8 (optional) — Backend, résumé parsing, sync, analytics.** Serverless LLM proxy; parse uploaded résumé → seed profile; cross-device sync; "applications filled" count.

---

## 23. Testing strategy

- **Unit (Vitest + jsdom):** `heuristic.ts` (synonym matching, weighting, autocomplete priority), `answerBank.ts` (jaccard thresholds), `signals.ts` (label/nearby extraction), `values.ts` (dot-path resolution). These are pure and fast — test them hard; the matcher is the brain.
- **Adapter fixture tests:** save real ATS HTML to `tests/fixtures/*.html`, load into jsdom, run `adapter.detectFields`, assert the canonical fields map with high confidence. Re-capture fixtures when a vendor ships UI changes — failing fixtures are your early-warning system.
- **Fill-primitive tests:** verify `setReactInputValue` dispatches `input`+`change` and that `setNativeSelect`/`setRadioGroup` match by text. (React reversion itself can't be unit-tested in jsdom — verify manually on live sites.)
- **Manual E2E checklist per ATS** (keep in `tests/manual-checklist.md`): name, email, phone, address, links, résumé attach, a custom dropdown, a radio (work auth), a free-text box; for multi-step, full run-to-review without submit.
- **Optional Playwright:** drive a headed browser to a public sandbox posting per ATS for regression. Don't run this against real employers at volume.

---

## 24. Packaging & distribution

- `pnpm zip` → upload to the Chrome Web Store dashboard.
- Provide a privacy policy URL (the privacy posture in §21).
- Justify `host_permissions` in the listing; prefer the narrowed/`activeTab` approach to ease review.
- Icons: 16/32/48/128 px in `public/icons/`.
- Version with semver in `wxt.config.ts`; bump on each release.
- For personal use you can stay on "Load unpacked" indefinitely — no store submission required.

---

## 25. Edge-case & gotcha appendix

The things that bite. A 30-year team keeps this list close.

- **React value reversion** — covered; `setReactInputValue` is mandatory. The #1 cause of "it looked filled but submitted empty."
- **Async rendering** — never `setTimeout` and hope. Use `waitForDomSettle` (MutationObserver). Steps, conditional fields, and async-loaded selects all need it.
- **Iframes** — Greenhouse embedded, iCIMS, some Workday live in iframes. `all_frames: true` runs the content script in each frame; the side panel talks to the top frame, so route fills to the frame that owns the field (each frame runs its own listener; broadcast `DETECT` and merge `DETECTED` from all frames, tagging fields by frame).
- **Shadow DOM** — some widgets bury inputs in shadow roots; `querySelectorAll` won't pierce them. Walk `element.shadowRoot` recursively in detection when present.
- **Custom dropdowns vary wildly** — React-Select, Downshift, MUI, Ant, UI5 each differ. The generic handler covers many; adapters override `optionSelector` and whether typing filters.
- **"Other" text fields** — a select/radio whose "Other" option reveals a text input. After choosing it, re-detect to pick up the newly-rendered field.
- **Conditional fields** — answering one field renders more (e.g. "needs sponsorship?" → "which visa?"). Re-run `resolveAll` after fills that can branch, or detect mutations and append.
- **Phone formatting** — some inputs mask/format on input; set the raw value and dispatch `input` so the mask runs. If a strict mask rejects it, fall back to typing character-by-character (dispatch `keydown`/`input` per char).
- **Date formats** — native `date` wants `YYYY-MM-DD`; segmented/custom date pickers need typed text or clicks. Keep the profile in ISO; convert per adapter.
- **Multi-select / tags (skills)** — add items one at a time: type, Enter (dispatch `keydown` Enter), repeat.
- **Required-field validation** — after fill, some forms show errors only on blur/submit. Dispatch `blur` (already in `setReactInputValue`); surface any visible `.error`/`[aria-invalid]` back to the side panel so the user sees what still needs attention.
- **Résumé that doesn't trigger parse** — some ATSes parse the résumé to prefill, then overwrite your values. Fill **after** the parse settles, or fill, wait, and re-fill anything the parse clobbered. Detect by watching fields change after upload.
- **Generated IDs (Workday)** — never select by `id`; use `data-automation-id` / `data-test` / labels.
- **Schema migrations** — when you change `ProfileSchema`, bump `schemaVersion` and implement `repair()` in `profileStore.ts` to migrate old data instead of wiping it.
- **Large résumé base64** — `btoa(String.fromCharCode(...bytes))` can blow the call stack on big files; chunk the conversion (the `fileToB64Compat` stub).
- **Single full-name fields** (Lever) — compose `first last`; don't leave last name unfilled.
- **EEO defaults** — never guess protected-class answers; default to "decline to self-identify" unless the user explicitly set a value.

---

## 26. Driving Copilot effectively

- Keep this file at the repo root; Copilot uses open files and workspace docs as context.
- Build file-by-file in milestone order. For each file, **paste the relevant interface/contract from this doc as a top-of-file comment**, then write a one-line description of the function you want and let Copilot complete — it will follow the types.
- Implement the **REFERENCE** blocks verbatim first (schema, messages, fill primitives, wizard, Greenhouse/Lever). They're the contracts everything else leans on; getting them exact makes Copilot's completions downstream far more accurate.
- For **STUB** blocks, write the function signature + a comment describing inputs/outputs/edge cases from §25, then accept/refine Copilot's suggestion.
- Write the Vitest tests in §23 early; Copilot writes better implementations when the test is already in the file.
- When an adapter breaks, capture fresh HTML into `tests/fixtures/`, let the fixture test fail, and fix selectors against the new DOM — a tight, repeatable loop.

---

### Suggested first three Copilot sessions

1. **M0+M1:** `wxt.config.ts` → `profile.schema.ts` (verbatim) → `types.ts` → `messages.ts` → `profileStore.ts` + `blobStore.ts` → options sections → verify persistence.
2. **M2 part 1 (engine):** `signals.ts` → `detect.ts` → `synonyms.ts` → `heuristic.ts` → `fill.ts` (verbatim primitives) → `resolve.ts` → `values.ts`.
3. **M2 part 2 (wire-up):** `adapters/types.ts` + `index.ts` → `greenhouse.ts` + `lever.ts` → `content.ts` → `background.ts` → side-panel `App.tsx` + `ReviewTable`/`FieldRow`/`StatusBar` → test on a live Greenhouse posting.

After session 3 you have a working tool for the two easiest ATSes. Everything after widens coverage.
