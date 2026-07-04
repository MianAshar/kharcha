# Kharcha — خرچہ

**AI-powered expense tracker for Pakistan** — automatically reads your bank SMS alerts, email notifications, and receipt photos to give you a complete, effortless picture of your spending.

> *Kharcha (خرچہ) means "expense" in Urdu.*

---

## What It Does

Most expense trackers make you enter every transaction manually. Kharcha does it for you.

When your bank sends you an SMS like *"PKR 3,500 debited from your HBL account at Careem"*, Kharcha reads it, parses it with AI, and logs it as a transaction — automatically. When you scan a receipt photo, GPT-4 Vision extracts the merchant, amount, date, and line items. When a bank alert email arrives in Gmail, Kharcha polls it in the background and does the same.

All three sources feed into a single feed, and Kharcha's matching engine links bank transactions to receipt-based expenses so you never have duplicates.

---

## Key Features

| Feature | How It Works |
|---|---|
| **Receipt Scanning** | Photograph a receipt → GPT-4 Vision extracts merchant, amount, date, line items, tax, and tip |
| **SMS Auto-Capture** | Every incoming SMS is sent to GPT-4o-mini on Android; bank transactions are extracted in real time |
| **Email Parsing** | Connect Gmail or Outlook; Kharcha polls every few minutes and extracts bank alert emails |
| **Smart Matching** | AI links bank transactions to receipt-based expenses (auto-links if confidence > 70%) |
| **Deduplication** | If the same transaction arrives via both SMS and email, Kharcha merges them instead of duplicating |
| **Multi-Account** | Track spending across multiple cards, wallets, and cash accounts |
| **Monthly Budget** | Set a monthly limit; watch a color-coded progress bar fill up |
| **Category Breakdown** | 15 built-in categories (food, transport, groceries, health, etc.) with emoji icons |

---

## How It Works

### 1. Receipt Scanning

```
User takes photo
      ↓
Image compressed to ~300KB JPEG
      ↓
Uploaded to Supabase Storage (private bucket)
      ↓
process-receipt Edge Function called
      ↓
Signed URL passed to GPT-4o Vision
      ↓
AI returns: merchant, category, amount, date, time,
            line items, tax, tip, confidence score
      ↓
User reviews pre-filled form → saves expense
```

The AI uses a recency heuristic for ambiguous dates (e.g. "10/05" — tries both DD/MM and MM/DD, picks the one closest to today). Confidence scores below 0.6 trigger a warning banner so the user knows to double-check.

---

### 2. SMS Parsing (Android)

```
Bank sends SMS: "PKR 5,000 debited from Meezan account"
      ↓
useSMSListener hook intercepts (react-native-android-sms-listener)
      ↓
parse-bank-sms Edge Function → GPT-4o-mini
      ↓
AI extracts: bank name, amount, currency, account last4,
             date, merchant hint, balance, reference number
      ↓
Deduplication check: same bank + account + ±2% amount + ±10 min window
      ↓
Insert bank_transaction record
      ↓
Fire-and-forget: match-transaction Edge Function runs in background
```

iOS has no public SMS API, so iOS users connect email instead (or paste transactions manually).

---

### 3. Email Parsing

```
Connected Gmail / Outlook account polled every ~5 minutes
      ↓
3-Tier Filter:
  Tier 1 — Sender whitelist (if user set bank notification email → fastest path)
  Tier 2 — Keyword pre-filter on subject + body ("debit", "credit", "PKR", etc.)
  Tier 3 — GPT-4o-mini AI classification on remaining candidates
      ↓
Parsed → deduplicated → inserted as bank_transaction
      ↓
Auto-matched to existing expenses in background
```

The 3-tier filter cuts ~95% of email-to-AI pipeline calls, keeping API costs low.

---

### 4. Transaction Matching

The `match-transaction` Edge Function links bank transactions to receipt-based expenses:

- Finds candidates within **±2% amount** and **±1 day** of the expense date
- Scores by merchant name similarity
- **Score > 0.7** → auto-link (marked `matched`)
- **Score 0.4–0.7** → suggest to user (marked `suggested`)
- **Score < 0.4** → leave for manual linking

Users can always manually link, unlink, or override matches from the Transactions screen.

---

## Tech Stack

**Frontend**
- React Native 0.81 + Expo 54 (managed workflow)
- TypeScript
- React Navigation (bottom tabs + native stack)
- expo-camera, expo-image-picker, expo-image-manipulator

**Backend**
- Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- Edge Functions run on Deno (Supabase serverless runtime)
- Row-Level Security on every table

**AI**
- OpenAI **GPT-4o** (Vision) — receipt OCR
- OpenAI **GPT-4o-mini** — SMS and email classification (fast + cheap)

**Auth**
- Supabase Auth: email/password + Google + Facebook + Apple OAuth

---

## Database Schema

```
profiles          — user metadata, currency preference, monthly budget
accounts          — payment methods (HBL debit, Meezan credit, JazzCash, cash, etc.)
receipts          — uploaded images + AI responses
expenses          — parsed expense records (from receipts or manual entry)
bank_transactions — parsed bank alerts (from SMS or email)
connected_emails  — OAuth tokens for Gmail / Outlook
categories        — default + user-defined expense categories
```

Every table has RLS enabled: `auth.uid() = user_id`. Data is never shared across accounts at the database level.

---

## App Screens

| Screen | Purpose |
|---|---|
| **Home** | Dashboard — monthly spend, budget bar, account filter pills, recent expenses |
| **Scan Receipt** | Live camera → preview → AI processing → review form |
| **Review Expense** | Edit AI-pre-filled form before saving |
| **Expense Detail** | Full expense view with receipt image, line items, matched transaction |
| **Transactions** | Monthly bank transaction feed grouped by date, with match status badges |
| **Transaction Detail** | Full transaction view — bank, amount, source (SMS/email/both), linked expense |
| **Settings** | Profile, payment accounts, connected emails, SMS permissions, export, sign out |

---

## Project Structure

```
kharcha/
├── src/
│   ├── screens/           # One file per screen
│   ├── navigation/        # AppNavigator (tabs + stack)
│   ├── services/          # Supabase queries + Edge Function calls
│   ├── hooks/             # useAuth, useExpenses, useTransactions, useSMSListener
│   ├── types/             # TypeScript types
│   ├── constants/         # Colors, categories
│   └── utils/             # Currency formatting, image compression
├── supabase/
│   ├── functions/
│   │   ├── process-receipt/    # GPT-4o Vision receipt OCR
│   │   ├── parse-bank-sms/     # GPT-4o-mini SMS parsing
│   │   ├── parse-bank-email/   # Gmail/Outlook email parsing
│   │   └── match-transaction/  # Expense ↔ transaction linking
│   └── migrations/             # SQL schema files
└── assets/
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)
- A Supabase project
- An OpenAI API key

### Install & Run

```bash
git clone https://github.com/MianAshar/kharcha.git
cd kharcha
npm install
npx expo start
```

### Environment Setup

Create a `.env` (or update `src/services/supabase.ts`) with your Supabase credentials:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

Set Edge Function secrets in the Supabase Dashboard under **Settings → Edge Functions → Secrets**:

```
OPENAI_API_KEY=sk-...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
MICROSOFT_OAUTH_CLIENT_ID=...
```

### Deploy Edge Functions

```bash
supabase functions deploy process-receipt
supabase functions deploy parse-bank-sms
supabase functions deploy parse-bank-email
supabase functions deploy match-transaction
```

### Build for Device

```bash
# Android development build (required for SMS features)
eas build --platform android --profile development

# iOS development build
eas build --platform ios --profile development
```

---

## Design

- **Primary:** `#E94560` coral red — CTAs, amounts
- **Secondary:** `#1A1A2E` dark navy — text, headers
- **Success:** `#00955F` green — credits, matched status
- **Background:** `#F8F9FA` off-white
- **Font:** Inter
- Light mode only

---

## Contributing

This is a personal project but PRs are welcome. Open an issue first to discuss any significant change.

---

## License

MIT
