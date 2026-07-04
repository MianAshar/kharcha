/**
 * useSMSListener — Android-only hook.
 *
 * On iOS this is a complete no-op.
 *
 * On Android it:
 *   1. Requests RECEIVE_SMS + READ_SMS runtime permissions (if not already granted).
 *   2. Attaches a listener via react-native-android-sms-listener (requires EAS build —
 *      the native module is auto-linked and the BroadcastReceiver is injected by
 *      plugins/withSmsReceiver.js).
 *   3. On each incoming SMS, calls the parse-bank-sms Edge Function.
 *   4. If a bank transaction is detected, fires a local push notification.
 *
 * Mount once at the app root (App.tsx) after the user is authenticated.
 */

import { useEffect, useRef, useCallback } from 'react';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from './useAuth';
import { supabase } from '../services/supabase';

// ── Local notification setup ──────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function scheduleTransactionNotification(
  bankName: string,
  amount: number,
  currency: string
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '💳 New Transaction Detected',
      body: `${currency} ${amount.toLocaleString('en-PK')} from ${bankName}`,
      data: {},
    },
    trigger: null, // immediate
  });
}

// ── Permissions ───────────────────────────────────────────────────────────────

export async function requestSmsPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      PermissionsAndroid.PERMISSIONS.READ_SMS,
    ]);
    return (
      results[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED &&
      results[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch {
    return false;
  }
}

export async function checkSmsPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const [receive, read] = await Promise.all([
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS),
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS),
    ]);
    return receive && read;
  } catch {
    return false;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSMSListener(): void {
  const { user } = useAuth();
  // Keep a stable ref to user.id to avoid re-attaching on every auth state tick
  const userIdRef = useRef<string | undefined>(undefined);
  userIdRef.current = user?.id;

  const handleSms = useCallback(
    async (message: { originatingAddress?: string; body?: string }) => {
      const uid = userIdRef.current;
      if (!uid || !message.body?.trim()) return;

      try {
        const { data, error } = await supabase.functions.invoke('parse-bank-sms', {
          body: { raw_message: message.body, user_id: uid },
        });

        if (error) {
          console.warn('[useSMSListener] parse-bank-sms error:', error.message);
          return;
        }

        // Fire notification when a real bank transaction is found
        if (data?.is_transaction && !data?.deduplicated && data?.amount) {
          await scheduleTransactionNotification(
            data.bank_name ?? 'Bank',
            data.amount,
            data.currency ?? 'PKR'
          );
        }
      } catch (err) {
        // Never crash the app on SMS processing failure
        console.warn('[useSMSListener] unhandled error:', err);
      }
    },
    []
  );

  useEffect(() => {
    if (Platform.OS !== 'android' || !user) return;

    // Attempt to load the native module (only available in EAS dev/prod builds,
    // not in Expo Go). Fail silently if the module isn't linked yet.
    let SmsListener: { addListener: (cb: (msg: any) => void) => { remove: () => void } } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      SmsListener = require('react-native-android-sms-listener').default;
    } catch {
      console.log('[useSMSListener] native SMS module not available (Expo Go or iOS build)');
      return;
    }
    if (!SmsListener) return;

    // Only attach if permissions are already granted; requesting happens in Settings
    checkSmsPermissions().then((granted) => {
      if (!granted) return;

      const subscription = SmsListener!.addListener(handleSms);
      return () => subscription.remove();
    });
  }, [user, handleSms]);
}
