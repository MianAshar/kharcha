import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SHADOWS } from '../constants/colors';
import { CATEGORY_MAP } from '../constants/categories';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase';
import type { BankTransaction, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0); // day 0 of next month = last day of this month
  return d.toISOString().slice(0, 10);
}

function fmtAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-PK', {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function MonthlyTransactionsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based

  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── Date range ──────────────────────────────────────────────────────────────
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const dateTo = lastDayOfMonth(year, month);

  // ── Fetch transactions for selected month ───────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('user_id', user.id)
      .gte('transaction_date', dateFrom)
      .lte('transaction_date', dateTo + 'T23:59:59')
      .order('transaction_date', { ascending: false })
      .limit(500);
    setTransactions((data as BankTransaction[]) ?? []);
    setLoading(false);
  }, [user, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Pull to refresh — fetch emails for this month ───────────────────────────
  const onRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      await supabase.functions.invoke('parse-bank-email', {
        body: { user_id: user.id, date_from: dateFrom, date_to: dateTo },
      });
    } catch (e) {
      console.warn('[MonthlyTx] email poll failed:', e);
    }
    await fetchData();
    setRefreshing(false);
  }, [user, dateFrom, dateTo, fetchData]);

  // ── Month navigation ────────────────────────────────────────────────────────
  const goToPrevMonth = useCallback(() => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }, [month]);

  const goToNextMonth = useCallback(() => {
    const nextIsInFuture = year === now.getFullYear() && month === now.getMonth() + 1;
    if (nextIsInFuture) return;
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }, [month, year, now]);

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  // ── Derived summaries ───────────────────────────────────────────────────────
  const debits = useMemo(() => transactions.filter((t) => t.transaction_type === 'debit'), [transactions]);
  const credits = useMemo(() => transactions.filter((t) => t.transaction_type === 'credit'), [transactions]);

  const totalSpent = useMemo(() => debits.reduce((s, t) => s + t.amount, 0), [debits]);
  const totalReceived = useMemo(() => credits.reduce((s, t) => s + t.amount, 0), [credits]);
  const currency = transactions[0]?.currency ?? 'PKR';

  const byBank = useMemo(() => {
    const map = new Map<string, number>();
    debits.forEach((t) => {
      const b = t.bank_name ?? 'Unknown';
      map.set(b, (map.get(b) ?? 0) + t.amount);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([bank, amount]) => ({ bank, amount }));
  }, [debits]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    debits.forEach((t) => {
      const cat = t.category ?? 'other';
      map.set(cat, (map.get(cat) ?? 0) + t.amount);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, amount]) => {
        const meta = CATEGORY_MAP[id] ?? CATEGORY_MAP['other'];
        return { id, amount, name: meta.name, icon: meta.icon, color: meta.color };
      });
  }, [debits]);

  const recentTxs = useMemo(() => transactions.slice(0, 5), [transactions]);

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Transactions</Text>
      </View>

      {/* Month navigator */}
      <View style={styles.monthNav}>
        <TouchableOpacity style={styles.monthArrow} onPress={goToPrevMonth} activeOpacity={0.7}>
          <Text style={styles.monthArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity
          style={[styles.monthArrow, isCurrentMonth && styles.monthArrowDisabled]}
          onPress={goToNextMonth}
          activeOpacity={isCurrentMonth ? 1 : 0.7}
        >
          <Text style={[styles.monthArrowText, isCurrentMonth && styles.monthArrowTextDisabled]}>›</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No transactions</Text>
              <Text style={styles.emptySubtitle}>
                Pull down to fetch {MONTH_NAMES[month - 1]}'s transactions from your email.
              </Text>
            </View>
          ) : (
            <>
              {/* Summary card */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Spent</Text>
                    <Text style={[styles.summaryAmount, { color: COLORS.error }]}>
                      {fmtAmount(totalSpent, currency)}
                    </Text>
                  </View>
                  <View style={styles.summarySep} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Received</Text>
                    <Text style={[styles.summaryAmount, { color: COLORS.tertiary }]}>
                      {fmtAmount(totalReceived, currency)}
                    </Text>
                  </View>
                  <View style={styles.summarySep} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Net</Text>
                    <Text style={[
                      styles.summaryAmount,
                      { color: totalReceived - totalSpent >= 0 ? COLORS.tertiary : COLORS.error },
                    ]}>
                      {totalReceived - totalSpent >= 0 ? '+' : '−'}
                      {fmtAmount(Math.abs(totalReceived - totalSpent), currency)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* By bank */}
              {byBank.length > 0 && (
                <Section title="By Bank">
                  {byBank.map(({ bank, amount }, i) => {
                    const color = bankColor(bank);
                    const isLast = i === byBank.length - 1;
                    return (
                      <TouchableOpacity
                        key={bank}
                        style={[styles.bankRow, !isLast && styles.rowDivider]}
                        onPress={() =>
                          navigation.navigate('TransactionsFeed', {
                            month: `${year}-${String(month).padStart(2, '0')}`,
                            bank,
                          })
                        }
                        activeOpacity={0.7}
                      >
                        <View style={[styles.bankCircle, { backgroundColor: color + '1A' }]}>
                          <Text style={[styles.bankInitials, { color }]}>{bankInitials(bank)}</Text>
                        </View>
                        <Text style={styles.bankName} numberOfLines={1}>{bank}</Text>
                        <Text style={[styles.bankAmount, { color: COLORS.error }]}>
                          −{fmtAmount(amount, currency)}
                        </Text>
                        <Text style={styles.rowChevron}>›</Text>
                      </TouchableOpacity>
                    );
                  })}
                </Section>
              )}

              {/* By category */}
              {byCategory.length > 0 && (
                <Section title="By Category">
                  {byCategory.map(({ id, amount, name, icon, color }, i) => {
                    const pct = totalSpent > 0 ? amount / totalSpent : 0;
                    const isLast = i === byCategory.length - 1;
                    return (
                      <TouchableOpacity
                        key={id}
                        style={[styles.catRow, !isLast && styles.rowDivider]}
                        onPress={() =>
                          navigation.navigate('TransactionsFeed', {
                            month: `${year}-${String(month).padStart(2, '0')}`,
                            category: id,
                          })
                        }
                        activeOpacity={0.7}
                      >
                        <View style={[styles.catIcon, { backgroundColor: color + '22' }]}>
                          <Text style={styles.catEmoji}>{icon}</Text>
                        </View>
                        <View style={styles.catBody}>
                          <View style={styles.catTopRow}>
                            <Text style={styles.catName}>{name}</Text>
                            <Text style={styles.catAmount}>{fmtAmount(amount, currency)}</Text>
                          </View>
                          <View style={styles.barTrack}>
                            <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
                          </View>
                        </View>
                        <Text style={styles.rowChevron}>›</Text>
                      </TouchableOpacity>
                    );
                  })}
                </Section>
              )}

              {/* Recent transactions */}
              <Section title="Recent">
                {recentTxs.map((tx, i) => {
                  const isDebit = tx.transaction_type === 'debit';
                  const isLast = i === recentTxs.length - 1;
                  const bName = tx.bank_name ?? 'Bank';
                  const color = bankColor(bName);
                  return (
                    <TouchableOpacity
                      key={tx.id}
                      style={[styles.txRow, !isLast && styles.rowDivider]}
                      onPress={() => navigation.navigate('TransactionDetail', { transactionId: tx.id })}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.txCircle, { backgroundColor: color + '1A' }]}>
                        <Text style={[styles.txInitials, { color }]}>{bankInitials(bName)}</Text>
                      </View>
                      <View style={styles.txBody}>
                        <Text style={styles.txMerchant} numberOfLines={1}>
                          {tx.merchant_hint ?? bName}
                        </Text>
                        <Text style={styles.txDate}>{fmtDate(tx.transaction_date)}</Text>
                      </View>
                      <Text style={[styles.txAmount, { color: isDebit ? COLORS.error : COLORS.tertiary }]}>
                        {isDebit ? '−' : '+'}{fmtAmount(tx.amount, tx.currency)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                <TouchableOpacity
                  style={styles.viewAllBtn}
                  onPress={() =>
                    navigation.navigate('TransactionsFeed', {
                      month: `${year}-${String(month).padStart(2, '0')}`,
                    })
                  }
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewAllText}>View All Transactions</Text>
                  <Text style={styles.viewAllChevron}>›</Text>
                </TouchableOpacity>
              </Section>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  header: { paddingHorizontal: 20, paddingBottom: 4, paddingTop: 12 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: COLORS.secondary },

  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 24,
  },
  monthArrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthArrowDisabled: { opacity: 0.25 },
  monthArrowText: { fontSize: 28, color: COLORS.secondary, fontWeight: '300', lineHeight: 32 },
  monthArrowTextDisabled: { color: COLORS.muted },
  monthLabel: { fontSize: 17, fontWeight: '700', color: COLORS.secondary, minWidth: 140, textAlign: 'center' },

  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingHorizontal: 16, paddingTop: 4, gap: 16 },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.secondary },
  emptySubtitle: { fontSize: 13, color: COLORS.muted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },

  // Summary card
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16, padding: 20,
    ...SHADOWS.card,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summarySep: { width: 1, height: 36, backgroundColor: COLORS.separator },
  summaryLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryAmount: { fontSize: 13, fontWeight: '800' },

  // Section
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  sectionCard: { backgroundColor: COLORS.surface, borderRadius: 14, paddingHorizontal: 14, ...SHADOWS.card },

  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.separator },
  rowChevron: { fontSize: 18, color: COLORS.muted, marginLeft: 4 },

  // Bank rows
  bankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  bankCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  bankInitials: { fontSize: 11, fontWeight: '800' },
  bankName: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  bankAmount: { fontSize: 14, fontWeight: '700' },

  // Category rows
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  catIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  catEmoji: { fontSize: 18 },
  catBody: { flex: 1, gap: 6 },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catName: { fontSize: 13, fontWeight: '600', color: COLORS.onSurface },
  catAmount: { fontSize: 13, fontWeight: '700', color: COLORS.onSurface },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: COLORS.outlineVariant },
  barFill: { height: 4, borderRadius: 2 },

  // Recent tx rows
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  txCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  txInitials: { fontSize: 10, fontWeight: '800' },
  txBody: { flex: 1 },
  txMerchant: { fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  txDate: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  txAmount: { fontSize: 13, fontWeight: '700' },

  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 4,
  },
  viewAllText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  viewAllChevron: { fontSize: 18, color: COLORS.primary },
});
