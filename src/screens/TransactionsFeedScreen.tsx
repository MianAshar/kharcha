import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SHADOWS } from '../constants/colors';
import { useExpenses } from '../hooks/useExpenses';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase';
import { matchTransactionToExpense } from '../services/transactions';
import type { BankTransaction, Expense, RootStackParamList } from '../types';

type FeedRoute = RouteProp<RootStackParamList, 'TransactionsFeed'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Types ──────────────────────────────────────────────────────────────────────

interface TxSection {
  title: string;
  data: BankTransaction[];
  debitTotal: number;
  currency: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function fmtAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-PK', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

function toDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const txDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (txDay.getTime() === today.getTime()) return 'Today';
  if (txDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function groupByDate(txns: BankTransaction[]): TxSection[] {
  const map = new Map<string, BankTransaction[]>();
  for (const tx of txns) {
    const label = toDateLabel(tx.transaction_date);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(tx);
  }
  return Array.from(map.entries()).map(([title, data]) => {
    const debits = data.filter((t) => t.transaction_type === 'debit');
    const debitTotal = debits.reduce((sum, t) => sum + t.amount, 0);
    const currency = debits[0]?.currency ?? data[0]?.currency ?? 'PKR';
    return { title, data, debitTotal, currency };
  });
}

function sourceIcon(tx: BankTransaction): string {
  if (tx.confirmed_by === 'both') return '💬 📧';
  return tx.source === 'sms' ? '💬' : '📧';
}

// ── Transaction card ───────────────────────────────────────────────────────────

interface TxCardProps {
  tx: BankTransaction;
  onMatchPress: (tx: BankTransaction) => void;
  onPress: (tx: BankTransaction) => void;
}

function TxCard({ tx, onMatchPress, onPress }: TxCardProps) {
  const isDebit = tx.transaction_type === 'debit';
  const isMatched = tx.matched_expense_id !== null;
  const bName = tx.bank_name ?? 'Bank';
  const color = bankColor(bName);

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(tx)} activeOpacity={0.75}>
      <View style={[styles.bankCircle, { backgroundColor: color + '1A' }]}>
        <Text style={[styles.bankInitials, { color }]}>{bankInitials(bName)}</Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          {/* Left column */}
          <View style={styles.cardLeft}>
            <Text style={styles.cardMerchant} numberOfLines={1}>
              {tx.merchant_hint ?? bName}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>{fmtDate(tx.transaction_date)}, {fmtTime(tx.transaction_date)}</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.metaText}>{sourceIcon(tx)}</Text>
            </View>
          </View>

          {/* Right column */}
          <View style={styles.cardRight}>
            <Text style={[styles.cardAmount, { color: isDebit ? COLORS.error : COLORS.tertiary }]}>
              {isDebit ? '−' : '+'}{fmtAmount(tx.amount, tx.currency)}
            </Text>
            <View style={styles.badgeRow}>
              {isMatched ? (
                <View style={styles.badgeMatched}>
                  <Text style={styles.badgeMatchedText}>Matched</Text>
                </View>
              ) : (
                <>
                  <View style={styles.badgeUnmatched}>
                    <Text style={styles.badgeUnmatchedText}>Unmatched</Text>
                  </View>
                  {isDebit && (
                    <TouchableOpacity
                      style={styles.matchBtn}
                      onPress={() => onMatchPress(tx)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.matchBtnText}>Match</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function TransactionsFeedScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const route = useRoute<FeedRoute>();
  const { month, bank: bankParam, category: categoryParam } = route.params;
  const { expenses, refresh: refreshExpenses } = useExpenses();

  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBank, setActiveBank] = useState<string | null>(bankParam ?? null);
  const [activeCategory] = useState<string | null>(categoryParam ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const [matchingTx, setMatchingTx] = useState<BankTransaction | null>(null);
  const [linking, setLinking] = useState(false);

  // Compute date range from "YYYY-MM" month param
  const dateFrom = `${month}-01`;
  const [yr, mo] = month.split('-').map(Number);
  const dateTo = new Date(yr, mo, 0).toISOString().slice(0, 10); // last day of month

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('bank_transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('transaction_date', dateFrom)
        .lte('transaction_date', dateTo + 'T23:59:59')
        .order('transaction_date', { ascending: false })
        .limit(500);
      if (err) throw err;
      setTransactions((data as BankTransaction[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), refreshExpenses()]);
    setRefreshing(false);
  }, [fetchData, refreshExpenses]);

  const banks = useMemo(() => {
    const names = new Set(transactions.map((t) => t.bank_name ?? 'Unknown'));
    return Array.from(names).sort();
  }, [transactions]);

  const filtered = useMemo(() => {
    let result = transactions;
    if (activeBank) result = result.filter((t) => (t.bank_name ?? 'Unknown') === activeBank);
    if (activeCategory) result = result.filter((t) => (t.category ?? 'other') === activeCategory);
    return result;
  }, [transactions, activeBank, activeCategory]);

  const sections = useMemo(() => groupByDate(filtered), [filtered]);

  const unmatchedExpenses = useMemo(
    () => expenses.filter((e) => e.match_status === 'unmatched' || e.match_status === 'suggested'),
    [expenses]
  );

  const handleLink = useCallback(async (expense: Expense) => {
    if (!matchingTx) return;
    setLinking(true);
    try {
      await matchTransactionToExpense(matchingTx.id, expense.id);
      await Promise.all([fetchData(), refreshExpenses()]);
      setMatchingTx(null);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to link transaction.');
    } finally {
      setLinking(false);
    }
  }, [matchingTx, fetchData, refreshExpenses]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Transactions</Text>
      </View>

      {/* Bank filter — only shown when >1 bank */}
      {banks.length > 1 && (
        <View style={styles.bankBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bankBarContent}
          >
            <TouchableOpacity
              style={[styles.bankChip, activeBank === null && styles.bankChipActive]}
              onPress={() => setActiveBank(null)}
              activeOpacity={0.75}
            >
              <Text style={[styles.bankChipText, activeBank === null && styles.bankChipTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            {banks.map((bank) => {
              const active = activeBank === bank;
              return (
                <TouchableOpacity
                  key={bank}
                  style={[styles.bankChip, active && styles.bankChipActive]}
                  onPress={() => setActiveBank(active ? null : bank)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.bankChipText, active && styles.bankChipTextActive]}>
                    {bank}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Loading */}
      {loading && !refreshing && (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      )}

      {/* Error */}
      {!!error && !loading && (
        <View style={styles.centerState}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Something went wrong</Text>
          <Text style={styles.emptySubtitle}>{error}</Text>
        </View>
      )}

      {/* List */}
      {!loading && !error && (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            sections.length === 0 && styles.listEmpty,
            { paddingBottom: insets.bottom + 100 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          renderSectionHeader={({ section: { title, debitTotal, currency } }) => (
            <View style={styles.dateHeader}>
              <Text style={styles.dateHeaderText}>{title}</Text>
              {debitTotal > 0 && (
                <Text style={styles.dateHeaderTotal}>
                  −{currency} {debitTotal.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                </Text>
              )}
            </View>
          )}
          renderItem={({ item }) => (
            <TxCard
              tx={item}
              onMatchPress={setMatchingTx}
              onPress={(tx) => navigation.navigate('TransactionDetail', { transactionId: tx.id })}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💳</Text>
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptySubtitle}>
                Connect your email or enable SMS reading to start tracking.
              </Text>
            </View>
          }
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* Match modal */}
      <Modal
        visible={matchingTx !== null}
        animationType="slide"
        transparent
        onRequestClose={() => !linking && setMatchingTx(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Link to Expense</Text>
            {matchingTx && (
              <Text style={styles.modalSubtitle}>
                {fmtAmount(matchingTx.amount, matchingTx.currency)} · {fmtDate(matchingTx.transaction_date)}
              </Text>
            )}

            {linking ? (
              <View style={styles.modalLoadingRow}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : unmatchedExpenses.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyTitle}>No unmatched expenses</Text>
                <Text style={styles.emptySubtitle}>
                  All card expenses are already linked.
                </Text>
              </View>
            ) : (
              <SectionList
                sections={[{ title: '', data: unmatchedExpenses }]}
                keyExtractor={(item) => item.id}
                style={styles.modalList}
                renderItem={({ item: exp }) => (
                  <TouchableOpacity
                    style={styles.expRow}
                    onPress={() => handleLink(exp)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.expRowLeft}>
                      <Text style={styles.expMerchant} numberOfLines={1}>
                        {exp.merchant_name}
                      </Text>
                      <Text style={styles.expDate}>
                        {new Date(exp.expense_date + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </Text>
                    </View>
                    <Text style={styles.expAmount}>
                      {exp.currency} {exp.amount.toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                )}
                renderSectionHeader={() => null}
                showsVerticalScrollIndicator={false}
              />
            )}

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setMatchingTx(null)}
              disabled={linking}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    paddingTop: 12,
    backgroundColor: COLORS.background,
  },
  headerTitle: {
    fontSize: 24, fontWeight: '700', color: COLORS.secondary,
  },

  bankBar: {
    height: 52,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
  },
  bankBarContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
    flexDirection: 'row',
  },
  bankChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.outlineVariant,
  },
  bankChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  bankChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  bankChipTextActive: { color: '#fff' },

  dateHeader: {
    paddingTop: 16, paddingBottom: 6, paddingHorizontal: 4,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dateHeaderText: {
    fontSize: 12, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateHeaderTotal: {
    fontSize: 13, fontWeight: '700', color: COLORS.error,
  },

  centerState: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32,
  },

  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  listEmpty: { flex: 1, justifyContent: 'center' },

  emptyState: { alignItems: 'center', padding: 40, gap: 8 },
  emptyIcon: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.secondary, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: COLORS.muted, textAlign: 'center', lineHeight: 19 },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    ...SHADOWS.card,
  },
  bankCircle: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  bankInitials: { fontSize: 12, fontWeight: '800', letterSpacing: -0.3 },
  cardBody: { flex: 1, minWidth: 0 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardLeft: { flex: 1, minWidth: 0, paddingRight: 8 },
  cardMerchant: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  metaText: { fontSize: 11, color: COLORS.onSurfaceVariant },
  metaDot: { fontSize: 11, color: COLORS.muted },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  cardAmount: { fontSize: 14, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  badgeMatched: {
    backgroundColor: '#006A4218', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
  },
  badgeMatchedText: { fontSize: 10, fontWeight: '800', color: COLORS.tertiary },

  badgeUnmatched: {
    backgroundColor: COLORS.surfaceContainerHighest, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
  },
  badgeUnmatchedText: { fontSize: 10, fontWeight: '700', color: COLORS.onSurfaceVariant },

  matchBtn: {
    borderWidth: 1, borderColor: COLORS.primary,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  matchBtnText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },

  // Modal
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 16,
    maxHeight: '72%',
    ...SHADOWS.modal,
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: COLORS.outlineVariant,
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '700', color: COLORS.secondary, textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13, color: COLORS.muted, textAlign: 'center', marginTop: 4, marginBottom: 16,
  },
  modalLoadingRow: { alignItems: 'center', paddingVertical: 32 },
  modalList: { maxHeight: 340 },

  expRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.separator,
  },
  expRowLeft: { flex: 1, minWidth: 0 },
  expMerchant: { fontSize: 15, fontWeight: '600', color: COLORS.secondary },
  expDate: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  expAmount: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface, marginLeft: 12 },

  cancelBtn: {
    marginTop: 12, height: 48, borderRadius: 999,
    borderWidth: 1.5, borderColor: COLORS.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.onSurfaceVariant },
});
