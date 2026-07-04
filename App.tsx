import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import AppNavigator from './src/navigation/AppNavigator';
import { useSMSListener } from './src/hooks/useSMSListener';

// Request notification permissions once at startup (Android 13+ requires this)
async function requestNotificationPermissions() {
  if (Platform.OS === 'android') {
    await Notifications.requestPermissionsAsync();
  }
}

// Inner component so hooks can be used inside SafeAreaProvider tree
function AppContent() {
  useSMSListener();

  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  return (
    <>
      <StatusBar style="dark" backgroundColor="transparent" translucent />
      <AppNavigator />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
