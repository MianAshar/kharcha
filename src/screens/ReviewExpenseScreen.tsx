import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { DEFAULT_CATEGORIES } from '../constants/categories';
import { RootStackParamList, ExpenseItem, PaymentMethod } from '../types';
import { createExpense, updateExpense } from '../services/expenses';
import { useAuth } from '../hooks/useAuth';

type Props = NativeStackScreenProps<RootStackParamList, 'ReviewExpense'>;

// ── Payment method options ────────────────────────────────────────────────────

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: string; description: string }[] = [
  { value: 'card', label: 'Card', icon: '💳', description: 'Bank will auto-match later' },
  { value: 'cash', label: 'Cash', icon: '💵', description: 'No bank record expected' },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function ReviewExpenseScreen({ route, navigation }: Props) {
  const { imageUri, receiptId: initialReceiptId, aiResult, expenseId } = route.params;
  const isEditing = !!expenseId;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // aiResult is null when Edge Function failed/timed out
  const usingMockData = aiResult === null;

  // ── Form state — initialized directly from aiResult params ───────────────
  const [merchantName, setMerchantName] = useState(aiResult?.merchant_name ?? '');
  const [category, setCategory] = useState(aiResult?.category ?? 'other');
  const [amount, setAmount] = useState(aiResult?.amount != null ? String(aiResult.amount) : '');
  const [date, setDate] = useState(
    aiResult?.expense_date ?? new Date().toISOString().slice(0, 10)
  );
  // Default to card — most purchases are card-based; cash_only set explicitly
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [time, setTime] = useState<string | null>(aiResult?.expense_time ?? null);
  const [items, setItems] = useState<ExpenseItem[]>(aiResult?.items ?? []);
  const [taxAmount] = useState(aiResult?.tax_amount != null ? String(aiResult.tax_amount) : '');
  const [tipAmount] = useState(aiResult?.tip_amount != null ? String(aiResult.tip_amount) : '');
  const [notes, setNotes] = useState('');
  const confidence = aiResult?.confidence_score ?? 0;

  // ── Category modal ────────────────────────────────────────────────────────
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const selectedCategory = useMemo(
    () => DEFAULT_CATEGORIES.find((c) => c.id === category) ?? DEFAULT_CATEGORIES[14],
    [category]
  );

  // ── Date picker ───────────────────────────────────────────────────────────
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const dateObj = useMemo(() => {
    const d = new Date(date + 'T00:00:00');
    return isNaN(d.getTime()) ? new Date() : d;
  }, [date]);

  const formattedDate = useMemo(() => {
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  }, [dateObj]);

  const handleDateChange = useCallback(
    (_event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS === 'android') setDatePickerVisible(false);
      if (selected) {
        const y = selected.getFullYear();
        const m = String(selected.getMonth() + 1).padStart(2, '0');
        const d = String(selected.getDate()).padStart(2, '0');
        setDate(`${y}-${m}-${d}`);
      }
    },
    []
  );

  // ── Time picker ───────────────────────────────────────────────────────────
  const [timePickerVisible, setTimePickerVisible] = useState(false);

  // Build a Date object from the HH:MM string for the picker
  const timeObj = useMemo(() => {
    const d = new Date();
    if (time) {
      const [h, m] = time.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) d.setHours(h, m, 0, 0);
    }
    return d;
  }, [time]);

  const formattedTime = useMemo(() => {
    if (!time) return null;
    const [h, m] = time.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }, [time]);

  const handleTimeChange = useCallback(
    (_event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS === 'android') setTimePickerVisible(false);
      if (selected) {
        const h = String(selected.getHours()).padStart(2, '0');
        const m = String(selected.getMinutes()).padStart(2, '0');
        setTime(`${h}:${m}`);
      }
    },
    []
  );

  // ── Save expense ──────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!user) return;
    const parsedAmount = parseFloat(amount);
    if (!merchantName.trim()) {
      Alert.alert('Missing field', 'Please enter a merchant name.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }

    setSaving(true);
    try {
      const matchStatus = paymentMethod === 'cash' ? 'cash_only' : 'unmatched';
      const fields = {
        merchant_name: merchantName.trim(),
        category,
        amount: parsedAmount,
        currency: 'PKR',
        expense_date: date,
        expense_time: time || null,
        payment_method: paymentMethod,
        items: items.length > 0 ? items : null,
        tax_amount: taxAmount ? parseFloat(taxAmount) : null,
        tip_amount: tipAmount ? parseFloat(tipAmount) : null,
        notes: notes.trim() || null,
        confidence_score: confidence,
      };

      if (isEditing && expenseId) {
        await updateExpense(expenseId, fields);
        navigation.goBack();
      } else {
        await createExpense({
          user_id: user.id,
          receipt_id: initialReceiptId,
          transaction_id: null,
          account_id: null,
          match_status: matchStatus,
          ...fields,
        });
        navigation.navigate('Main');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  }, [
    user, merchantName, amount, category, date, time, paymentMethod,
    items, taxAmount, tipAmount, notes,
    initialReceiptId, confidence, navigation,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Expense' : 'Review Expense'}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero card */}
        <View style={styles.heroCard}>
          <Image source={{ uri: imageUri }} style={styles.thumbnail} resizeMode="cover" />
          <View style={styles.heroText}>
            <Text style={styles.merchantDisplay} numberOfLines={1}>
              {merchantName || 'Receipt'}
            </Text>
            <Text style={styles.amountDisplay}>
              {amount ? `PKR ${parseFloat(amount).toLocaleString()}` : '—'}
            </Text>
          </View>
        </View>

        {/* Manual-entry banner */}
        {usingMockData && (
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerIcon}>✏️</Text>
            <Text style={styles.infoBannerText}>
              AI extraction unavailable — enter details manually
            </Text>
          </View>
        )}

        {/* Low-confidence warning */}
        {!usingMockData && confidence > 0 && confidence < 0.6 && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningText}>
              Some fields may need correction — AI confidence is low.
            </Text>
          </View>
        )}

        {/* Form: Expense Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expense Details</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Merchant</Text>
            <TextInput
              style={styles.input}
              value={merchantName}
              onChangeText={setMerchantName}
              placeholder="e.g. Cafe Aylanto"
              placeholderTextColor={COLORS.muted}
              returnKeyType="done"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Category</Text>
            <TouchableOpacity
              style={styles.dropdownBtn}
              onPress={() => setCategoryModalVisible(true)}
            >
              <Text style={styles.dropdownIcon}>{selectedCategory.icon}</Text>
              <Text style={styles.dropdownText}>{selectedCategory.name}</Text>
              <Text style={styles.dropdownChevron}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Amount — full width */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Amount (PKR)</Text>
            <TextInput
              style={[styles.input, styles.amountInput]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={COLORS.muted}
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
          </View>

          {/* Date + Time side by side */}
          <View style={styles.rowFields}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Date</Text>
              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => { setDatePickerVisible(true); setTimePickerVisible(false); }}
                activeOpacity={0.75}
              >
                <Text style={styles.dateBtnIcon}>📅</Text>
                <Text style={styles.dateBtnText} numberOfLines={1}>{formattedDate}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ width: 12 }} />
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Time (optional)</Text>
              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => { setTimePickerVisible(true); setDatePickerVisible(false); }}
                activeOpacity={0.75}
              >
                <Text style={styles.dateBtnIcon}>🕐</Text>
                <Text
                  style={[styles.dateBtnText, !formattedTime && styles.dateBtnPlaceholder]}
                  numberOfLines={1}
                >
                  {formattedTime ?? 'Not set'}
                </Text>
                {time && (
                  <TouchableOpacity
                    onPress={() => setTime(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.timeClearBtn}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* iOS date picker */}
          {datePickerVisible && Platform.OS === 'ios' && (
            <View style={styles.iosPickerWrapper}>
              <View style={styles.iosPickerHeader}>
                <TouchableOpacity onPress={() => setDatePickerVisible(false)}>
                  <Text style={styles.iosPickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={dateObj}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                maximumDate={new Date()}
                style={styles.iosPicker}
              />
            </View>
          )}
          {datePickerVisible && Platform.OS === 'android' && (
            <DateTimePicker
              value={dateObj}
              mode="date"
              display="default"
              onChange={handleDateChange}
              maximumDate={new Date()}
            />
          )}

          {/* iOS time picker */}
          {timePickerVisible && Platform.OS === 'ios' && (
            <View style={styles.iosPickerWrapper}>
              <View style={styles.iosPickerHeader}>
                <TouchableOpacity onPress={() => setTimePickerVisible(false)}>
                  <Text style={styles.iosPickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={timeObj}
                mode="time"
                display="spinner"
                onChange={handleTimeChange}
                style={styles.iosPicker}
              />
            </View>
          )}
          {timePickerVisible && Platform.OS === 'android' && (
            <DateTimePicker
              value={timeObj}
              mode="time"
              display="default"
              onChange={handleTimeChange}
            />
          )}
        </View>

        {/* Paid With */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Paid With</Text>
          <View style={styles.paymentRow}>
            {PAYMENT_OPTIONS.map((opt) => {
              const selected = paymentMethod === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.paymentOption, selected && styles.paymentOptionSelected]}
                  onPress={() => setPaymentMethod(opt.value)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.paymentOptionIcon}>{opt.icon}</Text>
                  <Text style={[styles.paymentOptionLabel, selected && styles.paymentOptionLabelSelected]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.paymentOptionDesc, selected && styles.paymentOptionDescSelected]}>
                    {opt.description}
                  </Text>
                  {selected && <View style={styles.paymentOptionDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Line Items */}
        {items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Line Items</Text>
            <View style={styles.itemsTable}>
              <View style={[styles.itemRow, styles.itemHeader]}>
                <Text style={[styles.itemCell, styles.itemCellName, styles.itemHeaderText]}>Item</Text>
                <Text style={[styles.itemCell, styles.itemCellQty, styles.itemHeaderText]}>Qty</Text>
                <Text style={[styles.itemCell, styles.itemCellPrice, styles.itemHeaderText]}>Price</Text>
                <Text style={[styles.itemCell, styles.itemCellTotal, styles.itemHeaderText]}>Total</Text>
              </View>
              {items.map((item, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <Text style={[styles.itemCell, styles.itemCellName]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.itemCell, styles.itemCellQty]}>{item.qty}</Text>
                  <Text style={[styles.itemCell, styles.itemCellPrice]}>{item.unit_price.toLocaleString()}</Text>
                  <Text style={[styles.itemCell, styles.itemCellTotal]}>{item.total.toLocaleString()}</Text>
                </View>
              ))}
              <View style={styles.itemDivider} />
              <View style={styles.itemRow}>
                <Text style={[styles.itemCell, styles.itemCellName, styles.totalLabel]}>Subtotal</Text>
                <Text style={styles.itemCellSpacer} />
                <Text style={styles.itemCellSpacer} />
                <Text style={[styles.itemCell, styles.itemCellTotal, styles.totalValue]}>
                  {items.reduce((s, i) => s + i.total, 0).toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional note..."
            placeholderTextColor={COLORS.muted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>{isEditing ? 'Update Expense' : 'Save Expense'}</Text>
          }
        </TouchableOpacity>
      </ScrollView>

      {/* Category picker modal */}
      <Modal
        visible={categoryModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Choose Category</Text>
            <FlatList
              data={DEFAULT_CATEGORIES}
              keyExtractor={(item) => item.id}
              numColumns={3}
              columnWrapperStyle={styles.categoryGridRow}
              renderItem={({ item }) => {
                const selected = item.id === category;
                return (
                  <TouchableOpacity
                    style={[styles.categoryCell, selected && styles.categoryCellSelected]}
                    onPress={() => { setCategory(item.id); setCategoryModalVisible(false); }}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.categoryGridIcon,
                      { backgroundColor: selected ? COLORS.primary + '18' : item.color + '22' },
                    ]}>
                      <Text style={styles.categoryIconText}>{item.icon}</Text>
                    </View>
                    <Text
                      style={[styles.categoryGridName, selected && styles.categoryGridNameSelected]}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                    {selected && <View style={styles.categorySelectedDot} />}
                  </TouchableOpacity>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.outlineVariant,
  },
  backBtn: { width: 36, alignItems: 'center' },
  backArrow: { fontSize: 22, color: COLORS.secondary, fontWeight: '600' },
  headerTitle: {
    flex: 1, textAlign: 'center',
    fontSize: 17, fontWeight: '700', color: COLORS.secondary,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  heroCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 16, gap: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  thumbnail: { width: 60, height: 60, borderRadius: 10, backgroundColor: COLORS.background },
  heroText: { flex: 1, gap: 4 },
  merchantDisplay: { fontSize: 18, fontWeight: '700', color: COLORS.secondary },
  amountDisplay: { fontSize: 15, fontWeight: '600', color: COLORS.primary },

  infoBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#E8F4FD', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
    borderWidth: 1, borderColor: '#BEE0F5',
  },
  infoBannerIcon: { fontSize: 16 },
  infoBannerText: { flex: 1, fontSize: 13, color: '#0C5F8A', lineHeight: 18 },

  warningBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF3CD', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
    borderWidth: 1, borderColor: '#FFECB5',
  },
  warningIcon: { fontSize: 16 },
  warningText: { flex: 1, fontSize: 13, color: '#856404', lineHeight: 18 },

  section: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 16, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  input: {
    height: 44, borderWidth: 1.5, borderColor: COLORS.outlineVariant,
    borderRadius: 10, paddingHorizontal: 12,
    fontSize: 15, color: COLORS.secondary, backgroundColor: COLORS.background,
  },
  amountInput: { color: COLORS.primary, fontWeight: '700', fontSize: 17 },
  notesInput: { height: 80, paddingTop: 12 },
  rowFields: { flexDirection: 'row', alignItems: 'flex-end' },

  dropdownBtn: {
    height: 44, borderWidth: 1.5, borderColor: COLORS.outlineVariant,
    borderRadius: 10, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background, gap: 8,
  },
  dropdownIcon: { fontSize: 18 },
  dropdownText: { flex: 1, fontSize: 15, color: COLORS.secondary },
  dropdownChevron: { fontSize: 20, color: COLORS.muted, marginLeft: 4 },

  paymentRow: { flexDirection: 'row', gap: 12 },
  paymentOption: {
    flex: 1, borderWidth: 1.5, borderColor: COLORS.outlineVariant,
    borderRadius: 14, padding: 14, alignItems: 'center', gap: 4,
    backgroundColor: COLORS.background, position: 'relative',
  },
  paymentOptionSelected: {
    borderColor: COLORS.primary, backgroundColor: COLORS.primary + '08',
  },
  paymentOptionIcon: { fontSize: 28 },
  paymentOptionLabel: {
    fontSize: 15, fontWeight: '700', color: COLORS.secondary,
  },
  paymentOptionLabelSelected: { color: COLORS.primary },
  paymentOptionDesc: {
    fontSize: 11, color: COLORS.muted, textAlign: 'center', lineHeight: 14,
  },
  paymentOptionDescSelected: { color: COLORS.primary + 'AA' },
  paymentOptionDot: {
    position: 'absolute', top: 10, right: 10,
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary,
  },

  itemsTable: { gap: 0 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.background,
  },
  itemHeader: { borderBottomWidth: 2, borderBottomColor: COLORS.outlineVariant },
  itemHeaderText: { fontWeight: '700', color: COLORS.muted, fontSize: 11 },
  itemCell: { fontSize: 13, color: COLORS.secondary },
  itemCellName: { flex: 1, paddingRight: 4 },
  itemCellQty: { width: 32, textAlign: 'center' },
  itemCellPrice: { width: 72, textAlign: 'right' },
  itemCellTotal: { width: 72, textAlign: 'right', fontWeight: '600' },
  itemCellSpacer: { width: 32 },
  itemDivider: { height: 1, backgroundColor: COLORS.outlineVariant, marginVertical: 4 },
  totalLabel: { fontWeight: '700', color: COLORS.secondary },
  totalValue: { color: COLORS.primary, fontWeight: '700' },

  saveBtn: {
    backgroundColor: COLORS.primary, borderRadius: 100, height: 52,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 16, maxHeight: '70%',
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: COLORS.outlineVariant,
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17, fontWeight: '700', color: COLORS.secondary,
    marginBottom: 12, textAlign: 'center',
  },
  // Category grid
  categoryGridRow: { gap: 10, marginBottom: 10 },
  categoryCell: {
    flex: 1, alignItems: 'center',
    borderRadius: 14, padding: 10,
    borderWidth: 1.5, borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.background,
    gap: 6, position: 'relative',
  },
  categoryCellSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '08',
  },
  categoryGridIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  categoryIconText: { fontSize: 22 },
  categoryGridName: {
    fontSize: 11, fontWeight: '600', color: COLORS.onSurfaceVariant,
    textAlign: 'center', lineHeight: 14,
  },
  categoryGridNameSelected: { color: COLORS.primary },
  categorySelectedDot: {
    position: 'absolute', top: 6, right: 6,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.primary,
  },

  // Date picker
  dateBtn: {
    height: 44, borderWidth: 1.5, borderColor: COLORS.outlineVariant,
    borderRadius: 10, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background, gap: 6,
  },
  dateBtnIcon: { fontSize: 15 },
  dateBtnText: { flex: 1, fontSize: 13, color: COLORS.secondary, fontWeight: '500' },
  dateBtnPlaceholder: { color: COLORS.muted, fontWeight: '400' },
  timeClearBtn: { fontSize: 12, color: COLORS.muted, paddingLeft: 4 },

  iosPickerWrapper: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
    overflow: 'hidden',
  },
  iosPickerHeader: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.outlineVariant,
  },
  iosPickerDone: {
    fontSize: 15, fontWeight: '700', color: COLORS.primary,
  },
  iosPicker: { height: 200 },
});
