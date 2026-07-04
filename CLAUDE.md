# Kharcha — AI-Powered Expense Tracker

## Project Overview
Kharcha (خرچہ — Urdu for "expense") is a mobile-first expense tracking app that uses AI to extract data from receipt photos and bank transaction messages (SMS + email), giving users a unified view of all spending. Built with React Native (Expo) + Supabase + OpenAI.

## Tech Stack
- **Frontend:** React Native with Expo (managed workflow)
- **Backend:** Supabase (PostgreSQL + Edge Functions + Auth + Storage)
- **AI/OCR:** OpenAI GPT-4o (Vision) for receipts, GPT-4o-mini for SMS/email parsing
- **Auth:** Supabase Auth with email/password + Google + Facebook + Apple OAuth
- **Navigation:** React Navigation (bottom tabs + stack)
- **State Management:** React Context + custom hooks (keep it simple, no Redux)

## Supabase Credentials
- Project URL: https://jvpkqiiycmpcelxqtact.supabase.co
- Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2cGtxaWl5Y21wY2VseHF0YWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjYzNzUsImV4cCI6MjA5MzgwMjM3NX0.cDYixWiZBGiqlw2x1IuDl6eFsVYb4ZK9tiyiPwgulbE
- Edge Function secrets: OPENAI_API_KEY (set via Supabase Dashboard > Settings > Edge Functions > Secrets)

## Project Structure
```
kharcha/
├── CLAUDE.md
├── app.json
├── App.tsx
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── ui/            # Buttons, inputs, cards, badges
│   │   └── shared/        # App-specific shared components
│   ├── screens/           # One file per screen
│   │   ├── SplashScreen.tsx
│   │   ├── AuthScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── ScanReceiptScreen.tsx
│   │   ├── ReviewExpenseScreen.tsx
│   │   ├── TransactionsFeedScreen.tsx
│   │   ├── ExpenseDetailScreen.tsx
│   │   ├── ExpensesListScreen.tsx
│   │   └── SettingsScreen.tsx
│   ├── navigation/        # React Navigation config
│   │   └── AppNavigator.tsx
│   ├── hooks/             # Custom hooks
│   │   ├── useAuth.ts
│   │   ├── useExpenses.ts
│   │   ├── useTransactions.ts
│   │   └── useSMSListener.ts
│   ├── services/          # API calls and business logic
│   │   ├── supabase.ts    # Supabase client init
│   │   ├── receipts.ts    # Receipt upload + processing
│   │   ├── expenses.ts    # CRUD for expenses
│   │   ├── transactions.ts # Bank transaction operations
│   │   └── matching.ts    # Transaction-expense matching
│   ├── utils/             # Helper functions
│   │   ├── format.ts      # Currency formatting, dates
│   │   └── compress.ts    # Image compression before upload
│   ├── constants/         # App-wide constants
│   │   ├── colors.ts      # Color palette
│   │   └── categories.ts  # Expense categories
│   └── types/             # TypeScript type definitions
│       └── index.ts
├── supabase/
│   ├── migrations/        # SQL migration files
│   └── functions/         # Edge Functions
│       ├── process-receipt/
│       ├── parse-bank-sms/
│       ├── parse-bank-email/
│       ├── match-transaction/
│       └── export-expenses/
├── designs/               # Stitch design exports (PNG + HTML + DESIGN.md)
└── assets/                # App icons, splash, static images
```

## Design System
- **Theme:** Light mode
- **Primary:** #E94560 (coral red) — CTAs, highlights, amounts
- **Secondary:** #1A1A2E (dark navy) — text, headers
- **Tertiary:** #00955F (green) — success, credits, matched
- **Background:** #F8F9FA (off-white)
- **Surface/Cards:** #FFFFFF with subtle shadow
- **Muted text:** #877273
- **Font:** Inter
- **Border radius:** 12-16px for cards
- **Reference:** See designs/design-system/DESIGN.md for full tokens
- **Screen mockups:** See designs/ folder — each subfolder has PNG, HTML, and DESIGN.md

## Database Schema

### profiles
- id (uuid PK, references auth.users)
- full_name (text)
- currency (text, default 'PKR')
- monthly_budget (numeric, nullable)
- created_at (timestamptz)

### accounts (NEW — user's payment cards/wallets)
- id (uuid PK)
- user_id (uuid FK → profiles)
- account_name (text) — e.g. "HBL", "Meezan", "JazzCash", "Cash"
- account_type (text) — debit_card | credit_card | mobile_wallet | cash | bank_account
- last4 (text, nullable) — last 4 digits
- bank_name (text, nullable)
- is_default (boolean, default false)
- color (text, nullable) — for UI display
- created_at (timestamptz)

### receipts
- id (uuid PK)
- user_id (uuid FK → profiles)
- image_url (text)
- raw_ai_response (jsonb)
- status (text) — pending | processed | failed | needs_review
- uploaded_at (timestamptz)
- processed_at (timestamptz)

### expenses
- id (uuid PK)
- user_id (uuid FK → profiles)
- receipt_id (uuid FK → receipts, nullable)
- transaction_id (uuid FK → bank_transactions, nullable)
- account_id (uuid FK → accounts, nullable)
- merchant_name (text)
- category (text)
- amount (numeric)
- currency (text)
- expense_date (date)
- expense_time (time, nullable)
- payment_method (text) — cash | card | bank_transfer | mobile_wallet
- items (jsonb) — [{name, qty, unit_price, total}]
- tax_amount (numeric, nullable)
- tip_amount (numeric, nullable)
- notes (text, nullable)
- match_status (text) — unmatched | matched | suggested | manual | cash_only
- confidence_score (numeric)
- created_at (timestamptz)

### bank_transactions
- id (uuid PK)
- user_id (uuid FK → profiles)
- source (text) — sms | email
- confirmed_by (text) — sms_only | email_only | both
- raw_message (text)
- bank_name (text)
- transaction_type (text) — debit | credit
- amount (numeric)
- currency (text)
- account_last4 (text, nullable)
- transaction_date (timestamptz)
- merchant_hint (text, nullable)
- balance_after (numeric, nullable)
- reference_number (text, nullable)
- matched_expense_id (uuid FK → expenses, nullable)
- created_at (timestamptz)

### connected_emails
- id (uuid PK)
- user_id (uuid FK → profiles)
- provider (text) — gmail | outlook
- email_address (text)
- oauth_token_encrypted (text)
- last_polled_at (timestamptz)
- is_active (boolean)
- created_at (timestamptz)

### categories
- id (uuid PK)
- user_id (uuid FK, nullable — null for system defaults)
- name (text)
- icon (text) — emoji
- color (text) — hex
- is_default (boolean)

## RLS Policy Pattern
Every table MUST have Row Level Security enabled. Standard policy:
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own data" ON table_name
  FOR ALL USING (auth.uid() = user_id);
```

## Naming Conventions
- Files: kebab-case (expense-detail-screen.tsx) or PascalCase for components (ExpenseDetailScreen.tsx)
- Variables/functions: camelCase
- Types/interfaces: PascalCase
- Database columns: snake_case
- Supabase Edge Functions: kebab-case folder names
- Constants: UPPER_SNAKE_CASE

## Key Architectural Decisions
1. **SMS Strategy:** Read ALL incoming SMS (Android only), send every message to AI. AI determines if it's a transaction via is_transaction field. Known bank sender IDs are priority hints for faster processing, NOT filters.
2. **iOS Fallback:** No SMS access on iOS. Primary: email parsing. Secondary: manual "Paste Transaction" feature.
3. **Email Parsing:** Multi-account OAuth (Gmail + Outlook). Each connected email polled on 5-min cron. Supports multiple banks per email, multiple emails per user.
4. **Deduplication:** Before inserting a bank_transaction, check for existing record with same amount ±2%, same bank, same account_last4, within 10-minute window. If found, update confirmed_by to 'both' instead of inserting duplicate.
5. **Image Compression:** Compress receipt images to JPEG 60-70% quality before uploading to Supabase Storage (~300KB per image).
6. **Transaction Matching:** Auto-match if AI confidence > 0.7. Flag as 'suggested' if 0.4-0.7. Leave unmatched below 0.4. User can always manually match/unmatch.
7. **Multi-card Support:** Users can have multiple payment accounts. AI auto-selects account when possible (from receipt data or bank transaction). User can override via radio buttons.

## Edge Function Pattern
All Edge Functions follow this structure:
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  // ... function logic
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

## Commands Reference
- `npx expo start` — Start dev server
- `npx expo start --clear` — Start with cache cleared
- `eas build --platform android --profile development` — Dev build for Android
- `eas build --platform ios --profile development` — Dev build for iOS
