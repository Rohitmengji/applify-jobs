# How to Get & Set Up Your Own AI API Key

When your admin-provided credits are exhausted, you can add your own API key to continue using AI features. This guide walks you through the entire process from scratch.

---

## Option 1: OpenAI (GPT-4o-mini) — Recommended for Beginners

### Step 1: Create an OpenAI Account

1. Go to [https://platform.openai.com/signup](https://platform.openai.com/signup)
2. Sign up with your email, Google, or Microsoft account.
3. Verify your email address.
4. Complete phone verification (required for API access).

### Step 2: Add Payment Method

1. Go to [https://platform.openai.com/account/billing](https://platform.openai.com/account/billing)
2. Click **"Add payment method"**.
3. Enter your credit/debit card details.
4. Set a **monthly spending limit** (recommended: **$5–$10/month** for job applications).
   - Typical usage: $2–$5/month for active job searching.

### Step 3: Create an API Key

1. Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Click **"+ Create new secret key"**.
3. Name it something like `oneclick-apply`.
4. **Important:** Copy the key immediately — you won't be able to see it again!
5. The key looks like: `sk-proj-xxxxxxxxxxxxxxxxxxxx...`

### Step 4: Set a Usage Limit (Protect Your Wallet)

1. Go to [https://platform.openai.com/account/limits](https://platform.openai.com/account/limits)
2. Set **"Monthly budget"** to $5–$10.
3. Set **"Email notification threshold"** to $3.
4. This ensures you NEVER get a surprise bill.

### Step 5: Add the Key to OneClick Apply

1. Open the extension → **Settings** tab.
2. Under "AI provider", select **OpenAI**.
3. Paste your key in the **"API key"** field.
4. Leave "Base URL" empty (uses the default).
5. Done! AI features now use your own key.

---

## Option 2: Anthropic (Claude) — Better Quality Answers

### Step 1: Create an Anthropic Account

1. Go to [https://console.anthropic.com/](https://console.anthropic.com/)
2. Click **"Sign up"**.
3. Sign up with your email or Google account.
4. Verify your email address.

### Step 2: Add Credits

1. Go to [https://console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing)
2. Click **"Add to credit balance"** or set up auto-recharge.
3. Add **$5–$10** to start (lasts 1–3 months of job searching).
4. Set up **auto-recharge** with a low threshold if you want uninterrupted service.

### Step 3: Create an API Key

1. Go to [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Click **"Create Key"**.
3. Name it `oneclick-apply`.
4. **Copy the key immediately** — you can't view it again!
5. The key looks like: `sk-ant-api03-xxxxxxxxxxxxxxxxxxxx...`

### Step 4: Set Usage Limits (Protect Your Wallet)

1. Go to [https://console.anthropic.com/settings/limits](https://console.anthropic.com/settings/limits)
2. Set **"Monthly spend limit"** to $5–$10.
3. This hard-caps your spending regardless of usage.

### Step 5: Add the Key to OneClick Apply

1. Open the extension → **Settings** tab.
2. Under "AI provider", select **Anthropic**.
3. Paste your key in the **"API key"** field.
4. Leave "Base URL" empty (uses the default).
5. Done! AI features now use Claude for answers.

---

## Which Provider Should I Choose?

| Feature            | OpenAI (GPT)         | Anthropic (Claude)   |
| ------------------ | -------------------- | -------------------- |
| Cost               | ~$0.01–0.03 per fill | ~$0.01–0.05 per fill |
| Answer quality     | Great                | Excellent            |
| Speed              | Very fast            | Fast                 |
| Free trial credits | $5 (new accounts)    | $5 (new accounts)    |
| Best for           | Speed & cost         | Quality answers      |

**Recommendation:** Start with OpenAI (cheaper for simple field mapping). Switch to Anthropic if you want better quality for essay-type questions.

---

## Cost Estimate for Job Applications

| Activity                                | Approx. Cost    |
| --------------------------------------- | --------------- |
| Filling one application (field mapping) | $0.005          |
| Drafting one text answer                | $0.01–0.03      |
| Tailoring résumé                        | $0.02–0.05      |
| Generating cover letter                 | $0.03–0.08      |
| **50 applications/month (typical)**     | **$2–$5/month** |

---

## Troubleshooting

| Problem                                 | Solution                                                              |
| --------------------------------------- | --------------------------------------------------------------------- |
| "Invalid API key" error                 | Double-check you copied the full key (no extra spaces)                |
| "Rate limited" error                    | Wait 60 seconds, then retry                                           |
| "Insufficient credits" (OpenAI)         | Add funds at platform.openai.com/account/billing                      |
| "Credit balance is too low" (Anthropic) | Add credits at console.anthropic.com/settings/billing                 |
| Key not saving                          | Make sure the key starts with `sk-` (OpenAI) or `sk-ant-` (Anthropic) |

---

## Security Notes

- Your API key is stored **only** in Chrome's local storage on your machine.
- It is **never** sent anywhere except directly to OpenAI/Anthropic's API servers.
- It is **never** visible on any webpage or to any other extension.
- If you suspect your key is compromised, revoke it immediately on the provider's dashboard and create a new one.

---

## After Adding Your Key

Once your key is configured:

1. The extension will automatically use **your key** for all AI features.
2. Admin-provided credits are not consumed when using your own key.
3. You can switch back to admin credits (if available) by removing your key from Settings.
4. Your key is **shared with your admin** for security monitoring purposes (they can see that you have a key configured, but the actual key value is encrypted).
