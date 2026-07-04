import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SHADOWS } from '../constants/colors';
import { CATEGORY_MAP } from '../constants/categories';
import { supabase } from '../services/supabase';
import type { BankTransaction, RootStackParamList } from '../types';

type Route = RouteProp<RootStackParamList, 'TransactionDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function fmtAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-PK', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

const BANK_PALETTE = [
  '#005B96', '#228B22', '#6B21A8', '#B45309',
  '#0369A1', '#BE123C', '#0F766E', '#92400E',
];
function bankColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return BANK_PALETTE[Math.abs(h) % BANK_PALETTE.length];
}
function bankInitials(name: string): string {
  const words = name.split(/[\s\-_]+/).filter(Boolean);
  if (words.length === 1) return name.slice(0, 3).toUpperCase();
  return words.map((w) => w[0] ?? '').join('').slice(0, 3).toUpperCase();
}

function sourceLabel(tx: BankTransaction): string {
  if (tx.confirmed_by === 'both') return 'SMS + Email';
  return tx.source === 'sms' ? 'SMS' : 'Email';
}

// ── Detail row ─────────────────────────────────────────────────────────────────

function DetailRow({
  icon, label, value, last,
}: {
  icon: string; label: string; value: string; last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, !last && styles.detailRowDivider]}>
      <Text style={styles.detailIcon}>{icon}</Text>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function TransactionDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { transactionId } = route.params;

  const [tx, setTx] = useState<BankTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFullMessage, setShowFullMessage] = useState(false);

  useEffect(() => {
    supabase
      .from('bank_transactions')
      .select('*')
      .eq('id', transactionId)
      .single()
      .then(({ data }) => {
        setTx(data as BankTransaction);
        setLoading(false);
      });
  }, [transactionId]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (!tx) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Transaction not found.</Text>
      </View>
    );
  }

  const isDebit = tx.transaction_type === 'debit';
  const bName = tx.bank_name ?? 'Bank';
  const color = bankColor(bName);
  const catMeta = CATEGORY_MAP[tx.category ?? 'other'] ?? CATEGORY_MAP['other'];

  const rawMessage = decodeHtmlEntities(tx.raw_message ?? '');
  const MESSAGE_PREVIEW_LENGTH = 300;
  const isLongMessage = rawMessage.length > MESSAGE_PREVIEW_LENGTH;
  const displayedMessage = showFullMessage || !isLongMessage
    ? rawMessage
    : rawMessage.slice(0, MESSAGE_PREVIEW_LENGTH) + '…';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Amount hero card */}
        <View style={styles.heroCard}>
          <View style={[styles.heroBankCircle, { backgroundColor: color + '1A' }]}>
            <Text style={[styles.heroBankInitials, { color }]}>{bankInitials(bName)}</Text>
          </View>
          <Text style={styles.heroBankName}>{bName}</Text>
          <Text style={[styles.heroAmount, { color: isDebit ? COLORS.error : COLORS.tertiary }]}>
            {isDebit ? '−' : '+'}{fmtAmount(tx.amount, tx.currency)}
          </Text>
          <View style={[styles.heroBadge, { backgroundColor: isDebit ? COLORS.error + '15' : COLORS.tertiary + '15' }]}>
            <Text style={[styles.heroBadgeText, { color: isDebit ? COLORS.error : COLORS.tertiary }]}>
              {isDebit ? 'Debit' : 'Credit'}
            </Text>
          </View>
        </View>

        {/* Transaction details */}
        <View style={styles.card}>
          <DetailRow icon="📅" label="Date" value={fmtDate(tx.transaction_date)} />
          <DetailRow icon="🕐" label="Time" value={fmtTime(tx.transaction_date)} />
          {tx.merchant_hint && (
            <DetailRow icon="🏪" label="Merchant" value={tx.merchant_hint} />
          )}
          <DetailRow
            icon={catMeta.icon}
            label="Category"
            value={catMeta.name}
          />
          {tx.account_last4 && (
            <DetailRow icon="💳" label="Account" value={`••••${tx.account_last4}`} />
          )}
          {tx.balance_after != null && (
            <DetailRow
              icon="💰"
              label="Balance After"
              value={fmtAmount(tx.balance_after, tx.currency)}
            />
          )}
          {tx.reference_number && (
            <DetailRow icon="🔢" label="Reference" value={tx.reference_number} />
          )}
          <DetailRow icon="📡" label="Source" value={sourceLabel(tx)} />
          <DetailRow
            icon="✅"
            label="Match Status"
            value={tx.matched_expense_id ? 'Matched to expense' : 'Unmatched'}
            last
          />
        </View>

        {/* Linked expense */}
        {tx.matched_expense_id && (
          <TouchableOpacity
            style={styles.linkedExpenseBtn}
            onPress={() => navigation.navigate('ExpenseDetail', { expenseId: tx.matched_expense_id! })}
            activeOpacity={0.7}
          >
            <Text style={styles.linkedExpenseIcon}>🧾</Text>
            <Text style={styles.linkedExpenseText}>View Matched Expense</Text>
            <Text style={styles.linkedExpenseChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* Raw message */}
        {rawMessage.length > 0 && (
          <View style={styles.messageSection}>
            <Text style={styles.messageSectionTitle}>
              {tx.source === 'sms' ? '💬 SMS Message' : '📧 Email Message'}
            </Text>
            <View style={styles.messageCard}>
              <Text style={styles.messageText}>{displayedMessage}</Text>
              {isLongMessage && (
                <TouchableOpacity
                  onPress={() => setShowFullMessage((v) => !v)}
                  style={styles.showMoreBtn}
                >
                  <Text style={styles.showMoreText}>
                    {showFullMessage ? 'Show less' : 'Show full message'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 15, color: COLORS.muted },

  scroll: { padding: 16, gap: 14 },

  // Hero card
  heroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.card,
  },
  heroBankCircle: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  heroBankInitials: { fontSize: 16, fontWeight: '800' },
  heroBankName: { fontSize: 13, color: COLORS.muted, fontWeight: '600' },
  heroAmount: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, color: COLORS.secondary },
  heroBadge: {
    paddingHorizontal: 14, paddingVertical: 4,
    borderRadius: 999, marginTop: 2,
  },
  heroBadgeText: { fontSize: 12, fontWeight: '700' },

  // Details card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    ...SHADOWS.card,
  },
  detailRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, gap: 14,
  },
  detailRowDivider: {
    borderBottomWidth: 1, borderBottomColor: COLORS.separator,
  },
  detailIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  detailContent: { flex: 1 },
  detailLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  detailValue: { fontSize: 14, color: COLORS.onSurface, fontWeight: '600', marginTop: 2 },

  // Linked expense
  linkedExpenseBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14, padding: 16, gap: 12,
    ...SHADOWS.card,
  },
  linkedExpenseIcon: { fontSize: 20 },
  linkedExpenseText: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.primary },
  linkedExpenseChevron: { fontSize: 20, color: COLORS.muted },

  // Raw message
  messageSection: { gap: 8 },
  messageSectionTitle: {
    fontSize: 12, fontWeight: '700', color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4,
  },
  messageCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14, padding: 16,
    ...SHADOWS.card,
  },
  messageText: {
    fontSize: 13, color: COLORS.onSurfaceVariant,
    lineHeight: 20, fontFamily: 'System',
  },
  showMoreBtn: { marginTop: 10, alignSelf: 'flex-start' },
  showMoreText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
});
