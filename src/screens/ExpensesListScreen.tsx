import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  SectionListData,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { COLORS, SHADOWS } from '../constants/colors';
import { DEFAULT_CATEGORIES, CATEGORY_MAP } from '../constants/categories';
import { RootStackParamList, Expense } from '../types';
import { useExpenses } from '../hooks/useExpenses';

type Props = NativeStackScreenProps<RootStackParamList, 'ExpensesList'>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtSectionDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function fmtRowDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

function fmtAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-PK', {
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  })}`;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Transfer',
  mobile_wallet: 'Wallet',
};

// ── Filter chip data ─────────────────────────────────────────────────────────

const ALL_CHIP = { id: 'all', name: 'All', icon: '✨', color: COLORS.primary };
const CHIPS = [ALL_CHIP, ...DEFAULT_CATEGORIES];

// ── Section type ─────────────────────────────────────────────────────────────

interface ExpenseSection {
  title: string;
  dateKey: string;
  data: Expense[];
}

// ── Header sub-component ─────────────────────────────────────────────────────

interface HeaderProps {
  search: string;
  onSearchChange: (v: string) => void;
  selectedCategory: string;
  onCategoryChange: (id: string) => void;
  sortBy: 'date' | 'amount';
  onSortChange: (s: 'date' | 'amount') => void;
}

function ExpensesListHeader({
  search, onSearchChange,
  selectedCategory, onCategoryChange,
  sortBy, onSortChange,
}: HeaderProps) {
  return (
    <View style={styles.headerContainer}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by merchant or notes…"
          placeholderTextColor={COLORS.muted}
          value={search}
          onChangeText={onSearchChange}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipsScroll}
      >
        {CHIPS.map((chip) => {
          const active = selectedCategory === chip.id;
          return (
            <TouchableOpacity
              key={chip.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onCategoryChange(chip.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.chipEmoji}>{chip.icon}</Text>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {chip.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sort toggle */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort by</Text>
        <View style={styles.sortToggle}>
          <TouchableOpacity
            style={[styles.sortBtn, sortBy === 'date' && styles.sortBtnActive]}
            onPress={() => onSortChange('date')}
            activeOpacity={0.75}
          >
            <Text style={[styles.sortBtnText, sortBy === 'date' && styles.sortBtnTextActive]}>
              📅  Date
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortBtn, sortBy === 'amount' && styles.sortBtnActive]}
            onPress={() => onSortChange('amount')}
            activeOpacity={0.75}
          >
            <Text style={[styles.sortBtnText, sortBy === 'amount' && styles.sortBtnTextActive]}>
              💰  Amount
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ExpensesListScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { expenses, loading, refresh } = useExpenses();

  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(route.params?.filter ?? 'all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');

  // Refresh on every screen focus
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      const matchesCat = selectedCategory === 'all' || e.category === selectedCategory;
      const matchesSearch =
        !q ||
        e.merchant_name.toLowerCase().includes(q) ||
        (e.notes?.toLowerCase().includes(q) ?? false);
      return matchesCat && matchesSearch;
    });
  }, [expenses, search, selectedCategory]);

  const sections: ExpenseSection[] = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'amount') return b.amount - a.amount;
      const dateDiff = b.expense_date.localeCompare(a.expense_date);
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    if (sortBy === 'amount') {
      // Flat — no date grouping
      return sorted.length > 0
        ? [{ title: '', dateKey: '__amount__', data: sorted }]
        : [];
    }

    // Group by expense_date
    const groups: Record<string, Expense[]> = {};
    for (const e of sorted) {
      if (!groups[e.expense_date]) groups[e.expense_date] = [];
      groups[e.expense_date].push(e);
    }
    return Object.entries(groups).map(([dateKey, data]) => ({
      title: fmtSectionDate(dateKey),
      dateKey,
      data,
    }));
  }, [filtered, sortBy]);

  const totalAmount = useMemo(
    () => filtered.reduce((sum, e) => sum + e.amount, 0),
    [filtered]
  );
  const currency = filtered[0]?.currency ?? expenses[0]?.currency ?? 'PKR';

  // ── Renderers ─────────────────────────────────────────────────────────────

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<Expense, ExpenseSection> }) => {
      if (!section.title) return null;
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{section.title}</Text>
        </View>
      );
    },
    []
  );

  const renderSectionFooter = useCallback(() => <View style={styles.sectionGap} />, []);

  const renderItem = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: Expense;
      index: number;
      section: SectionListData<Expense, ExpenseSection>;
    }) => {
      const cat = CATEGORY_MAP[item.category] ?? CATEGORY_MAP['other'];
      const isLast = index === section.data.length - 1;

      return (
        <TouchableOpacity
          style={[styles.row, !isLast && styles.rowDivider]}
          onPress={() => navigation.navigate('ExpenseDetail', { expenseId: item.id })}
          activeOpacity={0.7}
        >
          {/* Category circle */}
          <View style={[styles.catCircle, { backgroundColor: cat.color + '28' }]}>
            <Text style={styles.catEmoji}>{cat.icon}</Text>
          </View>

          {/* Middle: merchant + meta */}
          <View style={styles.rowInfo}>
            <Text style={styles.merchantName} numberOfLines={1}>
              {item.merchant_name}
            </Text>
            <View style={styles.rowMeta}>
              <Text style={styles.catLabel} numberOfLines={1}>
                {cat.name}
              </Text>
              <View style={styles.metaDot} />
              <View style={styles.payTag}>
                <Text style={styles.payTagText}>
                  {PAYMENT_LABELS[item.payment_method] ?? item.payment_method}
                </Text>
              </View>
            </View>
          </View>

          {/* Right: amount + date when sorting by amount */}
          <View style={styles.rowRight}>
            <Text style={styles.rowAmount}>
              {fmtAmount(item.amount, item.currency)}
            </Text>
            {sortBy === 'amount' && (
              <Text style={styles.rowDate}>{fmtRowDate(item.expense_date)}</Text>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [navigation, sortBy]
  );

  // ── Empty state ───────────────────────────────────────────────────────────

  const EmptyComponent = useMemo(() => {
    const isFiltered = search.trim().length > 0 || selectedCategory !== 'all';
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>{isFiltered ? '🔍' : '🧾'}</Text>
        <Text style={styles.emptyTitle}>
          {isFiltered ? 'No matching expenses' : 'No expenses yet'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {isFiltered
            ? 'Try adjusting your search or filters'
            : 'Scan a receipt or add an expense to get started'}
        </Text>
      </View>
    );
  }, [search, selectedCategory]);

  // ── Summary footer ────────────────────────────────────────────────────────

  const FooterComponent = useMemo(() => {
    if (filtered.length === 0) return <View style={{ height: insets.bottom + 24 }} />;
    return (
      <View style={[styles.summaryFooter, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryText}>
            {filtered.length}{' '}
            {filtered.length === 1 ? 'expense' : 'expenses'}
          </Text>
          <View style={styles.summaryDivider} />
          <Text style={[styles.summaryText, styles.summaryAmount]}>
            {fmtAmount(totalAmount, currency)}
          </Text>
        </View>
      </View>
    );
  }, [filtered.length, totalAmount, currency, insets.bottom]);

  // ── First-load spinner ────────────────────────────────────────────────────

  if (loading && expenses.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SectionList<Expense, ExpenseSection>
      style={styles.root}
      contentContainerStyle={styles.listContent}
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      renderSectionFooter={renderSectionFooter}
      ListHeaderComponent={
        <ExpensesListHeader
          search={search}
          onSearchChange={setSearch}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />
      }
      ListEmptyComponent={EmptyComponent}
      ListFooterComponent={FooterComponent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.primary}
          colors={[COLORS.primary]}
        />
      }
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
      initialNumToRender={20}
      maxToRenderPerBatch={20}
      windowSize={10}
      removeClippedSubviews
    />
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  listContent: { paddingTop: 0 },

  // ── Header ──────────────────────────────────────────────────────────────

  headerContainer: {
    paddingTop: 12,
    paddingBottom: 4,
    gap: 12,
  },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 14, height: 46,
    marginHorizontal: 16,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
    ...SHADOWS.card,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: {
    flex: 1, fontSize: 14, color: COLORS.onSurface,
    paddingVertical: 0,
  },

  chipsScroll: { flexGrow: 0 },
  chipsRow: { paddingHorizontal: 16, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipEmoji: { fontSize: 13 },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.onSurfaceVariant },
  chipTextActive: { color: '#fff' },

  sortRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, gap: 10,
  },
  sortLabel: {
    fontSize: 12, fontWeight: '600',
    color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  sortToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceContainerHighest,
    borderRadius: 999, padding: 3,
  },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 999 },
  sortBtnActive: { backgroundColor: COLORS.surface, ...SHADOWS.card },
  sortBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  sortBtnTextActive: { color: COLORS.secondary },

  // ── Section ──────────────────────────────────────────────────────────────

  sectionHeader: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
  },
  sectionHeaderText: {
    fontSize: 11, fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  sectionGap: { height: 2 },

  // ── Row ──────────────────────────────────────────────────────────────────

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13,
    backgroundColor: COLORS.surface,
    gap: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },

  catCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  catEmoji: { fontSize: 20 },

  rowInfo: { flex: 1, gap: 3, minWidth: 0 },
  merchantName: {
    fontSize: 14, fontWeight: '700', color: COLORS.secondary,
  },
  rowMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  },
  catLabel: { fontSize: 12, color: COLORS.muted, flexShrink: 1 },
  metaDot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: COLORS.outlineVariant,
  },
  payTag: {
    backgroundColor: COLORS.surfaceContainerHighest,
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 999,
  },
  payTagText: { fontSize: 11, fontWeight: '600', color: COLORS.onSurfaceVariant },

  rowRight: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  rowAmount: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  rowDate: { fontSize: 11, color: COLORS.muted },

  // ── Empty ─────────────────────────────────────────────────────────────────

  emptyContainer: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 72, paddingHorizontal: 32,
    gap: 10,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: {
    fontSize: 17, fontWeight: '700', color: COLORS.secondary, textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14, color: COLORS.muted, textAlign: 'center', lineHeight: 20,
  },

  // ── Summary footer ────────────────────────────────────────────────────────

  summaryFooter: {
    alignItems: 'center',
    paddingTop: 24, paddingHorizontal: 16,
  },
  summaryPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    paddingHorizontal: 18, paddingVertical: 10,
    gap: 12,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
    ...SHADOWS.card,
  },
  summaryDivider: {
    width: 1, height: 14,
    backgroundColor: COLORS.outlineVariant,
  },
  summaryText: {
    fontSize: 13, fontWeight: '600', color: COLORS.muted,
  },
  summaryAmount: { color: COLORS.secondary, fontWeight: '700' },
});
