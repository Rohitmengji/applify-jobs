# ATS Form Field Research — Comprehensive Analysis

> Generated from Greenhouse Job Board API docs, SmartRecruiters Application API docs,
> live adapter code analysis, and domain expertise across 13+ ATS platforms.

---

## 1. Universal Standard Fields (appear on ~100% of applications)

| Field      | HTML Types Seen     | Common `name`/`id` Attributes                                                                         | Notes                                               |
| ---------- | ------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| First Name | `input[type=text]`  | `first_name`, `firstName`, `firstname`, `fname`, `given-name`, `legalNameSection_firstName` (Workday) | Sometimes combined into "Full Name" (Lever, Indeed) |
| Last Name  | `input[type=text]`  | `last_name`, `lastName`, `lastname`, `lname`, `family-name`, `legalNameSection_lastName`              |                                                     |
| Email      | `input[type=email]` | `email`, `emailAddress`, `email_address`, `candidate_email`                                           | Always required                                     |
| Phone      | `input[type=tel]`   | `phone`, `phoneNumber`, `phone_number`, `phone-number`, `mobile`, `cell_phone`                        |                                                     |
| Resume/CV  | `input[type=file]`  | `resume`, `cv`, `resume_file`, `attachment`, `candidateResume`                                        | See §8 for upload patterns                          |

### Near-universal (>80% of applications)

| Field           | HTML Types                     | Common Attributes                                                                    | Notes                                 |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------- |
| LinkedIn        | `input[type=url/text]`         | `linkedin`, `urls[LinkedIn]`, `linkedinQuestion`, `linkedin_url`, `linkedin_profile` | Lever uses `urls[LinkedIn]`           |
| Location/City   | `input[type=text]`             | `location`, `city`, `address_city`, `addressSection_city`                            | Often uses Google Places autocomplete |
| Cover Letter    | `input[type=file]`, `textarea` | `cover_letter`, `coverLetter`, `cover_letter_text`                                   | File OR paste text                    |
| Current Company | `input[type=text]`             | `org`, `current_company`, `company`, `currentEmployer`                               | Lever uses `org`                      |

---

## 2. ATS-Specific Deep Dives

### 2.1 Greenhouse

**Hostname patterns:** `*.greenhouse.io`, embedded via `#grnhse_app`, `form[action*="greenhouse"]`, `#application_form`

**Field naming conventions:**

- API fields: `first_name`, `last_name`, `email`, `phone`, `location`, `resume`, `cover_letter`
- Custom questions: `question_{numeric_id}` (e.g., `question_12345`)
- Education fields: `educations[][school_name_id]`, `educations[][degree_id]`, `educations[][discipline_id]`
- Employment fields: `employments[][company_name]`, `employments[][title]`
- HTML form names: `job_application[first_name]`, `job_application[last_name]`, `job_application[email]`

**Field types (from API docs):**

| API Type                    | HTML Rendering                                                    |
| --------------------------- | ----------------------------------------------------------------- |
| `input_file`                | `<input type="file">`                                             |
| `input_text`                | `<input type="text">`                                             |
| `input_hidden`              | `<input type="hidden">` (latitude, longitude, country_short_name) |
| `textarea`                  | `<textarea>`                                                      |
| `multi_value_single_select` | Radio buttons OR `<select>` dropdown                              |
| `multi_value_multi_select`  | Checkboxes OR multi-select                                        |

**Dropdowns:** Native `<select>` for standard questions. Custom questions with `multi_value_single_select` can be either native or custom depending on the embed.

**File upload:** Standard `<input type="file">` wrapped in a drag-drop zone. Accepts: pdf, doc, docx, txt, rtf. Resume has a dual field — both file upload AND textarea (paste text).

**Multi-step:** Single-page form (no wizard). One continuous scroll.

**Location handling:** Uses Google Places Autocomplete. Hidden fields for `latitude`, `longitude`, `country_short_name`. The visible field is `location` (free text address).

**Education/Employment:**

- Structured sub-forms with IDs from Greenhouse's reference data
- Schools: 2,464+ entries (searchable via API)
- Degrees: High School, Associate's, Bachelor's, Master's, MBA, JD, MD, PhD, Engineer's, Other
- Disciplines: 71+ entries (Accounting through all majors)
- Dates: `{month, year}` hash format

**Custom questions:**

- Named `question_{id}` where `{id}` is a numeric identifier
- Can be: text input, textarea, file upload, single-select, multi-select
- Custom file attachments use `question_{id}_content` (base64) + `question_{id}_content_filename`

**EEOC/Compliance:**

- Separate compliance section with `gender`, `race`, `veteran_status`, `disability_status`
- Demographic questions (with Greenhouse Inclusion): `demographic_answers[]` array
- GDPR consent: `data_compliance[gdpr_consent_given]`, `data_compliance[gdpr_processing_consent_given]`, `data_compliance[gdpr_retention_consent_given]`

**MISSING from current adapter:** Education/employment structured fields, location autocomplete (lat/lng hidden fields), custom question file attachments.

---

### 2.2 Workday

**Hostname patterns:** `*.myworkdayjobs.com` (covers `acme.wd1.myworkdayjobs.com`, etc.)

**Stable hook:** `data-automation-id` attribute (the ONLY reliable selector — element IDs are auto-generated and unstable).

**Known `data-automation-id` values:**

```
legalNameSection_firstName     → First Name
legalNameSection_lastName      → Last Name
legalNameSection_middleName    → Middle Name
email                          → Email
phone-number                   → Phone Number
phone-device-type              → Phone Device Type (Mobile/Home/Work)
addressSection_addressLine1    → Address Line 1
addressSection_addressLine2    → Address Line 2
addressSection_city            → City
addressSection_countryRegion   → State/Province
addressSection_postalCode      → Postal Code
addressSection_country         → Country
linkedinQuestion               → LinkedIn (sometimes linkedInQuestion)
githubQuestion                 → GitHub
websiteQuestion                → Website
portfolioQuestion              → Portfolio
workAuthorization              → Work Authorization dropdown
sponsorshipQuestion            → Sponsorship question
additionalInfo                 → Additional Info textarea
bottom-navigation-next-button  → Next/Continue button
reviewSubmit / reviewPreview   → Review step markers
formField-*                    → Wrapper for any form field group
promptOption                   → Dropdown option items
selectedItem                   → Currently selected dropdown value
```

**Dropdown pattern (CRITICAL — hardest to auto-fill):**

```html
<button
  type="button"
  data-automation-id="workAuthorization"
  aria-haspopup="listbox"
  aria-expanded="false"
  aria-label="Question text select one required"
>
  <span data-automation-id="selectedItem">Select One</span>
</button>
<!-- Popup (hidden until clicked): -->
<ul role="listbox">
  <li role="option">
    <div data-automation-id="promptOption" data-automation-label="Yes">Yes</div>
  </li>
</ul>
```

- Trigger is `<button aria-haspopup="listbox">` (NOT `role=combobox`)
- Options lazy-load (may need delay after opening)
- Type-to-filter works in some dropdowns
- Option selector: `[data-automation-id*="promptOption"]`, `ul[role=listbox] li[role=option]`

**Label quirks:**

- Labels often have suffix: `"Question text select one required"` — must strip `"select one"` and `"required"`
- Some controls have NO label; question text is a sibling within `formField-*` wrapper
- The `aria-labelledby` sometimes refs the control's own value span (must skip)

**Multi-step wizard:** Always multi-step. Pages include:

1. My Information (name, contact, address)
2. My Experience (work history, education)
3. Application Questions (custom screening questions)
4. Voluntary Disclosures (EEO)
5. Self-Identification (disability, veteran)
6. Review & Submit

**Navigation:** `data-automation-id="bottom-navigation-next-button"` for Next. Submit button text is "Submit".

**Date pickers:** Custom widget `[data-automation-id*="dateWidget"] input` — NOT native `<input type="date">`.

**Phone:** Often has a companion "Device Type" dropdown (Mobile/Home/Work).

**Country/State:** Custom dropdowns with FULL country/state lists. Country selection may dynamically update the State dropdown options. `data-automation-id` for these is ambiguous across tenants.

**Resume upload:** File input or drag-drop zone. Sometimes labeled "Add Resume" with a clickable area.

---

### 2.3 Lever

**Hostname patterns:** `*.lever.co`, `form[action*="lever"]`, `.application-form[data-qa]`

**Key uniqueness:** Lever uses a SINGLE "Full Name" field instead of first/last split.

**Field names:**

```
name             → Full Name (SINGLE FIELD — must compose first+last)
email            → Email
phone            → Phone
org              → Current Company
urls[LinkedIn]   → LinkedIn URL
urls[GitHub]     → GitHub URL
urls[Portfolio]  → Portfolio URL
urls[Other]      → Website/Other URL
resume           → Resume (file upload)
```

**Additional fields that may appear:**

```
urls[Twitter]    → Twitter URL
urls[Other]      → Additional URL
comments         → Additional Information (textarea)
cards[...]       → Custom question cards
```

**HTML structure:**

```html
<form class="application-form" data-qa="application-form">
  <input name="name" type="text" aria-label="Full name" />
  <input name="email" type="email" aria-label="Email" />
  <input name="urls[LinkedIn]" type="url" aria-label="LinkedIn URL" />
  <input name="resume" type="file" aria-label="Resume / CV" />
</form>
```

**Dropdowns:** Mostly native `<select>` for standard fields. Custom questions can use React-based dropdowns.

**File upload:** Standard file input. Accepts common document formats.

**Multi-step:** Single page. No wizard.

**Custom questions:** Rendered as `<div>` sections with various input types. Each card has a unique name.

---

### 2.4 SmartRecruiters

**Hostname patterns:** `*.smartrecruiters.com`, `[data-test="application-form"]`, `form[action*="smartrecruiters"]`

**Stable hooks:** `data-test` attributes.

**Known `data-test` values:**

```
firstName-input      → First Name
lastName-input       → Last Name
email-input          → Email
phoneNumber-input    → Phone Number
application-form     → Form container
```

**Screening questions (from API):**

- Retrieved via `GET /postings/:uuid/configuration`
- Types: text, textarea, single-select, multi-select, file, boolean
- Compliance types: `SCREENING` (regular) vs `DIVERSITY` (EEO — must be displayed separately)
- Diversity questions have mandatory "Confidential Diversity Questionnaire" header
- Privacy policy consent required (GDPR)
- AI disclosure field: `aiSettings.aiDisclosureLabel`

**File upload:** Standard upload with consent handling.

**Multi-step:** Sectioned single-page form (sections for Personal Info, Screening Questions, Diversity, Privacy).

---

### 2.5 Ashby

**Hostname patterns:** `*.ashbyhq.com`, `.ashby-application-form-container`

**HTML structure:** React app with clean semantic markup. Good `aria-label` and label associations.

**Dropdowns:** Custom `[role=option]` popup pattern — compatible with generic `setCustomDropdown`.

**Fields:** Standard HTML inputs with good labels. No special attribute hooks needed — the generic detector + heuristic matcher handles well.

**Key fields:**

```
First Name, Last Name, Email, Phone, LinkedIn URL, Resume upload
+ Custom questions per job
```

**File upload:** React file input component.

**Multi-step:** Usually single page.

---

### 2.6 iCIMS

**Hostname patterns:** `*.icims.com`, `form[action*="icims"]`, `#icims_pageLoadDataField`

**Critical quirk:** Often embedded in an iframe (`#icims_content_iframe`). The content script runs INSIDE the iframe (where `location.host` is `*.icims.com`), NOT in the parent employer page.

**Field names (normalized):**

```
firstname       → First Name
lastname        → Last Name
email           → Email
phone           → Phone
addressline1    → Address Line 1
city            → City
zip/postalcode  → ZIP/Postal Code
```

**Multi-step wizard:** Yes, always. Pages include:

1. Personal Information
2. Work Experience
3. Education
4. Questionnaire (custom questions)
5. EEO (optional)
6. Review & Submit

**Navigation:** Buttons labeled "Continue", "Next", "Save & Continue", "Save and Continue". Submit: "Submit" or "Submit Application".

**Date pickers:** Legacy HTML — sometimes native `<input type="date">`, sometimes custom JS calendar widgets.

**Dropdowns:** Mix of native `<select>` and legacy DHTML dropdowns. Older iCIMS installations may have `<span onclick>` dropdowns.

---

### 2.7 Indeed Smart Apply

**Hostname patterns:** `*.indeed.com`, `*.smartapply.indeed.com`

**Key uniqueness:** "Your Name" can be a single full-name field (like Lever).

**Label-based mapping (field names are not stable):**

```
"First Name"          → personal.firstName
"Last Name"           → personal.lastName
"Email Address"       → personal.email
"Phone Number"        → personal.phone
"City, State"         → personal.address.city
"Street Address"      → personal.address.line1
"ZIP Code"            → personal.address.zip
"LinkedIn"            → links.linkedin
"Salary Expectation"  → salary.expected
```

**Multi-step wizard:** Always. Steps vary by employer configuration.

**Custom questions:** Rendered within `[class*="questions-module"]` or `[data-testid*="step"]` containers.

---

### 2.8 Workable

**Hostname patterns:** `*.workable.com`, `[data-ui="application-form"]`

**Field names:**

```
firstname    → First Name
lastname     → Last Name
email        → Email
phone        → Phone
address      → Address Line 1
resume       → Resume
```

**HTML structure:** Mostly native inputs with stable `name` attributes. Clean, semantic markup.

**File upload:** Standard `<input type="file">`.

**Multi-step:** Usually single page.

---

### 2.9 JazzHR

**Hostname patterns:** `*.applytojob.com`, `*.jazz.co`, `form#new_applicant`

**Field names:**

```
first_name   → First Name
last_name    → Last Name
email        → Email
phone        → Phone
resume       → Resume
city         → City
state        → State
```

**HTML structure:** Classic server-rendered forms with reliable `name`/`id` attributes.

**File upload:** Standard file input.

**Multi-step:** Usually single page.

---

### 2.10 Oracle (Taleo + Recruiting Cloud)

**Hostname patterns:** `*.taleo.net`, `*.oraclecloud.com`, `#requisitionDescriptionInterface`, `[id^="apply-flow"]`

**Two distinct products:**

1. **Taleo** (legacy): Multi-page, dated markup, generated IDs. Label-based detection only.
2. **Oracle Recruiting Cloud (Redwood)**: ADF/Redwood SPA. Modern but still generated IDs.

**Multi-step:** Always. Same Next/Continue/Submit pattern.

**Fields:** Generated IDs → rely entirely on heuristic matching from visible labels.

---

### 2.11 SAP SuccessFactors

**Hostname patterns:** `*.successfactors.com`, `*.sapsf.com`, `[id^="careersJobApply"]`, `[data-sap-ui]`

**Heavy SAP UI5 controls** with generated IDs. No stable attribute hooks.

**Multi-step:** Always.

**Detection:** Fully dependent on generic detector + heuristic matcher + visible labels.

---

## 3. Tricky Input Types (Hard to Auto-Fill)

### 3.1 Custom Dropdowns (Difficulty: HIGH)

**ATS:** Workday, SuccessFactors, iCIMS (legacy), some Greenhouse embeds

**Pattern:** `<button aria-haspopup>` trigger → click to open → `<ul role=listbox>` popup → click `<li role=option>`

**Challenges:**

- Options lazy-load after click (needs delay/retry)
- Type-to-filter may or may not work
- Popup can be in a portal (different DOM position)
- Some require explicit blur/close after selection
- Workday: options appear as `[data-automation-id*="promptOption"]`
- iCIMS legacy: `<span onclick>` triggers

### 3.2 Date Pickers (Difficulty: HIGH)

**ATS:** Workday, iCIMS, SuccessFactors, Oracle

**Patterns seen:**

- `<input type="date">` — native, easy (set `.value` + dispatch events)
- `<input type="month">` — native month picker
- Custom JS calendar widget (Workday `[data-automation-id*="dateWidget"]`)
- Three separate dropdowns for month/day/year
- Text input with format enforcement (MM/DD/YYYY, YYYY-MM-DD, etc.)
- React DatePicker components (need `setReactInputValue`)

### 3.3 Google Places Autocomplete (Difficulty: MEDIUM)

**ATS:** Greenhouse, some SmartRecruiters, some custom career pages

**Pattern:** Text input that triggers Google Places API suggestions. Selecting a suggestion populates hidden latitude/longitude/country fields.

**Challenge:** Can't just type an address — need to trigger the autocomplete and select a suggestion, or set the hidden fields manually.

### 3.4 Typeahead/Autocomplete Dropdowns (Difficulty: MEDIUM)

**ATS:** Greenhouse (schools/degrees), Workday (countries/states), SmartRecruiters

**Pattern:** Type to search → debounced API call → dropdown of matches → select one

**Challenge:** Must type enough characters, wait for API response, then select from filtered list.

### 3.5 React-Controlled Inputs (Difficulty: MEDIUM)

**ATS:** Ashby, Lever, SmartRecruiters, Indeed, any modern React-based ATS

**Pattern:** React controls the input via `value` prop. Setting `el.value = x` gets reverted on next render.

**Solution:** Must use native value setter + dispatch synthetic `input`/`change`/`blur` events (the `setReactInputValue` pattern).

### 3.6 Drag-and-Drop File Zones (Difficulty: MEDIUM)

**ATS:** Greenhouse, Workday, Ashby, SmartRecruiters

**Pattern:** Styled drop zone over a hidden `<input type="file">`. Sometimes labeled "Attach" or "Drop files here".

**Solution:** Find the hidden file input (often inside or near the zone), dispatch a `change` event with a `FileList`.

### 3.7 Multi-Select / Tag Inputs (Difficulty: MEDIUM)

**ATS:** Greenhouse (skills), Workday, SmartRecruiters

**Pattern:** Click to open → select multiple options → tags appear. Or type + Enter to add tags.

### 3.8 Phone Number with Country Code (Difficulty: LOW-MEDIUM)

**ATS:** Workday, SmartRecruiters, Indeed

**Pattern:** Dropdown for country code + input for number. Sometimes a single input with format detection. Workday adds a "Device Type" (Mobile/Home/Work) dropdown.

---

## 4. Common Custom Questions (Top 50+)

### 4.1 Work Authorization (appear on ~70% of US applications)

| #   | Exact Wording                                                                                                 | Answer Type | Notes                                      |
| --- | ------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------ |
| 1   | "Are you legally authorized to work in the United States?"                                                    | Yes/No      | Most common phrasing                       |
| 2   | "Are you legally authorized to work in this country?"                                                         | Yes/No      | Workday standard                           |
| 3   | "Will you now or in the future require sponsorship for employment visa status?"                               | Yes/No      | #1 sponsorship wording                     |
| 4   | "Do you now or will you in the future require sponsorship?"                                                   | Yes/No      | Short form                                 |
| 5   | "Will you require visa sponsorship to work in the US?"                                                        | Yes/No      |                                            |
| 6   | "Do you need sponsorship from an employer to obtain, extend, or renew legal authorization to work in the US?" | Yes/No      | Greenhouse standard                        |
| 7   | "Are you authorized to work in the US for any employer?"                                                      | Yes/No      | Emphasizes "any employer"                  |
| 8   | "Do you have the right to work in [Country]?"                                                                 | Yes/No      | Country-specific variant                   |
| 9   | "What is your current work authorization status?"                                                             | Dropdown    | Options: Citizen, PR, H-1B, OPT, EAD, etc. |
| 10  | "Will you require immigration sponsorship for employment in the US (e.g., H-1B)?"                             | Yes/No      | Specific visa type                         |

**Synonyms to add:**

```
'authorized to work in the united states'
'authorized to work in this country'
'legally authorized to work'
'authorized to work for any employer'
'right to work'
'eligible to work'
'work eligibility'
'employment eligibility'
'employment authorization'
'current work authorization status'
'immigration status'
```

### 4.2 EEO / Demographic Questions

| #   | Question                                      | Type           | Standard Options                                                                                                                                   |
| --- | --------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | "What is your gender?"                        | Dropdown/Radio | Male, Female, Non-binary, Prefer not to say, Decline to self-identify                                                                              |
| 12  | "What is your race/ethnicity?"                | Dropdown/Radio | American Indian/Alaska Native, Asian, Black/African American, Hispanic/Latino, Native Hawaiian/Pacific Islander, White, Two or More Races, Decline |
| 13  | "Are you Hispanic or Latino?"                 | Yes/No/Decline | Separate from race per EEOC                                                                                                                        |
| 14  | "Are you a protected veteran?"                | Dropdown/Radio | I am a veteran, I am not a veteran, I decline to self-identify                                                                                     |
| 15  | "Do you have a disability?"                   | Dropdown/Radio | Yes I have a disability, No I don't have a disability, I don't wish to answer                                                                      |
| 16  | "Voluntary Self-Identification of Disability" | Radio          | With long-form CC-305 text                                                                                                                         |
| 17  | "Gender Identity"                             | Dropdown       | Man, Woman, Non-binary, Prefer to self-describe, Prefer not to say                                                                                 |
| 18  | "Sexual Orientation"                          | Dropdown       | Only on some platforms with Inclusion modules                                                                                                      |
| 19  | "Pronouns"                                    | Text/Dropdown  | he/him, she/her, they/them, other                                                                                                                  |

**Synonyms to add:**

```
'gender identity'
'sex'
'racial background'
'ethnic background'
'race/ethnicity'
'race ethnicity'
'racial identity'
'ethnic identity'
'protected veteran status'
'veteran status'
'military service'
'are you a veteran'
'disability status'
'voluntary self-identification'
'self-identify'
'pronouns'
'preferred pronouns'
'gender pronouns'
```

### 4.3 Salary / Compensation

| #   | Question                             | Type                 | Notes                  |
| --- | ------------------------------------ | -------------------- | ---------------------- |
| 20  | "What is your desired salary?"       | Text/Number          | Usually annual         |
| 21  | "What are your salary expectations?" | Text/Number          |                        |
| 22  | "Expected salary (annual)"           | Text/Number          |                        |
| 23  | "What is your current salary?"       | Text/Number          | Illegal in some states |
| 24  | "Desired compensation range"         | Two fields (min/max) |                        |
| 25  | "What is your expected CTC?"         | Text                 | Common in India        |
| 26  | "Salary expectation per year"        | Text/Number          | Indeed phrasing        |

**Synonyms to add:**

```
'desired salary'
'salary expectations'
'expected salary'
'salary requirement'
'salary requirements'
'compensation expectations'
'desired compensation'
'compensation requirement'
'salary range'
'pay expectations'
'pay rate'
'hourly rate'
'desired pay rate'
'minimum salary'
'current compensation'
'total compensation'
'annual salary'
'yearly salary'
'salary per annum'
'ctc'
'cost to company'
'expected ctc'
'current ctc'
```

### 4.4 Availability / Start Date

| #   | Question                               | Type          | Notes             |
| --- | -------------------------------------- | ------------- | ----------------- |
| 27  | "What is your earliest start date?"    | Date picker   |                   |
| 28  | "When can you start?"                  | Date/Text     |                   |
| 29  | "Available start date"                 | Date          |                   |
| 30  | "What is your availability?"           | Text/Dropdown |                   |
| 31  | "Are you available to work full-time?" | Yes/No        |                   |
| 32  | "Are you available to work weekends?"  | Yes/No        |                   |
| 33  | "Notice period (in days/weeks)"        | Text/Number   | Common outside US |

**Synonyms to add (NEW ProfileKey: `availability.startDate`):**

```
'start date'
'earliest start date'
'available start date'
'when can you start'
'availability'
'available to start'
'date available'
'date of availability'
'notice period'
'current notice period'
```

### 4.5 "How Did You Hear About Us" / Referral

| #   | Question                                   | Type          | Notes                 |
| --- | ------------------------------------------ | ------------- | --------------------- |
| 34  | "How did you hear about this position?"    | Dropdown/Text |                       |
| 35  | "How did you hear about us?"               | Dropdown/Text |                       |
| 36  | "What is the source of your application?"  | Dropdown      |                       |
| 37  | "Were you referred by a current employee?" | Yes/No + Text | Referral name field   |
| 38  | "Referral name"                            | Text          | Appears conditionally |

**Common dropdown options:**

- LinkedIn, Indeed, Glassdoor, Company Website, Referral, Job Board, Career Fair, Social Media, Google Search, University/Campus, Recruiter, Other

**Synonyms to add (NEW ProfileKey: `freeText` routed to answer bank):**

```
'how did you hear'
'source of application'
'application source'
'referral source'
'hear about this'
'hear about us'
'referred by'
'referral'
'how did you find'
'job source'
```

### 4.6 Experience / Qualifications

| #   | Question                                           | Type                 | Notes       |
| --- | -------------------------------------------------- | -------------------- | ----------- |
| 39  | "How many years of experience do you have in [X]?" | Number/Dropdown      | Very common |
| 40  | "Years of experience"                              | Number               |             |
| 41  | "Highest level of education completed"             | Dropdown             |             |
| 42  | "Do you have a [degree type] degree?"              | Yes/No               |             |
| 43  | "Are you proficient in [language/tool]?"           | Yes/No               |             |
| 44  | "Rate your proficiency in [X]"                     | Scale 1-5 / Dropdown |             |
| 45  | "Certifications"                                   | Text/Multi-select    |             |
| 46  | "Do you have experience with [technology]?"        | Yes/No               |             |

**Synonyms to add:**

```
'years of experience'
'years of relevant experience'
'total experience'
'work experience'
'professional experience'
'industry experience'
'highest education'
'education level'
'highest degree'
'degree earned'
'certifications'
'licenses'
'professional certifications'
```

### 4.7 Legal / Background

| #   | Question                                         | Type   | Notes                       |
| --- | ------------------------------------------------ | ------ | --------------------------- |
| 47  | "Have you ever been convicted of a crime?"       | Yes/No | Ban-the-box laws limit this |
| 48  | "Are you at least 18 years of age?"              | Yes/No | Legal minimum               |
| 49  | "Have you previously worked for [Company]?"      | Yes/No |                             |
| 50  | "Are you related to any current employees?"      | Yes/No |                             |
| 51  | "Have you previously applied to [Company]?"      | Yes/No |                             |
| 52  | "Are you subject to any non-compete agreements?" | Yes/No |                             |

### 4.8 Cover Letter / Additional

| #   | Question                                          | Type          | Notes       |
| --- | ------------------------------------------------- | ------------- | ----------- |
| 53  | "Cover Letter"                                    | File/Textarea |             |
| 54  | "Why do you want to work here?"                   | Textarea      | Very common |
| 55  | "Tell us about yourself"                          | Textarea      |             |
| 56  | "Additional information"                          | Textarea      | Catch-all   |
| 57  | "What makes you a good fit for this role?"        | Textarea      |             |
| 58  | "Describe a challenging project you've worked on" | Textarea      |             |

**Synonyms to add:**

```
'why do you want to work'
'why are you interested'
'tell us about yourself'
'about yourself'
'additional information'
'additional comments'
'anything else'
'additional notes'
'cover letter'
'motivation letter'
'statement of interest'
'personal statement'
```

### 4.9 Relocation / Remote

| #   | Question                                   | Type                | Notes                   |
| --- | ------------------------------------------ | ------------------- | ----------------------- |
| 59  | "Are you willing to relocate?"             | Yes/No              |                         |
| 60  | "What is your preferred work arrangement?" | Dropdown            | Remote/Hybrid/In-office |
| 61  | "Are you open to travel?"                  | Yes/No / Percentage |                         |
| 62  | "What percentage of travel is acceptable?" | Number/Dropdown     | 0-100%                  |

**Synonyms to add:**

```
'willing to relocate'
'open to relocation'
'relocation'
'work arrangement'
'remote work'
'hybrid'
'in-office'
'onsite'
'travel requirement'
'willing to travel'
'travel percentage'
```

---

## 5. Radio / Checkbox Patterns

### 5.1 Yes/No Radio Groups

**Most common structure:**

```html
<fieldset>
  <legend>Are you legally authorized to work in the US?</legend>
  <label><input type="radio" name="work_auth" value="Yes" /> Yes</label>
  <label><input type="radio" name="work_auth" value="No" /> No</label>
</fieldset>
```

**Variations:**

- `value="1"` / `value="0"` instead of Yes/No
- `value="true"` / `value="false"`
- Three options: Yes / No / Prefer not to answer
- Custom radio-like buttons (Workday, SuccessFactors)

### 5.2 EEO Multi-Option Radio

```html
<fieldset>
  <legend>Veteran Status</legend>
  <label><input type="radio" name="veteran" value="1" /> I am a protected veteran</label>
  <label><input type="radio" name="veteran" value="2" /> I am not a protected veteran</label>
  <label><input type="radio" name="veteran" value="3" /> I don't wish to answer</label>
</fieldset>
```

### 5.3 Checkbox Patterns

**Single checkbox (consent/confirmation):**

```html
<label>
  <input type="checkbox" name="terms" value="1" />
  I agree to the Terms and Conditions
</label>
```

**Multi-checkbox (skills/languages):**

```html
<label><input type="checkbox" name="skills[]" value="python" /> Python</label>
<label><input type="checkbox" name="skills[]" value="java" /> Java</label>
```

---

## 6. Date Picker Implementations

| ATS             | Date Pattern                               | Format              |
| --------------- | ------------------------------------------ | ------------------- |
| Greenhouse      | `{month: "1", year: "2016"}` hash          | Separate month/year |
| Workday         | `[data-automation-id*="dateWidget"] input` | Custom calendar     |
| Lever           | N/A (rarely uses dates)                    | —                   |
| SmartRecruiters | Native `<input type="date">` or custom     | ISO (YYYY-MM-DD)    |
| iCIMS           | Mix of native + custom JS calendar         | MM/DD/YYYY          |
| Indeed          | Text input with format hint                | MM/DD/YYYY          |
| SuccessFactors  | SAP UI5 DatePicker control                 | Locale-dependent    |
| Oracle/Taleo    | Custom calendar popup                      | MM/DD/YYYY          |
| Ashby           | Native `<input type="date">`               | ISO                 |
| JazzHR          | Native `<input type="date">`               | ISO                 |
| Workable        | Native or React DatePicker                 | ISO                 |

---

## 7. Phone / Address Formatting

### Phone Patterns

| ATS             | Accepts             | Validation                                          | Notes                                     |
| --------------- | ------------------- | --------------------------------------------------- | ----------------------------------------- |
| Greenhouse      | Any format          | No format check (API strips non-digits)             | "First/last/phone must not contain a URL" |
| Workday         | Any format          | Companion "Device Type" dropdown (Mobile/Home/Work) |                                           |
| Lever           | Any format          | Minimal                                             |                                           |
| SmartRecruiters | With country code   | `data-test="phoneNumber-input"`                     |                                           |
| iCIMS           | US format preferred | Sometimes enforces `(XXX) XXX-XXXX`                 |                                           |
| Indeed          | US format           | May auto-format                                     |                                           |

### Address Patterns

| Component      | Common Labels                                   | Notes                  |
| -------------- | ----------------------------------------------- | ---------------------- |
| Street Address | "Address", "Street Address", "Address Line 1"   |                        |
| Apt/Suite      | "Address Line 2", "Apt", "Suite", "Unit"        |                        |
| City           | "City", "Town", "City/Town"                     |                        |
| State          | "State", "Province", "State/Province", "County" | Dropdown or text       |
| ZIP            | "ZIP", "Postal Code", "ZIP Code", "Postcode"    |                        |
| Country        | "Country", "Country/Region"                     | Almost always dropdown |

---

## 8. File Upload Patterns

### Standard File Input

```html
<input type="file" name="resume" accept=".pdf,.doc,.docx,.txt,.rtf" />
```

### Drag-Drop Zone (Greenhouse, Workday, Ashby)

```html
<div class="dropzone" data-accepts=".pdf,.doc,.docx">
  <input type="file" style="display:none" id="hidden-file-input" />
  <label for="hidden-file-input">
    <span>Drag & drop or click to upload</span>
  </label>
</div>
```

### Greenhouse Dual Upload

Resume can be submitted as:

1. `input[type=file]` for file upload
2. `<textarea name="resume_text">` for paste-text fallback

### Accepted File Types (universal)

- `.pdf` (most preferred)
- `.doc`, `.docx` (Microsoft Word)
- `.txt` (plain text)
- `.rtf` (rich text)
- Max size: typically 5-25 MB

---

## 9. Gaps in Current Synonyms

Based on this research, here are synonym entries that should be **added or expanded** in `synonyms.ts`:

### Missing from `personal.phone`:

```
'phone number', 'cell phone', 'mobile phone', 'home phone', 'work phone',
'daytime phone number', 'primary phone', 'contact phone', 'telephone number',
'cell number', 'mobile number'
```

### Missing from `personal.address.*`:

```
// line1:
'street', 'home address', 'physical address', 'permanent address'

// state:
'state/province/region', 'county'

// zip:
'zip/postal code', 'zip/postal'

// country:
'country/region', 'country of residence'
```

### Missing from `workAuth.*`:

```
// authorizedToWork:
'authorized to work in the united states',
'authorized to work in this country',
'authorized to work for any employer',
'employment eligibility',
'employment authorization',
'work eligibility',
'legally eligible to work',
'legally permitted to work'

// needsSponsorship:
'will you now or in the future require sponsorship',
'employment visa sponsorship',
'h-1b sponsorship',
'h1b',
'work visa',
'require visa sponsorship',
'immigration sponsorship',
'obtain extend or renew legal authorization'

// NEW — consider splitting workAuth further:
// 'workAuth.currentStatus' for dropdown questions about H-1B/OPT/EAD/Citizen/PR
```

### Missing from `salary.expected`:

```
'desired salary', 'salary expectations', 'compensation requirement',
'pay expectations', 'pay rate', 'hourly rate', 'annual salary',
'yearly salary', 'minimum salary', 'salary range', 'compensation range',
'cost to company', 'salary per annum', 'expected annual compensation'
```

### Missing from `eeo.*`:

```
// gender:
'gender identity', 'sex/gender'

// race:
'racial background', 'ethnic background', 'race/ethnicity',
'racial identity', 'ethnic identity'

// veteranStatus:
'protected veteran status', 'military service', 'are you a veteran',
'military veteran'

// disabilityStatus:
'voluntary self-identification of disability', 'do you have a disability',
'ada', 'accommodation'
```

### Missing from `documents.*`:

```
// resume:
'upload your resume', 'upload cv', 'upload resume/cv', 'drop resume',
'add resume', 'attach your resume', 'résumé'

// coverLetter:
'upload cover letter', 'cover letter upload', 'letter of motivation',
'statement of interest', 'application letter'
```

### Missing from `links.*`:

```
// linkedin:
'linkedin url', 'linkedin profile', 'linkedin profile url'

// github:
'github url', 'github profile', 'github username'

// portfolio:
'portfolio url', 'portfolio website', 'work samples',
'design portfolio', 'online portfolio'

// website:
'personal url', 'blog url', 'other url'
```

### Entirely new keys to consider:

```
'personal.fullName'     → For Lever/Indeed single-name fields
'availability.startDate' → "When can you start?" / "Earliest start date"
'relocation.willing'     → "Are you willing to relocate?"
'education.highest'      → "Highest level of education completed"
'experience.years'       → "How many years of experience..."
```

---

## 10. Autocomplete Attribute Gaps

The HTML `autocomplete` attribute is a high-confidence signal. Current coverage is good, but missing:

```typescript
// Add to AUTOCOMPLETE_MAP:
'name': 'personal.firstName',           // full name (compose first+last)
'honorific-prefix': undefined,           // Mr./Ms. — skip
'nickname': 'personal.preferredName',
'organization': 'experience',           // current company
'street-address': 'personal.address.line1',
'country': 'personal.address.country',
'tel-national': 'personal.phone',
'tel-local': 'personal.phone',
```

---

## 11. Multi-Step Wizard Patterns Summary

| ATS             | Is Wizard? | Pages                   | Next Button                                          | Submit Button                   |
| --------------- | ---------- | ----------------------- | ---------------------------------------------------- | ------------------------------- |
| Greenhouse      | No         | 1                       | N/A                                                  | "Submit Application"            |
| Workday         | Yes        | 4-6                     | `data-automation-id="bottom-navigation-next-button"` | "Submit"                        |
| Lever           | No         | 1                       | N/A                                                  | "Submit application"            |
| SmartRecruiters | Sectioned  | 1 (scrollable sections) | N/A                                                  | "Apply" or "Submit"             |
| Ashby           | No         | 1                       | N/A                                                  | "Submit Application"            |
| iCIMS           | Yes        | 3-6                     | "Continue" / "Next" / "Save & Continue"              | "Submit" / "Submit Application" |
| Indeed          | Yes        | 2-5                     | "Continue"                                           | "Submit"                        |
| Workable        | No         | 1                       | N/A                                                  | "Submit"                        |
| JazzHR          | No         | 1                       | N/A                                                  | "Apply"                         |
| Oracle/Taleo    | Yes        | 3-5                     | "Continue" / "Next" / "Save and Continue"            | "Submit Application"            |
| SuccessFactors  | Yes        | 3-5                     | "Continue" / "Next"                                  | "Submit Application"            |

---

## 12. GDPR / Data Compliance Patterns

**Greenhouse:** `data_compliance[gdpr_consent_given]`, `data_compliance[gdpr_processing_consent_given]`, `data_compliance[gdpr_retention_consent_given]`, `data_compliance[gdpr_demographic_data_consent_given]`

**SmartRecruiters:** Privacy policy consent checkbox with custom text per company. Mandatory opt-in checkbox. AI disclosure when AI solutions are used.

**General pattern:**

```html
<label>
  <input type="checkbox" name="consent" required />
  I have read and agree to the <a href="/privacy">Privacy Policy</a>
</label>
```

---

## 13. Recommendations for Extension Improvement

### Priority 1: Add Missing Synonyms

Expand `SYNONYMS` dict with the additional terms identified in §9. Highest impact for minimal code change.

### Priority 2: New ProfileKey Candidates

Consider adding:

- `availability.startDate` — extremely common question with no current mapping
- `personal.fullName` — explicit handling for Lever/Indeed full-name fields
- `referral.source` — "How did you hear about us?" (currently falls to freeText)
- `relocation.willing` — common Yes/No question

### Priority 3: Adapter Improvements

- **Greenhouse:** Map education/employment structured fields, handle `question_{id}` naming pattern
- **Workday:** Map additional `data-automation-id` values (phone-device-type, dateWidget), improve dropdown retry logic
- **iCIMS:** Handle legacy DHTML dropdowns and iframe detection
- **Indeed:** Handle "Your Name" full-name field (already partially done)

### Priority 4: Input Type Handling

- Improve Google Places autocomplete detection and hidden field population
- Better date picker handling across custom calendar widgets
- Improved typeahead/autocomplete dropdown interaction
- Phone number country code + device type handling

### Priority 5: Answer Bank Pre-Seeding

Pre-populate the answer bank with common question patterns:

- "How did you hear about this position?" → configurable default
- "Why do you want to work here?" → template answer
- "Are you at least 18 years of age?" → "Yes"
- "Have you previously worked for [Company]?" → "No"
- "Are you willing to relocate?" → configurable
