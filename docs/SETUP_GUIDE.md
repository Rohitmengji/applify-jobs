# OneClick Apply — Installation & Setup Guide

## Prerequisites

- **Google Chrome** (v120+) or any Chromium-based browser (Edge, Brave, Arc)
- **Node.js** v20+ (only if building from source)
- **pnpm** package manager (only if building from source)

---

## Option A: Install from Pre-built Package (Recommended)

1. Download the latest `.zip` from the shared link (provided by your admin).
2. Unzip to a folder on your machine (e.g., `~/Extensions/oneclick-apply`).
3. Open Chrome → navigate to `chrome://extensions`.
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **"Load unpacked"** → select the unzipped folder (the one containing `manifest.json`).
6. The OneClick Apply icon appears in your toolbar. Pin it for quick access.

---

## Option B: Build from Source

```bash
# 1. Clone the repository
git clone <repo-url> oneclick-apply
cd oneclick-apply

# 2. Install dependencies (requires pnpm)
corepack enable
pnpm install

# 3. Build the extension
pnpm build

# 4. Load in Chrome
#    Navigate to chrome://extensions → Enable Developer mode
#    Click "Load unpacked" → select the .output/chrome-mv3 folder
```

---

## First-Time Setup

### Step 1: Open the Options Page

- Click the OneClick Apply icon in your toolbar.
- Or right-click the icon → **Options**.
- Or navigate to `chrome-extension://<extension-id>/options.html`.

### Step 2: Fill Your Profile

Complete at least these sections:

- **Personal** — First name, last name, email, phone
- **Links** — LinkedIn, GitHub, portfolio
- **Work Auth** — Visa status, work authorization
- **Documents** — Upload your résumé (PDF)

### Step 3: Configure AI (Optional)

Go to the **Settings** tab:

1. Toggle **"Enable AI assist"** ON.
2. Your admin may have already configured a shared API key with monthly credits.
3. Check your credit balance in the **Settings** tab under "AI Credits".
4. If you have credits remaining, AI features work automatically.
5. If credits are exhausted, you can add your own API key (see below).

### Step 4: Test It

1. Navigate to any job application page (e.g., a Greenhouse or Lever posting).
2. Click the OneClick Apply icon → the side panel opens.
3. Click **"Detect"** — the extension finds all form fields.
4. Review the mappings, then click **"Fill"**.
5. **You review and submit** — the extension never auto-submits.

---

## AI Credits System

Your admin allocates monthly AI credits to each user:

- **1 credit = 1 AI-assisted action** (field mapping, answer drafting, résumé tailoring, etc.)
- Credits reset on the 1st of each month.
- Check remaining credits: **Settings → AI Credits** section.

### When Credits Run Out

When your monthly credits are exhausted, you have two options:

1. **Wait for next month's reset** (credits renew automatically on the 1st).
2. **Add your own API key** (see the API Key Guide below).

---

## Adding Your Own API Key (When Credits Are Exhausted)

See the full step-by-step guide: [API_KEY_GUIDE.md](./API_KEY_GUIDE.md)

**Quick version:**

1. Go to **Settings** tab in the extension.
2. Under "AI provider", select OpenAI or Anthropic.
3. Paste your API key.
4. That's it — your own key is used for all AI features.

---

## Troubleshooting

| Problem                                | Solution                                                   |
| -------------------------------------- | ---------------------------------------------------------- |
| Extension not showing in toolbar       | Click the puzzle icon → pin OneClick Apply                 |
| "No API key configured" error          | Add your own key in Settings, or contact admin for credits |
| Fields not detected                    | Refresh the page, then click Detect again                  |
| Side panel won't open                  | Right-click toolbar icon → "Open side panel"               |
| Extension disabled after Chrome update | Go to chrome://extensions → re-enable it                   |

---

## Keyboard Shortcut

**Ctrl+Shift+F** (Mac: **Cmd+Shift+F**) — Detect and fill all fields on the current page without opening the panel.

---

## Privacy & Security

- All your data stays **local** on your machine (never sent to any server).
- API keys are stored in Chrome's encrypted local storage.
- The only network call is to the AI provider (OpenAI/Anthropic) when AI features are used.
- The extension **never auto-submits** any form.
