import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Modal,
  Alert,
  RefreshControl,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';

import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SHADOWS } from '../constants/colors';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase';
import { checkSmsPermissions, requestSmsPermissions } from '../hooks/useSMSListener';
import {
  buildGmailServerAuthUrl,
  disconnectEmail,
} from '../services/emailOAuth';
import { Account, ConnectedEmail, Profile } from '../types';

WebBrowser.maybeCompleteAuthSession();

// ── Types ─────────────────────────────────────────────────────────────────────

type AccountType = 'debit_card' | 'credit_card' | 'mobile_wallet' | 'cash' | 'bank_account';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  debit_card: 'Debit Card',
  credit_card: 'Credit Card',
  mobile_wallet: 'Mobile Wallet',
  cash: 'Cash',
  bank_account: 'Bank Account',
};

const ACCOUNT_TYPE_OPTIONS: AccountType[] = [
  'debit_card', 'credit_card', 'mobile_wallet', 'cash', 'bank_account',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name?.trim()) {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (email?.[0] ?? 'K').toUpperCase();
}

function toastAlert(msg: string) {
  Alert.alert('', msg, [{ text: 'OK' }]);
}

// ── Swipeable account row ─────────────────────────────────────────────────────

function SwipeableAccountRow({
  account,
  onDelete,
}: {
  account: Account;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const SWIPE_THRESHOLD = -72;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dy) < 20,
      onPanResponderMove: (_, g) => {
        const x = Math.max(Math.min(g.dx, 0), -90);
        translateX.setValue(x);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < SWIPE_THRESHOLD) {
          Animated.spring(translateX, { toValue: -72, useNativeDriver: true }).start();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const typeLabel = ACCOUNT_TYPE_LABELS[account.account_type as AccountType] ?? account.account_type;

  return (
    <View style={styles.swipeableWrapper}>
      {/* Delete action revealed on swipe-left */}
      <View style={styles.swipeDeleteAction}>
        <TouchableOpacity style={styles.swipeDeleteBtn} onPress={onDelete}>
          <Text style={styles.swipeDeleteIcon}>🗑️</Text>
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[styles.accountRow, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {/* Bank circle */}
        <View style={styles.accountCircle}>
          <Text style={styles.accountCircleText}>
            {(account.bank_name ?? account.account_name)?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>

        <View style={styles.accountInfo}>
          <Text style={styles.accountName}>{account.account_name}</Text>
          <Text style={styles.accountMeta}>
            {account.bank_name ? `${account.bank_name}  ` : ''}
            {account.last4 ? `••••${account.last4}` : typeLabel}
          </Text>
        </View>

        <View style={styles.accountTypeBadge}>
          <Text style={styles.accountTypeBadgeText}>{typeLabel}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function SettingRow({
  icon, label, value, onPress, danger, last,
}: {
  icon: string; label: string; value?: string;
  onPress?: () => void; danger?: boolean; last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.settingRow, !last && styles.settingRowDivider]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Text style={styles.settingRowIcon}>{icon}</Text>
      <Text style={[styles.settingRowLabel, danger && styles.dangerText]}>{label}</Text>
      {value ? <Text style={styles.settingRowValue}>{value}</Text> : null}
      {onPress && !danger && <Text style={styles.settingRowChevron}>›</Text>}
    </TouchableOpacity>
  );
}

function ToggleRow({
  icon, label, value, onChange, last,
}: {
  icon: string; label: string; value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <View style={[styles.settingRow, !last && styles.settingRowDivider]}>
      <Text style={styles.settingRowIcon}>{icon}</Text>
      <Text style={[styles.settingRowLabel, { flex: 1 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: COLORS.progressTrack, true: COLORS.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const [connectingGmail, setConnectingGmail] = useState(false);
  const [connectingOutlook, setConnectingOutlook] = useState(false);

  // ── Data state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [connectedEmails, setConnectedEmails] = useState<ConnectedEmail[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // ── Notification prefs (AsyncStorage) ──────────────────────────────────
  const [budgetAlerts, setBudgetAlerts] = useState(true);
  const [unmatchedAlerts, setUnmatchedAlerts] = useState(true);

  // ── Profile edit modal ──────────────────────────────────────────────────
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [editCurrency, setEditCurrency] = useState('PKR');
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Add account modal ───────────────────────────────────────────────────
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState<AccountType>('debit_card');
  const [newLast4, setNewLast4] = useState('');
  const [newBankName, setNewBankName] = useState('');
  const [newNotificationEmail, setNewNotificationEmail] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);

  // ── Export state ────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);

  // ── SMS permission state (Android only) ─────────────────────────────────
  const [smsGranted, setSmsGranted] = useState(false);

  // ── Fetch all data ──────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!user) return;
    const [profileRes, accountsRes, emailsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('accounts').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('connected_emails').select('*').eq('user_id', user.id).order('created_at'),
    ]);
    if (profileRes.data) setProfile(profileRes.data as Profile);
    setAccounts((accountsRes.data as Account[]) ?? []);
    setConnectedEmails((emailsRes.data as ConnectedEmail[]) ?? []);
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Load notification prefs
  useEffect(() => {
    AsyncStorage.multiGet(['notif_budget', 'notif_unmatched']).then((pairs) => {
      pairs.forEach(([key, val]) => {
        if (key === 'notif_budget' && val !== null) setBudgetAlerts(val === 'true');
        if (key === 'notif_unmatched' && val !== null) setUnmatchedAlerts(val === 'true');
      });
    });
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // Re-check SMS permissions whenever the screen comes into focus
  // (covers the case where user goes to System Settings and grants them)
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      checkSmsPermissions().then(setSmsGranted);
    }, [])
  );

  // ── Gmail OAuth (server-side callback via Edge Function) ─────────────────
  const connectGmail = useCallback(async () => {
    if (!user?.id) return;
    setConnectingGmail(true);
    try {
      const authUrl = buildGmailServerAuthUrl(user.id);
      // openAuthSessionAsync closes the browser automatically when it detects
      // the kharcha:// redirect that our Edge Function sends at the end.
      await WebBrowser.openAuthSessionAsync(authUrl, 'kharcha://oauth');
      // Regardless of result, refresh — if OAuth succeeded the email is in DB.
      await fetchAll();
    } catch (err) {
      Alert.alert('Gmail Error', err instanceof Error ? err.message : 'Failed to open Gmail auth');
    } finally {
      setConnectingGmail(false);
    }
  }, [user, fetchAll]);

  // ── Profile edit ────────────────────────────────────────────────────────
  const openProfileModal = useCallback(() => {
    setEditName(profile?.full_name ?? '');
    setEditBudget(profile?.monthly_budget != null ? String(profile.monthly_budget) : '');
    setEditCurrency(profile?.currency ?? 'PKR');
    setProfileModalVisible(true);
  }, [profile]);

  const saveProfile = useCallback(async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const updates: Partial<Profile> = {
        full_name: editName.trim() || null,
        currency: editCurrency.trim() || 'PKR',
        monthly_budget: editBudget ? parseFloat(editBudget) : null,
      };
      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) throw error;
      await fetchAll();
      setProfileModalVisible(false);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  }, [user, editName, editBudget, editCurrency, fetchAll]);

  // ── Add account ─────────────────────────────────────────────────────────
  const openAddAccount = useCallback(() => {
    setNewAccountName('');
    setNewAccountType('debit_card');
    setNewLast4('');
    setNewBankName('');
    setNewNotificationEmail('');
    setAccountModalVisible(true);
  }, []);

  const saveAccount = useCallback(async () => {
    if (!user) return;
    if (!newAccountName.trim()) {
      Alert.alert('Missing field', 'Please enter an account name.');
      return;
    }
    setSavingAccount(true);
    try {
      const { error } = await supabase.from('accounts').insert({
        user_id: user.id,
        account_name: newAccountName.trim(),
        account_type: newAccountType,
        last4: newLast4.trim() || null,
        bank_name: newBankName.trim() || null,
        notification_email: newNotificationEmail.trim().toLowerCase() || null,
        is_default: accounts.length === 0,
      });
      if (error) throw error;
      await fetchAll();
      setAccountModalVisible(false);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add account');
    } finally {
      setSavingAccount(false);
    }
  }, [user, newAccountName, newAccountType, newLast4, newBankName, newNotificationEmail, accounts.length, fetchAll]);

  const deleteAccount = useCallback((id: string, name: string) => {
    Alert.alert('Delete Account', `Remove "${name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('accounts').delete().eq('id', id);
          if (error) {
            Alert.alert('Error', error.message);
          } else {
            await fetchAll();
          }
        },
      },
    ]);
  }, [fetchAll]);

  // ── Disconnect email ─────────────────────────────────────────────────────
  const handleDisconnectEmail = useCallback((emailRow: ConnectedEmail) => {
    Alert.alert(
      'Disconnect Email',
      `Remove ${emailRow.email_address}? No new transactions will be fetched from it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectEmail(emailRow.id);
              await fetchAll();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to disconnect');
            }
          },
        },
      ]
    );
  }, [fetchAll]);

  // ── Notification toggles ────────────────────────────────────────────────
  const toggleBudgetAlerts = useCallback((val: boolean) => {
    setBudgetAlerts(val);
    AsyncStorage.setItem('notif_budget', String(val));
  }, []);

  const toggleUnmatchedAlerts = useCallback((val: boolean) => {
    setUnmatchedAlerts(val);
    AsyncStorage.setItem('notif_unmatched', String(val));
  }, []);

  // ── CSV Export ──────────────────────────────────────────────────────────
  const exportCSV = useCallback(async () => {
    if (!user) return;
    setExporting(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', user.id)
        .order('expense_date', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        Alert.alert('No data', 'You have no expenses to export.');
        return;
      }

      const headers = [
        'Date', 'Time', 'Merchant', 'Category', 'Amount', 'Currency',
        'Payment Method', 'Notes', 'Match Status',
      ];

      const rows = data.map((e) => [
        e.expense_date ?? '',
        e.expense_time ?? '',
        `"${(e.merchant_name ?? '').replace(/"/g, '""')}"`,
        e.category ?? '',
        e.amount ?? '',
        e.currency ?? '',
        e.payment_method ?? '',
        `"${(e.notes ?? '').replace(/"/g, '""')}"`,
        e.match_status ?? '',
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const filename = `kharcha_expenses_${new Date().toISOString().slice(0, 10)}.csv`;
      const fileUri = FileSystem.documentDirectory + filename;

      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Expenses',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Exported', `Saved to: ${fileUri}`);
      }
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExporting(false);
    }
  }, [user]);

  // ── Sign out ────────────────────────────────────────────────────────────
  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try { await signOut(); } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to sign out');
          }
        },
      },
    ]);
  }, [signOut]);

  // ── Delete account ──────────────────────────────────────────────────────
  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete ALL your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delete Everything',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'Type "DELETE" to confirm you want to erase your account.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Permanently Delete',
                  style: 'destructive',
                  onPress: async () => {
                    if (!user) return;
                    try {
                      // Delete user data in dependency order
                      await Promise.all([
                        supabase.from('expenses').delete().eq('user_id', user.id),
                        supabase.from('bank_transactions').delete().eq('user_id', user.id),
                        supabase.from('connected_emails').delete().eq('user_id', user.id),
                        supabase.from('accounts').delete().eq('user_id', user.id),
                      ]);
                      await supabase.from('receipts').delete().eq('user_id', user.id);
                      await supabase.from('profiles').delete().eq('id', user.id);
                      await signOut();
                    } catch (err) {
                      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete account');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [user, signOut]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const initials = getInitials(profile?.full_name, user?.email);
  const displayName = profile?.full_name?.trim() || 'Your Name';
  const email = user?.email ?? '';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
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
        {/* Screen title */}
        <View style={[styles.screenHeader, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.screenTitle}>Settings</Text>
        </View>

        {/* ── Profile ────────────────────────────────────────────────────── */}
        <Section label="PROFILE">
          <TouchableOpacity
            style={styles.profileRow}
            onPress={openProfileModal}
            activeOpacity={0.75}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{displayName}</Text>
              <Text style={styles.profileEmail} numberOfLines={1}>{email}</Text>
              <View style={styles.profileMeta}>
                {profile?.monthly_budget != null && (
                  <View style={styles.metaBadge}>
                    <Text style={styles.metaBadgeText}>
                      Budget: {profile.currency} {profile.monthly_budget.toLocaleString()}
                    </Text>
                  </View>
                )}
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>{profile?.currency ?? 'PKR'}</Text>
                </View>
              </View>
            </View>
            <Text style={styles.editBadge}>Edit ›</Text>
          </TouchableOpacity>
        </Section>

        {/* ── Accounts & Cards ────────────────────────────────────────────── */}
        <Section label="ACCOUNTS & CARDS">
          {accounts.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyRowText}>No accounts added yet</Text>
            </View>
          ) : (
            accounts.map((account, idx) => (
              <SwipeableAccountRow
                key={account.id}
                account={account}
                onDelete={() => deleteAccount(account.id, account.account_name)}
              />
            ))
          )}
          <TouchableOpacity style={styles.addRow} onPress={openAddAccount} activeOpacity={0.7}>
            <View style={styles.addRowIcon}>
              <Text style={styles.addRowPlus}>＋</Text>
            </View>
            <Text style={styles.addRowText}>Add Account</Text>
          </TouchableOpacity>
        </Section>

        {/* ── Email Sync ──────────────────────────────────────────────────── */}
        <Section label="EMAIL SYNC">
          {connectedEmails.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyRowText}>No email accounts connected</Text>
            </View>
          ) : (
            connectedEmails.map((emailRow, idx) => (
              <View
                key={emailRow.id}
                style={[
                  styles.emailRow,
                  idx < connectedEmails.length - 1 && styles.settingRowDivider,
                ]}
              >
                <Text style={styles.settingRowIcon}>
                  {emailRow.provider === 'gmail' ? '📧' : '📨'}
                </Text>
                <View style={styles.emailInfo}>
                  <Text style={styles.emailAddress}>{emailRow.email_address}</Text>
                  <Text style={styles.emailProvider}>
                    {emailRow.provider === 'gmail' ? 'Gmail' : 'Outlook'}
                    {!emailRow.is_active && ' · Reconnect needed'}
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  emailRow.is_active ? styles.statusBadgeActive : styles.statusBadgeInactive,
                ]}>
                  <Text style={[
                    styles.statusBadgeText,
                    emailRow.is_active ? styles.statusBadgeTextActive : styles.statusBadgeTextInactive,
                  ]}>
                    {emailRow.is_active ? 'Active' : 'Inactive'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.disconnectBtn}
                  onPress={() => handleDisconnectEmail(emailRow)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.disconnectBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          {/* Connect Gmail */}
          <TouchableOpacity
            style={[
              styles.addRow,
              connectedEmails.some((e) => e.provider === 'gmail' && e.is_active) && styles.addRowDisabled,
            ]}
            onPress={connectGmail}
            disabled={connectingGmail}
            activeOpacity={0.7}
          >
            {connectingGmail ? (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ width: 24 }} />
            ) : (
              <Text style={styles.emailConnectIcon}>📧</Text>
            )}
            <Text style={styles.addRowText}>
              {connectedEmails.some((e) => e.provider === 'gmail' && e.is_active)
                ? 'Reconnect Gmail'
                : 'Connect Gmail'}
            </Text>
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          {/* Connect Outlook */}
          <TouchableOpacity
            style={[
              styles.addRow,
              styles.addRowLast,
              connectedEmails.some((e) => e.provider === 'outlook' && e.is_active) && styles.addRowDisabled,
            ]}
            onPress={() => Alert.alert('Coming Soon', 'Outlook connection is not yet available.')}
            disabled={connectingOutlook}
            activeOpacity={0.7}
          >
            {connectingOutlook ? (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ width: 24 }} />
            ) : (
              <Text style={styles.emailConnectIcon}>📨</Text>
            )}
            <Text style={styles.addRowText}>
              {connectedEmails.some((e) => e.provider === 'outlook' && e.is_active)
                ? 'Reconnect Outlook'
                : 'Connect Outlook'}
            </Text>
          </TouchableOpacity>
        </Section>

        {/* ── SMS Permissions (Android only) ─────────────────────────────── */}
        {Platform.OS === 'android' && (
          <Section label="SMS PERMISSIONS">
            <ToggleRow
              icon="💬"
              label="Read SMS for bank transactions"
              value={smsGranted}
              onChange={async (want) => {
                if (want && !smsGranted) {
                  const granted = await requestSmsPermissions();
                  setSmsGranted(granted);
                  if (!granted) {
                    Alert.alert(
                      'Permission denied',
                      'Go to System Settings → Apps → Kharcha → Permissions → SMS to enable manually.',
                      [{ text: 'OK' }]
                    );
                  }
                } else if (!want && smsGranted) {
                  Alert.alert(
                    'Revoke SMS access',
                    'To disable SMS reading, go to System Settings → Apps → Kharcha → Permissions → SMS.',
                    [{ text: 'OK' }]
                  );
                }
              }}
              last
            />
            {smsGranted && (
              <View style={styles.smsBanner}>
                <Text style={styles.smsBannerText}>
                  ✅  SMS monitoring active — incoming bank messages are being processed automatically.
                </Text>
              </View>
            )}
          </Section>
        )}

        {/* ── Notifications ───────────────────────────────────────────────── */}
        <Section label="NOTIFICATIONS">
          <ToggleRow
            icon="📊"
            label="Budget alerts"
            value={budgetAlerts}
            onChange={toggleBudgetAlerts}
          />
          <ToggleRow
            icon="🔔"
            label="Unmatched transaction reminders"
            value={unmatchedAlerts}
            onChange={toggleUnmatchedAlerts}
            last
          />
        </Section>

        {/* ── Data ────────────────────────────────────────────────────────── */}
        <Section label="DATA">
          <TouchableOpacity
            style={[styles.settingRow]}
            onPress={exportCSV}
            disabled={exporting}
            activeOpacity={0.7}
          >
            <Text style={styles.settingRowIcon}>📤</Text>
            <Text style={[styles.settingRowLabel, { flex: 1 }]}>Export as CSV</Text>
            {exporting
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Text style={styles.settingRowChevron}>›</Text>
            }
          </TouchableOpacity>
        </Section>

        {/* ── Account ─────────────────────────────────────────────────────── */}
        <Section label="ACCOUNT">
          <TouchableOpacity
            style={[styles.settingRow, styles.settingRowDivider]}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Text style={styles.settingRowIcon}>🚪</Text>
            <Text style={styles.settingRowLabel}>Sign Out</Text>
            <Text style={styles.settingRowChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={handleDeleteAccount}
            activeOpacity={0.7}
          >
            <Text style={styles.settingRowIcon}>🗑️</Text>
            <Text style={[styles.settingRowLabel, styles.dangerText]}>Delete Account</Text>
          </TouchableOpacity>
        </Section>

        {/* Version */}
        <Text style={styles.version}>Kharcha v1.0.0</Text>
      </ScrollView>

      {/* ── Profile Edit Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={profileModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit Profile</Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Full Name</Text>
              <TextInput
                style={styles.formInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Your name"
                placeholderTextColor={COLORS.muted}
                returnKeyType="next"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Currency</Text>
              <TextInput
                style={styles.formInput}
                value={editCurrency}
                onChangeText={setEditCurrency}
                placeholder="PKR"
                placeholderTextColor={COLORS.muted}
                autoCapitalize="characters"
                maxLength={3}
                returnKeyType="next"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Monthly Budget (optional)</Text>
              <TextInput
                style={styles.formInput}
                value={editBudget}
                onChangeText={setEditBudget}
                placeholder="e.g. 50000"
                placeholderTextColor={COLORS.muted}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>

            <TouchableOpacity
              style={[styles.modalSaveBtn, savingProfile && styles.btnDisabled]}
              onPress={saveProfile}
              disabled={savingProfile}
              activeOpacity={0.85}
            >
              {savingProfile
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.modalSaveBtnText}>Save Changes</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setProfileModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Add Account Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={accountModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAccountModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Account</Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Account Name *</Text>
              <TextInput
                style={styles.formInput}
                value={newAccountName}
                onChangeText={setNewAccountName}
                placeholder="e.g. HBL Debit, JazzCash"
                placeholderTextColor={COLORS.muted}
                returnKeyType="next"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Account Type</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.typeChipsRow}
              >
                {ACCOUNT_TYPE_OPTIONS.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeChip, newAccountType === type && styles.typeChipActive]}
                    onPress={() => setNewAccountType(type)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.typeChipText, newAccountType === type && styles.typeChipTextActive]}>
                      {ACCOUNT_TYPE_LABELS[type]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.formLabel}>Bank Name</Text>
                <TextInput
                  style={styles.formInput}
                  value={newBankName}
                  onChangeText={setNewBankName}
                  placeholder="e.g. HBL"
                  placeholderTextColor={COLORS.muted}
                  returnKeyType="next"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.formLabel}>Last 4 Digits</Text>
                <TextInput
                  style={styles.formInput}
                  value={newLast4}
                  onChangeText={(t) => setNewLast4(t.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="number-pad"
                  maxLength={4}
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Bank Alert Email (optional)</Text>
              <TextInput
                style={styles.formInput}
                value={newNotificationEmail}
                onChangeText={setNewNotificationEmail}
                placeholder="e.g. alerts@yourbank.com"
                placeholderTextColor={COLORS.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
              <Text style={styles.formHint}>
                The address your bank uses to send transaction notifications. Used to precisely filter emails.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.modalSaveBtn, savingAccount && styles.btnDisabled]}
              onPress={saveAccount}
              disabled={savingAccount}
              activeOpacity={0.85}
            >
              {savingAccount
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.modalSaveBtnText}>Add Account</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setAccountModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 16, gap: 0 },

  screenHeader: { paddingBottom: 16 },
  screenTitle: {
    fontSize: 28, fontWeight: '700', color: COLORS.secondary,
  },

  // ── Section ──────────────────────────────────────────────────────────────
  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 0.7,
    marginBottom: 8, paddingLeft: 4,
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    overflow: 'hidden',
    ...SHADOWS.card,
  },

  // ── Profile row ───────────────────────────────────────────────────────────
  profileRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 14,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { fontSize: 16, fontWeight: '700', color: COLORS.secondary },
  profileEmail: { fontSize: 12, color: COLORS.muted },
  profileMeta: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  metaBadge: {
    backgroundColor: COLORS.surfaceContainerHighest,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
  },
  metaBadgeText: { fontSize: 11, fontWeight: '600', color: COLORS.onSurfaceVariant },
  editBadge: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  // ── Generic setting row ───────────────────────────────────────────────────
  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    gap: 12,
  },
  settingRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  settingRowIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  settingRowLabel: { flex: 1, fontSize: 15, color: COLORS.onSurface },
  settingRowValue: { fontSize: 14, color: COLORS.muted },
  settingRowChevron: { fontSize: 20, color: COLORS.muted },

  // ── Swipeable account row ─────────────────────────────────────────────────
  swipeableWrapper: {
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  swipeDeleteAction: {
    position: 'absolute', top: 0, bottom: 0, right: 0,
    width: 72,
    backgroundColor: COLORS.error,
    alignItems: 'center', justifyContent: 'center',
  },
  swipeDeleteBtn: { alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%' },
  swipeDeleteIcon: { fontSize: 20 },

  accountRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    gap: 12, backgroundColor: COLORS.surface,
  },
  accountCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.secondaryContainer,
    alignItems: 'center', justifyContent: 'center',
  },
  accountCircleText: { fontSize: 16, fontWeight: '700', color: COLORS.secondary },
  accountInfo: { flex: 1 },
  accountName: { fontSize: 14, fontWeight: '700', color: COLORS.secondary },
  accountMeta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  accountTypeBadge: {
    backgroundColor: COLORS.surfaceContainerHighest,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  accountTypeBadgeText: { fontSize: 11, fontWeight: '600', color: COLORS.onSurfaceVariant },

  // ── Add row ───────────────────────────────────────────────────────────────
  addRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.separator,
  },
  addRowLast: { borderTopWidth: 0 },
  addRowIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.surfaceContainerHighest,
    alignItems: 'center', justifyContent: 'center',
  },
  addRowPlus: { fontSize: 18, color: COLORS.primary, lineHeight: 22 },
  addRowText: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.primary },

  emailConnectIcon: { fontSize: 20 },

  // ── Email sync ────────────────────────────────────────────────────────────
  emailRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    gap: 12,
  },
  emailInfo: { flex: 1 },
  emailAddress: { fontSize: 14, fontWeight: '600', color: COLORS.secondary },
  emailProvider: { fontSize: 12, color: COLORS.muted, marginTop: 1 },
  statusBadge: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
  },
  statusBadgeActive: { backgroundColor: '#D4EDDA' },
  statusBadgeInactive: { backgroundColor: COLORS.surfaceContainerHighest },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  statusBadgeTextActive: { color: '#155724' },
  statusBadgeTextInactive: { color: COLORS.muted },

  disconnectBtn: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.surfaceContainerHighest,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  disconnectBtnText: { fontSize: 11, color: COLORS.muted, fontWeight: '700' },

  addRowDisabled: { opacity: 0.6 },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyRow: { paddingHorizontal: 16, paddingVertical: 14 },
  emptyRowText: { fontSize: 14, color: COLORS.muted, fontStyle: 'italic' },

  // ── SMS banner ────────────────────────────────────────────────────────────
  smsBanner: {
    marginHorizontal: 12, marginBottom: 12,
    backgroundColor: '#D4EDDA', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  smsBannerText: { fontSize: 12, color: '#155724', lineHeight: 18 },

  // ── Danger ────────────────────────────────────────────────────────────────
  dangerText: { color: COLORS.error },

  // ── Version ───────────────────────────────────────────────────────────────
  version: {
    textAlign: 'center', fontSize: 12, color: COLORS.muted,
    marginTop: 8,
  },

  // ── Modals ────────────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 20,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: COLORS.outlineVariant,
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '700', color: COLORS.secondary,
    marginBottom: 20, textAlign: 'center',
  },

  formGroup: { marginBottom: 16 },
  formRow: { flexDirection: 'row', marginBottom: 16 },
  formLabel: {
    fontSize: 12, fontWeight: '600', color: COLORS.muted,
    marginBottom: 6,
  },
  formHint: {
    fontSize: 11, color: COLORS.muted, marginTop: 5, lineHeight: 15,
  },
  formInput: {
    height: 44, borderWidth: 1.5, borderColor: COLORS.outlineVariant,
    borderRadius: 10, paddingHorizontal: 12,
    fontSize: 15, color: COLORS.secondary, backgroundColor: COLORS.background,
  },

  typeChipsRow: { gap: 8, paddingVertical: 2 },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1.5, borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.background,
  },
  typeChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typeChipText: { fontSize: 12, fontWeight: '600', color: COLORS.onSurfaceVariant },
  typeChipTextActive: { color: '#fff' },

  modalSaveBtn: {
    backgroundColor: COLORS.primary, borderRadius: 100, height: 50,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  btnDisabled: { opacity: 0.6 },
  modalSaveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalCancelBtn: { alignItems: 'center', paddingVertical: 12 },
  modalCancelBtnText: { fontSize: 15, color: COLORS.muted, fontWeight: '500' },
});
