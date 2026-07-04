import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS } from '../constants/colors';
import { CATEGORY_MAP } from '../constants/categories';
import { RootStackParamList, Expense, BankTransaction } from '../types';
import { getExpenseById, deleteExpense } from '../services/expenses';
import { supabase } from '../services/supabase';

type Props = NativeStackScreenProps<RootStackParamList, 'ExpenseDetail'>;

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function fmtTime(timeStr: string | null): string {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-PK', {
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  })}`;
}

function fmtTxDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ExpenseDetailScreen({ route, navigation }: Props) {
  const { expenseId } = route.params;
  const insets = useSafeAreaInsets();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const [linkedTx, setLinkedTx] = useState<BankTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [imageModal, setImageModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoadError(null);
    try {
      const exp = await getExpenseById(expenseId);
      if (!exp) { setLoadError('Expense not found'); return; }
      setExpense(exp);

      // Fetch receipt image in parallel with linked transaction
      const [receiptResult, txResult] = await Promise.all([
        exp.receipt_id
          ? supabase.from('receipts').select('image_url').eq('id', exp.receipt_id).single()
          : Promise.resolve({ data: null, error: null }),
        exp.transaction_id
          ? supabase.from('bank_transactions').select('*').eq('id', exp.transaction_id).single()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const rawImageUrl = (receiptResult.data as { image_url: string } | null)?.image_url ?? null;
      if (rawImageUrl) {
        // Bucket may be private — generate a signed URL (1 h TTL) so the Image component can load it.
        const marker = '/object/public/receipts/';
        const markerIdx = rawImageUrl.indexOf(marker);
        if (markerIdx !== -1) {
          const storagePath = rawImageUrl.slice(markerIdx + marker.length);
          const { data: signedData } = await supabase.storage
            .from('receipts')
            .createSignedUrl(storagePath, 3600);
          setReceiptImageUrl(signedData?.signedUrl ?? rawImageUrl);
        } else {
          setReceiptImageUrl(rawImageUrl);
        }
      } else {
        setReceiptImageUrl(null);
      }
      setLinkedTx((txResult.data as BankTransaction | null) ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load expense');
    }
  }, [expenseId]);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const handleDelete = useCallback(() => {
    if (!expense) return;
    Alert.alert(
      'Delete Expense',
      `Delete "${expense.merchant_name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              // Fetch the receipt image_url NOW (fresh, before we delete anything)
              // so we always have it even if component state is stale.
              let imageUrlToDelete: string | null = null;
              if (expense.receipt_id) {
                const { data: receiptRow } = await supabase
                  .from('receipts')
                  .select('image_url')
                  .eq('id', expense.receipt_id)
                  .single();
                imageUrlToDelete = receiptRow?.image_url ?? null;
              }

              // 1. Delete the expense row
              await deleteExpense(expense.id);

              // 2. Delete the image file from Supabase Storage
              if (imageUrlToDelete) {
                const marker = '/object/public/receipts/';
                const idx = imageUrlToDelete.indexOf(marker);
                if (idx !== -1) {
                  const storagePath = imageUrlToDelete.slice(idx + marker.length);
                  const { error: storageErr } = await supabase.storage
                    .from('receipts')
                    .remove([storagePath]);
                  if (storageErr) {
                    console.warn('[delete] storage remove failed:', storageErr.message);
                  }
                }
              }

              // 3. Delete the receipt row last (after storage, so URL is available for retry)
              if (expense.receipt_id) {
                await supabase
                  .from('receipts')
                  .delete()
                  .eq('id', expense.receipt_id);
              }

              // goBack triggers useFocusEffect on HomeScreen → auto-refresh
              navigation.goBack();
            } catch (err) {
              setDeleting(false);
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete.');
            }
          },
        },
      ]
    );
  }, [expense, receiptImageUrl, navigation]);

  const handleEdit = useCallback(() => {
    if (!expense) return;
    navigation.navigate('ReviewExpense', {
      imageUri: receiptImageUrl ?? '',
      receiptId: expense.receipt_id,
      expenseId: expense.id,
      aiResult: {
        merchant_name: expense.merchant_name,
        category: expense.category,
        amount: expense.amount,
        currency: expense.currency,
        expense_date: expense.expense_date,
        expense_time: expense.expense_time,
        payment_method: expense.payment_method,
        items: expense.items ?? [],
        tax_amount: expense.tax_amount,
        tip_amount: expense.tip_amount,
        confidence_score: expense.confidence_score,
      },
    });
  }, [expense, receiptImageUrl, navigation]);

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.fullCenter}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (loadError || !expense) {
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.errorText}>{loadError ?? 'Expense not found'}</Text>
      </View>
    );
  }

  const category = CATEGORY_MAP[expense.category] ?? CATEGORY_MAP['other'];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Hero: thumbnail + merchant name + category badge */}
        <View style={styles.heroSection}>
          <TouchableOpacity
            style={styles.thumbnail}
            onPress={() => receiptImageUrl && setImageModal(true)}
            activeOpacity={receiptImageUrl ? 0.75 : 1}
          >
            {receiptImageUrl ? (
              <Image
                source={{ uri: receiptImageUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.thumbnailFallback}>🧾</Text>
            )}
          </TouchableOpacity>

          <View style={styles.heroText}>
            <Text style={styles.merchantName} numberOfLines={2}>
              {expense.merchant_name}
            </Text>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryIcon}>{category.icon}</Text>
              <Text style={styles.categoryName}>{category.name}</Text>
            </View>
          </View>
        </View>

        {/* Details card */}
        <View style={styles.card}>
          <View style={styles.detailGrid}>
            <View style={styles.detailCell}>
              <Text style={styles.detailLabel}>Amount</Text>
              <Text style={styles.detailAmount}>{fmtAmount(expense.amount, expense.currency)}</Text>
            </View>
            <View style={styles.detailCell}>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{fmtDate(expense.expense_date)}</Text>
            </View>
            <View style={styles.detailCell}>
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>{fmtTime(expense.expense_time)}</Text>
            </View>
            <View style={styles.detailCell}>
              <Text style={styles.detailLabel}>Paid With</Text>
              <Text style={styles.detailValue}>
                {expense.payment_method === 'cash' ? '💵  Cash' : '💳  Card'}
              </Text>
            </View>
          </View>
        </View>

        {/* Line items */}
        {expense.items && expense.items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ITEMS</Text>
            <View style={styles.card}>
              {/* Table header */}
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.colName, styles.tableHeaderText]}>Item Name</Text>
                <Text style={[styles.colQty, styles.tableHeaderText]}>Qty</Text>
                <Text style={[styles.colPrice, styles.tableHeaderText]}>Price</Text>
              </View>
              {expense.items.map((item, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.tableRow,
                    idx < expense.items!.length - 1 && styles.tableRowDivider,
                  ]}
                >
                  <Text style={[styles.colName, styles.tableCell]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={[styles.colQty, styles.tableCell]}>{item.qty}</Text>
                  <Text style={[styles.colPrice, styles.tableCell]}>
                    {expense.currency} {item.total.toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Bank sync */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BANK SYNC</Text>

          {linkedTx ? (
            <View style={[styles.card, styles.matchedCard]}>
              <View style={styles.matchedTopRow}>
                <View style={styles.matchedMeta}>
                  <Text style={styles.matchedTitle}>Linked Bank Transaction</Text>
                  {linkedTx.reference_number && (
                    <Text style={styles.matchedRef}>Ref: {linkedTx.reference_number}</Text>
                  )}
                </View>
                <View style={styles.matchedBadge}>
                  <Text style={styles.matchedBadgeText}>✓ Matched</Text>
                </View>
              </View>

              <View style={styles.matchedBottomRow}>
                <View style={styles.bankRow}>
                  <View style={styles.bankCircle}>
                    <Text style={styles.bankCircleIcon}>🏦</Text>
                  </View>
                  <View>
                    <Text style={styles.bankName}>{linkedTx.bank_name}</Text>
                    <Text style={styles.bankDate}>{fmtTxDate(linkedTx.transaction_date)}</Text>
                  </View>
                </View>
                <Text style={styles.matchedAmount}>
                  {fmtAmount(linkedTx.amount, linkedTx.currency)}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.unmatchedRow}>
                <Text style={styles.unmatchedText}>No matching transaction</Text>
                <View style={styles.unmatchedBadge}>
                  <Text style={styles.unmatchedBadgeText}>
                    {expense.match_status === 'cash_only' ? 'Cash' : 'Unmatched'}
                  </Text>
                </View>
              </View>
              {expense.match_status === 'cash_only' && (
                <Text style={styles.cashHint}>Cash payment — no bank record expected.</Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer actions */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.editBtn} onPress={handleEdit} activeOpacity={0.75}>
          <Text style={styles.editBtnText}>✏️  Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.deleteBtn, deleting && styles.btnDisabled]}
          onPress={handleDelete}
          disabled={deleting}
          activeOpacity={0.75}
        >
          {deleting
            ? <ActivityIndicator color={COLORS.error} size="small" />
            : <Text style={styles.deleteBtnText}>🗑️  Delete</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Full-screen image modal */}
      <Modal
        visible={imageModal}
        animationType="fade"
        transparent
        onRequestClose={() => setImageModal(false)}
      >
        <View style={styles.imageModalBg}>
          <TouchableOpacity
            style={styles.imageModalClose}
            onPress={() => setImageModal(false)}
          >
            <Text style={styles.imageModalCloseText}>✕</Text>
          </TouchableOpacity>
          {receiptImageUrl && (
            <Image
              source={{ uri: receiptImageUrl }}
              style={styles.imageModalImg}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  fullCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  errorText: { fontSize: 15, color: COLORS.muted, textAlign: 'center', paddingHorizontal: 32 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  // Hero
  heroSection: {
    flexDirection: 'row', alignItems: 'center',
    gap: 16,
  },
  thumbnail: {
    width: 64, height: 64, borderRadius: 14,
    backgroundColor: COLORS.surfaceContainer,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  thumbnailFallback: { fontSize: 28 },
  heroText: { flex: 1, gap: 8 },
  merchantName: { fontSize: 22, fontWeight: '700', color: COLORS.secondary, lineHeight: 28 },
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    alignSelf: 'flex-start', gap: 5,
  },
  categoryIcon: { fontSize: 13 },
  categoryName: { fontSize: 12, fontWeight: '600', color: COLORS.onSurfaceVariant },

  // Card
  card: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 16,
    ...SHADOWS.card,
  },

  // Details grid
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  detailCell: { width: '45%' },
  detailLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4,
  },
  detailAmount: { fontSize: 20, fontWeight: '700', color: COLORS.primary },
  detailValue: { fontSize: 15, color: COLORS.onSurface },

  // Section
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: 2,
  },

  // Table
  tableRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
  },
  tableRowDivider: {
    borderBottomWidth: 1, borderBottomColor: COLORS.separator,
  },
  tableHeader: {
    borderBottomWidth: 1.5, borderBottomColor: COLORS.outlineVariant,
    paddingTop: 0,
  },
  tableHeaderText: {
    fontSize: 11, fontWeight: '700', color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  tableCell: { fontSize: 14, color: COLORS.onSurface },
  colName: { flex: 1, paddingRight: 8 },
  colQty: { width: 36, textAlign: 'center' },
  colPrice: { width: 90, textAlign: 'right', fontWeight: '600' },

  // Bank sync — matched
  matchedCard: {
    borderLeftWidth: 3, borderLeftColor: COLORS.tertiary,
  },
  matchedTopRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 14,
  },
  matchedMeta: { flex: 1, gap: 2 },
  matchedTitle: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  matchedRef: { fontSize: 12, color: COLORS.muted },
  matchedBadge: {
    backgroundColor: '#006A4218', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, marginLeft: 8,
  },
  matchedBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.tertiary },
  matchedBottomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bankCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.secondaryContainer,
    alignItems: 'center', justifyContent: 'center',
  },
  bankCircleIcon: { fontSize: 16 },
  bankName: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  bankDate: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  matchedAmount: { fontSize: 16, fontWeight: '700', color: COLORS.onSurface },

  // Bank sync — unmatched
  unmatchedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  unmatchedText: { fontSize: 14, color: COLORS.onSurfaceVariant },
  unmatchedBadge: {
    backgroundColor: COLORS.surfaceContainerHighest,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  unmatchedBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  cashHint: { fontSize: 12, color: COLORS.muted, marginTop: 8 },

  // Footer
  footer: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.outlineVariant,
  },
  editBtn: {
    flex: 1, height: 48, borderRadius: 999,
    borderWidth: 1.5, borderColor: COLORS.outline,
    alignItems: 'center', justifyContent: 'center',
  },
  editBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  deleteBtn: {
    flex: 1, height: 48, borderRadius: 999,
    borderWidth: 1.5, borderColor: COLORS.error,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.error },
  btnDisabled: { opacity: 0.5 },

  // Image modal
  imageModalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  imageModalClose: {
    position: 'absolute', top: 56, right: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  imageModalCloseText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  imageModalImg: { width: '92%', height: '80%' },
});
