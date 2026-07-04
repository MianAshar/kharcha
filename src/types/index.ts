// ─── Database row types ───────────────────────────────────────────────────────

export interface Profile {
  id: string;
  full_name: string | null;
  currency: string;
  monthly_budget: number | null;
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  account_name: string;
  account_type: AccountType;
  last4: string | null;
  bank_name: string | null;
  notification_email: string | null;
  is_default: boolean;
  color: string | null;
  created_at: string;
}

export interface Receipt {
  id: string;
  user_id: string;
  image_url: string;
  raw_ai_response: Record<string, unknown> | null;
  status: ReceiptStatus;
  uploaded_at: string;
  processed_at: string | null;
}

export interface Expense {
  id: string;
  user_id: string;
  receipt_id: string | null;
  transaction_id: string | null;
  account_id: string | null;
  merchant_name: string;
  category: string;
  amount: number;
  currency: string;
  expense_date: string;
  expense_time: string | null;
  payment_method: PaymentMethod;
  items: ExpenseItem[] | null;
  tax_amount: number | null;
  tip_amount: number | null;
  notes: string | null;
  match_status: MatchStatus;
  confidence_score: number;
  created_at: string;
}

export interface BankTransaction {
  id: string;
  user_id: string;
  source: TransactionSource;
  confirmed_by: ConfirmedBy;
  raw_message: string;
  bank_name: string;
  transaction_type: TransactionType;
  amount: number;
  currency: string;
  account_last4: string | null;
  transaction_date: string;
  merchant_hint: string | null;
  balance_after: number | null;
  reference_number: string | null;
  matched_expense_id: string | null;
  category: string | null;
  created_at: string;
}

export interface ConnectedEmail {
  id: string;
  user_id: string;
  provider: EmailProvider;
  email_address: string;
  oauth_token_encrypted: string;
  last_polled_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
}

// ─── Union / Enum types ───────────────────────────────────────────────────────

export type AccountType =
  | 'debit_card'
  | 'credit_card'
  | 'mobile_wallet'
  | 'cash'
  | 'bank_account';

export type ReceiptStatus = 'pending' | 'processed' | 'failed' | 'needs_review';

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'mobile_wallet';

export type MatchStatus =
  | 'unmatched'
  | 'matched'
  | 'suggested'
  | 'manual'
  | 'cash_only';

export type TransactionSource = 'sms' | 'email';

export type ConfirmedBy = 'sms_only' | 'email_only' | 'both';

export type TransactionType = 'debit' | 'credit';

export type EmailProvider = 'gmail' | 'outlook';

// ─── Nested / DTO types ───────────────────────────────────────────────────────

export interface ExpenseItem {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
}

export interface AIReceiptResult {
  merchant_name: string;
  category: string;
  amount: number;
  currency: string;
  expense_date: string;
  expense_time: string | null;
  payment_method: PaymentMethod;
  items: ExpenseItem[];
  tax_amount: number | null;
  tip_amount: number | null;
  confidence_score: number;
}

export interface AITransactionResult {
  is_transaction: boolean;
  bank_name: string | null;
  transaction_type: TransactionType | null;
  amount: number | null;
  currency: string | null;
  account_last4: string | null;
  transaction_date: string | null;
  merchant_hint: string | null;
  balance_after: number | null;
  reference_number: string | null;
}

// ─── Navigation param types ───────────────────────────────────────────────────

export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  Main: undefined;
  ReviewExpense: {
    imageUri: string;
    receiptId: string | null;
    aiResult: AIReceiptResult | null;
    expenseId?: string; // present when editing an existing expense
  };
  ExpenseDetail: { expenseId: string };
  ExpensesList: { filter?: string };
  TransactionsFeed: { month: string; bank?: string; category?: string };
  TransactionDetail: { transactionId: string };
};

export type MainTabParamList = {
  Home: undefined;
  ScanReceipt: undefined;
  Transactions: undefined;
  Settings: undefined;
};
