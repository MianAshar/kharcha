import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { COLORS } from '../constants/colors';
import { RootStackParamList } from '../types';
import { useAuth } from '../hooks/useAuth';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export default function SplashScreen({ navigation }: Props) {
  const { session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    const target = session ? 'Main' : 'Auth';
    navigation.replace(target as any);
  }, [loading, session, navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>خرچہ</Text>
      <Text style={styles.brand}>Kharcha</Text>
      <Text style={styles.tagline}>Track smarter. Spend wiser.</Text>
      <ActivityIndicator
        style={styles.spinner}
        color={COLORS.primary}
        size="large"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    fontSize: 56,
    color: COLORS.primary,
    marginBottom: 8,
  },
  brand: {
    fontFamily: 'Inter',
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.secondary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 16,
    color: COLORS.muted,
    marginTop: 8,
  },
  spinner: {
    marginTop: 48,
  },
});
