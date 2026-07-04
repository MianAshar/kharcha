import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { COLORS, SHADOWS } from '../constants/colors';
import { CATEGORY_MAP } from '../constants/categories';
import { formatAmount, formatDateShort, formatTimeShort } from '../utils/format';
import { useAuth } from '../hooks/useAuth';
import { useExpenses } from '../hooks/useExpenses';
import { supabase } from '../services/supabase';
import { Expense, Account, Profile, RootStackParamList, MainTabParamList } from '../types';

// ─── Navigation type ──────────────────────────────────────────────────────────
type HomeNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ExpenseRowProps {
  expense: Expense;
  accountsMap: Map<string, Account>;
  onPress: () => void;
}

function ExpenseRow({ expense, accountsMap, onPress }: ExpenseRowProps) {
  const cat = CATEGORY_MAP[expense.category] ?? CATEGORY_MAP['other'];

  let paymentTag = '';
  if (expense.account_id) {
    const account = accountsMap.get(expense.account_id);
    if (account) paymentTag = account.account_name;
  }
  if (!paymentTag) {
    paymentTag =
      expense.payment_method === 'cash' ? 'Cash'
      : expense.payment_method === 'card' ? 'Card'
      : expense.payment_method === 'mobile_wallet' ? 'Wallet'
      : 'Transfer';
  }

  const isMatched =
    expense.match_status === 'matched' || expense.match_status === 'manual';

  return (
    <TouchableOpacity style={styles.expenseRow} onPress={onPress} activeOpacity={0.7}>
      {/* Left: icon + info */}
      <View style={styles.expenseLeft}>
        <View style={[styles.catIconBg, { backgroundColor: cat.color + '22' }]}>
          <Text style={styles.catIcon}>{cat.icon}</Text>
          <View
            style={[
              styles.matchDot,
              { backgroundColor: isMatched ? COLORS.tertiary : COLORS.primaryLight },
            ]}
          />
        </View>

        <View style={styles.expenseInfo}>
          <View style={styles.expenseNameRow}>
            <Text style={styles.merchantName} numberOfLines={1}>
              {expense.merchant_name}
            </Text>
            <View style={styles.paymentTag}>
              <Text style={styles.paymentTagText}>{paymentTag.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.expenseMeta}>
            {cat.name} • {formatDateShort(expense.expense_date)}
            {formatTimeShort(expense.expense_time) ? ` · ${formatTimeShort(expense.expense_time)}` : ''}
          </Text>
        </View>
      </View>

      {/* Right: amount + chevron */}
      <View style={styles.expenseRight}>
        <Text style={styles.expenseAmount}>₨ {formatAmount(expense.amount)}</Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>🧾</Text>
      <Text style={styles.emptyTitle}>No expenses yet</Text>
      <Text style={styles.emptyDesc}>
        Scan your first receipt to get started!
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<HomeNavigation>();
  const { user } = useAuth();
  const { expenses, loading: expensesLoading, refresh: refreshExpenses } = useExpenses();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [refreshing, setRefreshing] = useState(false);

  // ── Fetch profile + accounts ──────────────────────────────────────────────
  const fetchMeta = useCallback(async () => {
    if (!user) return;
    const [profileRes, accountsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false }),
    ]);
    if (profileRes.data) setProfile(profileRes.data as Profile);
    setAccounts((accountsRes.data as Account[]) ?? []);
  }, [user]);

  // Re-fetch every time this screen comes into focus (fix #3: stale data after scan flow)
  useFocusEffect(
    useCallback(() => {
      refreshExpenses();
      fetchMeta();
    }, [refreshExpenses, fetchMeta])
  );

  // ── Pull-to-refresh ───────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshExpenses(), fetchMeta()]);
    setRefreshing(false);
  }, [refreshExpenses, fetchMeta]);

  // ── Month navigation ──────────────────────────────────────────────────────
  const now = new Date();
  const isCurrentMonth =
    selectedMonth.getMonth() === now.getMonth() &&
    selectedMonth.getFullYear() === now.getFullYear();

  const monthLabel = selectedMonth.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  function prevMonth() {
    setSelectedMonth((d) => {
      const prev = new Date(d);
      prev.setMonth(prev.getMonth() - 1);
      return prev;
    });
  }

  function nextMonth() {
    if (isCurrentMonth) return;
    setSelectedMonth((d) => {
      const next = new Date(d);
      next.setMonth(next.getMonth() + 1);
      return next;
    });
  }

  function handleMonthPress() {
    Alert.alert('Select Month', monthLabel, [
      { text: '← Previous', onPress: prevMonth },
      ...(isCurrentMonth
        ? []
        : [{ text: 'Next →', onPress: nextMonth }]),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const monthExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        const d = new Date(e.expense_date);
        const monthMatch =
          d.getMonth() === selectedMonth.getMonth() &&
          d.getFullYear() === selectedMonth.getFullYear();
        const accountMatch =
          selectedAccountId === null || e.account_id === selectedAccountId;
        return monthMatch && accountMatch;
      }),
    [expenses, selectedMonth, selectedAccountId]
  );

  const totalSpend = useMemo(
    () => monthExpenses.reduce((sum, e) => sum + e.amount, 0),
    [monthExpenses]
  );

  const budget = profile?.monthly_budget ?? 0;
  const budgetPct = budget > 0 ? Math.min((totalSpend / budget) * 100, 100) : 0;

  const daysPassed = useMemo(() => {
    if (isCurrentMonth) return new Date().getDate();
    return new Date(
      selectedMonth.getFullYear(),
      selectedMonth.getMonth() + 1,
      0
    ).getDate();
  }, [selectedMonth, isCurrentMonth]);

  const dailyAvg = daysPassed > 0 ? totalSpend / daysPassed : 0;
  const savings = budget > 0 ? budget - totalSpend : null;

  const accountsMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  );

  // Recent = 5 most recently created, regardless of expense_date month.
  // Stats (totalSpend, budget %) still use monthExpenses for the selected month.
  const recentExpenses = useMemo(
    () =>
      [...expenses]
        .filter((e) => selectedAccountId === null || e.account_id === selectedAccountId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
    [expenses, selectedAccountId]
  );

  // ── User display ──────────────────────────────────────────────────────────
  const fullName: string =
    (profile?.full_name as string | null | undefined) ??
    (user?.user_metadata?.full_name as string | undefined) ??
    '';
  const firstName = fullName.split(' ')[0] || 'there';
  const initials = (() => {
    const parts = fullName.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return 'KH';
  })();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ── Sticky Header ─────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {/* Greeting row */}
        <View style={styles.greetingRow}>
          {/* Left: avatar + greeting */}
          <View style={styles.greetingLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View>
              <Text style={styles.salamLabel}>Salam, {firstName}</Text>
              <TouchableOpacity
                onPress={handleMonthPress}
                style={styles.monthRow}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Text style={styles.monthText}>{monthLabel}</Text>
                <Text style={styles.monthArrow}>▾</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Right: notification bell */}
          <TouchableOpacity style={styles.bellBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.bellIcon}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* Account filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsScroll}
          contentContainerStyle={styles.pillsContent}
        >
          <TouchableOpacity
            style={[styles.pill, selectedAccountId === null && styles.pillActive]}
            onPress={() => setSelectedAccountId(null)}
          >
            <Text
              style={[
                styles.pillText,
                selectedAccountId === null && styles.pillTextActive,
              ]}
            >
              All Accounts
            </Text>
          </TouchableOpacity>

          {accounts.map((account) => {
            const label = account.last4
              ? `${account.account_name} ••${account.last4}`
              : account.account_name;
            const isSelected = selectedAccountId === account.id;
            return (
              <TouchableOpacity
                key={account.id}
                style={[styles.pill, isSelected && styles.pillActive]}
                onPress={() => setSelectedAccountId(account.id)}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Scrollable Body ────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* ── Total Spend Hero Card ────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          {/* Decorative background blob */}
          <View style={styles.heroBlobTop} />
          <View style={styles.heroBlobBottom} />

          <View style={styles.heroContent}>
            <Text style={styles.heroLabel}>TOTAL SPEND THIS MONTH</Text>
            <Text style={styles.heroAmount}>₨ {formatAmount(totalSpend)}</Text>

            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: budget > 0 ? (`${budgetPct.toFixed(1)}%` as `${number}%`) : '0%',
                      backgroundColor:
                        budgetPct >= 90 ? '#E94560' : COLORS.primary,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressLabel}>
                {budget > 0
                  ? `${Math.round(budgetPct)}% of budget`
                  : 'No budget set'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Quick Stats ──────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { marginRight: 6 }]}>
            <Text style={styles.statLabel}>DAILY AVG</Text>
            <Text style={styles.statValue}>
              ₨ {formatAmount(Math.round(dailyAvg))}
            </Text>
          </View>
          <View style={[styles.statCard, { marginLeft: 6 }]}>
            <Text style={styles.statLabel}>SAVINGS</Text>
            <Text
              style={[
                styles.statValue,
                {
                  color:
                    savings === null
                      ? COLORS.onSurfaceVariant
                      : savings >= 0
                      ? COLORS.tertiary
                      : COLORS.primary,
                },
              ]}
            >
              {savings === null
                ? '—'
                : savings < 0
                ? `-₨ ${formatAmount(Math.abs(savings))}`
                : `₨ ${formatAmount(savings)}`}
            </Text>
          </View>
        </View>

        {/* ── Recent Expenses ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Expenses</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('ExpensesList', {})}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.viewAllText}>VIEW ALL</Text>
            </TouchableOpacity>
          </View>

          {expensesLoading && !refreshing ? (
            <ActivityIndicator
              color={COLORS.primary}
              style={{ marginTop: 32 }}
            />
          ) : recentExpenses.length === 0 ? (
            <EmptyState />
          ) : (
            recentExpenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                accountsMap={accountsMap}
                onPress={() =>
                  navigation.navigate('ExpenseDetail', {
                    expenseId: expense.id,
                  })
                }
              />
            ))
          )}
        </View>

        {/* Space for FAB */}
        <View style={{ height: 88 }} />
      </ScrollView>

      {/* ── FAB ───────────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 80 }]}
        onPress={() => (navigation as any).navigate('ScanReceipt')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>📷</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── Header
  header: {
    backgroundColor: COLORS.background,
    paddingBottom: 4,
    // Subtle bottom shadow to separate from scroll content
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    zIndex: 10,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  greetingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  salamLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.onSurface,
    lineHeight: 24,
  },
  monthArrow: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    lineHeight: 20,
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: {
    fontSize: 22,
  },

  // Account pills
  pillsScroll: {
    flexGrow: 0,
  },
  pillsContent: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    gap: 8,
    flexDirection: 'row',
  },
  pill: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 100,
    ...SHADOWS.card,
  },
  pillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.onSurface,
  },
  pillTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  // ── Scroll body
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // ── Hero card
  heroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
    ...SHADOWS.card,
  },
  // Decorative background blobs (purely visual)
  heroBlobTop: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: COLORS.primary + '08',
  },
  heroBlobBottom: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: COLORS.primary + '06',
  },
  heroContent: {
    padding: 24,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroAmount: {
    fontSize: 40,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: -0.8,
    lineHeight: 48,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.progressTrack,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 0.4,
    minWidth: 90,
    textAlign: 'right',
  },

  // ── Stat cards
  statsRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    ...SHADOWS.card,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.onSurface,
    lineHeight: 28,
  },

  // ── Section
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.6,
  },

  // ── Expense row
  expenseRow: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    ...SHADOWS.card,
  },
  expenseLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  catIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  catIcon: {
    fontSize: 22,
    lineHeight: 28,
  },
  matchDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  merchantName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.onSurface,
    flexShrink: 1,
  },
  paymentTag: {
    backgroundColor: COLORS.surfaceContainerHighest,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  paymentTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    letterSpacing: 0.4,
  },
  expenseMeta: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    lineHeight: 18,
  },
  expenseRight: {
    alignItems: 'flex-end',
    gap: 2,
    marginLeft: 8,
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  chevron: {
    fontSize: 20,
    color: COLORS.onSurfaceVariant,
    lineHeight: 22,
  },

  // ── Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 52,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.onSurface,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 24,
    lineHeight: 28,
  },
});
