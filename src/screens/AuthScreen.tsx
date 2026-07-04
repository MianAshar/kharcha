import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  ListRenderItemInfo,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { makeRedirectUri } from 'expo-auth-session';

import { COLORS, SHADOWS } from '../constants/colors';
import { RootStackParamList } from '../types';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase';

// Required for expo-auth-session to properly close the browser on Android
WebBrowser.maybeCompleteAuthSession();

// ─── OAuth Client IDs ─────────────────────────────────────────────────────────
// TODO: Replace these placeholder values with your real OAuth client IDs.
// Google: https://console.cloud.google.com/ → APIs & Services → Credentials
// Facebook: https://developers.facebook.com/ → My Apps → Settings → Basic
const GOOGLE_WEB_CLIENT_ID = 'YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = 'YOUR_GOOGLE_IOS_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_ANDROID_CLIENT_ID = 'YOUR_GOOGLE_ANDROID_CLIENT_ID.apps.googleusercontent.com';
const FACEBOOK_APP_ID = 'YOUR_FACEBOOK_APP_ID';

// ─── Onboarding Slides ────────────────────────────────────────────────────────
interface Slide {
  icon: string;
  headline: string;
  description: string;
  bgColor: string;
  iconBg: string;
}

const SLIDES: Slide[] = [
  {
    icon: '🧾',
    headline: 'Scan Any Receipt',
    description: 'AI extracts all details from any receipt instantly.',
    bgColor: '#FFF0F0',
    iconBg: COLORS.primary,
  },
  {
    icon: '💬',
    headline: 'Auto-Track Transactions',
    description:
      'Reads your bank SMS and emails to log every transaction automatically.',
    bgColor: '#EEF0FF',
    iconBg: '#3B3B8C',
  },
  {
    icon: '🔗',
    headline: 'Smart Matching',
    description:
      'Links your receipts to bank transactions so nothing slips through.',
    bgColor: '#EDFFF7',
    iconBg: COLORS.tertiary,
  },
];

const SLIDE_INTERVAL = 3000;

// ─── Sub-components ───────────────────────────────────────────────────────────

interface IconInputProps {
  icon: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'words';
  secureTextEntry?: boolean;
  rightElement?: React.ReactNode;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
}

function IconInput({
  icon,
  placeholder,
  value,
  onChangeText,
  keyboardType = 'default',
  autoCapitalize = 'none',
  secureTextEntry = false,
  rightElement,
  focused,
  onFocus,
  onBlur,
}: IconInputProps) {
  return (
    <View
      style={[
        styles.inputWrapper,
        focused && styles.inputWrapperFocused,
      ]}
    >
      <Text style={styles.inputIcon}>{icon}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={COLORS.outline}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        onFocus={onFocus}
        onBlur={onBlur}
        autoCorrect={false}
      />
      {rightElement}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

export default function AuthScreen({ navigation }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const CAROUSEL_HEIGHT = screenHeight * 0.38;

  const { signInWithEmail, signUpWithEmail, signInWithIdToken } = useAuth();

  // ── Carousel state ──────────────────────────────────────────────────────────
  const flatListRef = useRef<FlatList<Slide>>(null);
  const currentSlideRef = useRef(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const isUserScrolling = useRef(false);

  const advanceSlide = useCallback(() => {
    if (isUserScrolling.current) return;
    const next = (currentSlideRef.current + 1) % SLIDES.length;
    currentSlideRef.current = next;
    setActiveSlide(next);
    flatListRef.current?.scrollToOffset({
      offset: next * screenWidth,
      animated: true,
    });
  }, [screenWidth]);

  useEffect(() => {
    const id = setInterval(advanceSlide, SLIDE_INTERVAL);
    return () => clearInterval(id);
  }, [advanceSlide]);

  const handleScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
      currentSlideRef.current = index;
      setActiveSlide(index);
      isUserScrolling.current = false;
    },
    [screenWidth]
  );

  // ── Form state ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Track focused input for highlight border
  const [focused, setFocused] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  // ── Email auth ──────────────────────────────────────────────────────────────
  const goMain = useCallback(
    () => navigation.replace('Main' as any),
    [navigation]
  );

  async function handleEmailAuth() {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    if (mode === 'signup') {
      if (!name.trim()) {
        Alert.alert('Missing fields', 'Please enter your full name.');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Password mismatch', 'Passwords do not match.');
        return;
      }
      if (password.length < 6) {
        Alert.alert('Weak password', 'Password must be at least 6 characters.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email.trim(), password);
        goMain();
      } else {
        await signUpWithEmail(email.trim(), password, name.trim());
        Alert.alert(
          'Verify your email',
          'We sent a confirmation link to ' + email.trim() + '. Check your inbox.',
          [{ text: 'OK', onPress: () => setMode('signin') }]
        );
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      Alert.alert('Enter email', 'Enter your email address above first.');
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'kharcha://reset-password',
      });
      if (error) throw error;
      Alert.alert('Email sent', 'Check your inbox for a password reset link.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to send reset email.');
    }
  }

  // ── Google OAuth ────────────────────────────────────────────────────────────
  const [, googleResponse, googlePrompt] = Google.useAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
    redirectUri: makeRedirectUri({ scheme: 'kharcha' }),
  });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params.id_token;
      if (!idToken) {
        setGoogleLoading(false);
        Alert.alert('Error', 'Google sign-in did not return an ID token.');
        return;
      }
      signInWithIdToken('google', idToken)
        .then(goMain)
        .catch((e: unknown) => {
          Alert.alert('Error', e instanceof Error ? e.message : 'Google sign-in failed.');
        })
        .finally(() => setGoogleLoading(false));
    } else if (googleResponse?.type === 'error') {
      setGoogleLoading(false);
      Alert.alert('Error', googleResponse.error?.message ?? 'Google sign-in failed.');
    } else if (googleResponse?.type === 'dismiss' || googleResponse?.type === 'cancel') {
      setGoogleLoading(false);
    }
  }, [googleResponse]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      await googlePrompt();
      // Result handled in useEffect above
    } catch (e: unknown) {
      setGoogleLoading(false);
      Alert.alert('Error', e instanceof Error ? e.message : 'Google sign-in failed.');
    }
  }

  // ── Facebook OAuth ──────────────────────────────────────────────────────────
  const [, facebookResponse, facebookPrompt] = Facebook.useAuthRequest({
    clientId: FACEBOOK_APP_ID,
    scopes: ['public_profile', 'email'],
    redirectUri: makeRedirectUri({ scheme: 'kharcha' }),
  });

  useEffect(() => {
    if (facebookResponse?.type === 'success') {
      const accessToken = facebookResponse.params.access_token;
      if (!accessToken) {
        setFacebookLoading(false);
        Alert.alert('Error', 'Facebook sign-in did not return an access token.');
        return;
      }
      // Supabase treats Facebook's access_token as the id_token for signInWithIdToken
      signInWithIdToken('facebook', accessToken)
        .then(goMain)
        .catch((e: unknown) => {
          Alert.alert('Error', e instanceof Error ? e.message : 'Facebook sign-in failed.');
        })
        .finally(() => setFacebookLoading(false));
    } else if (facebookResponse?.type === 'error') {
      setFacebookLoading(false);
      Alert.alert('Error', facebookResponse.error?.message ?? 'Facebook sign-in failed.');
    } else if (facebookResponse?.type === 'dismiss' || facebookResponse?.type === 'cancel') {
      setFacebookLoading(false);
    }
  }, [facebookResponse]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFacebookSignIn() {
    setFacebookLoading(true);
    try {
      await facebookPrompt();
    } catch (e: unknown) {
      setFacebookLoading(false);
      Alert.alert('Error', e instanceof Error ? e.message : 'Facebook sign-in failed.');
    }
  }

  // ── Apple Sign In ───────────────────────────────────────────────────────────
  async function handleAppleSignIn() {
    setAppleLoading(true);
    try {
      // Generate a nonce to protect against replay attacks
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new Error('Apple Sign In did not return an identity token.');
      }

      await signInWithIdToken('apple', credential.identityToken, rawNonce);
      goMain();
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
        // User cancelled — no alert needed
      } else {
        Alert.alert('Error', e instanceof Error ? e.message : 'Apple sign-in failed.');
      }
    } finally {
      setAppleLoading(false);
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────
  const renderSlide = useCallback(
    ({ item }: ListRenderItemInfo<Slide>) => (
      <View style={[styles.slide, { width: screenWidth, backgroundColor: item.bgColor }]}>
        <View style={[styles.slideIconBg, { backgroundColor: item.iconBg }]}>
          <Text style={styles.slideIcon}>{item.icon}</Text>
        </View>
        <Text style={styles.slideHeadline}>{item.headline}</Text>
        <Text style={styles.slideDescription}>{item.description}</Text>
      </View>
    ),
    [screenWidth]
  );

  const eyeToggle = (show: boolean, onToggle: () => void) => (
    <TouchableOpacity onPress={onToggle} style={styles.eyeButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Text style={styles.eyeIcon}>{show ? '🙈' : '👁️'}</Text>
    </TouchableOpacity>
  );

  const socialBusy = googleLoading || facebookLoading || appleLoading;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Carousel ─────────────────────────────────────────────────────── */}
        <View style={{ height: CAROUSEL_HEIGHT }}>
          <FlatList
            ref={flatListRef}
            data={SLIDES}
            renderItem={renderSlide}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => String(i)}
            onScrollBeginDrag={() => { isUserScrolling.current = true; }}
            onMomentumScrollEnd={handleScrollEnd}
            getItemLayout={(_, index) => ({
              length: screenWidth,
              offset: screenWidth * index,
              index,
            })}
            scrollEventThrottle={16}
            style={{ flex: 1 }}
          />
          {/* Dot indicators */}
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === activeSlide ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>
        </View>

        {/* ── Auth Card ────────────────────────────────────────────────────── */}
        <View style={styles.card}>
          {/* Tab toggles */}
          <View style={styles.tabs}>
            {(['signin', 'signup'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={styles.tab}
                onPress={() => setMode(tab)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    mode === tab ? styles.tabLabelActive : styles.tabLabelInactive,
                  ]}
                >
                  {tab === 'signin' ? 'Sign In' : 'Sign Up'}
                </Text>
                {mode === tab && <View style={styles.tabUnderline} />}
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Sign In Form ──────────────────────────────────────────────── */}
          {mode === 'signin' && (
            <View style={styles.form}>
              <IconInput
                icon="✉️"
                placeholder="name@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                focused={focused === 'email'}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
              />
              <IconInput
                icon="🔒"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                focused={focused === 'password'}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                rightElement={eyeToggle(showPassword, () => setShowPassword((v) => !v))}
              />
              <TouchableOpacity
                onPress={handleForgotPassword}
                style={styles.forgotRow}
                hitSlop={{ top: 8, bottom: 8 }}
              >
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
                onPress={handleEmailAuth}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Sign In</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Sign Up Form ──────────────────────────────────────────────── */}
          {mode === 'signup' && (
            <View style={styles.form}>
              <IconInput
                icon="👤"
                placeholder="Full Name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                focused={focused === 'name'}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
              />
              <IconInput
                icon="✉️"
                placeholder="name@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                focused={focused === 'email'}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
              />
              <IconInput
                icon="🔒"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                focused={focused === 'password'}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                rightElement={eyeToggle(showPassword, () => setShowPassword((v) => !v))}
              />
              <IconInput
                icon="🔒"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                focused={focused === 'confirm'}
                onFocus={() => setFocused('confirm')}
                onBlur={() => setFocused(null)}
                rightElement={eyeToggle(showConfirmPassword, () =>
                  setShowConfirmPassword((v) => !v)
                )}
              />

              <TouchableOpacity
                style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
                onPress={handleEmailAuth}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Create Account</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Divider ───────────────────────────────────────────────────── */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* ── Social Buttons ────────────────────────────────────────────── */}
          <View style={styles.socialStack}>
            {/* Google */}
            <TouchableOpacity
              style={[styles.socialPill, socialBusy && styles.socialPillDisabled]}
              onPress={handleGoogleSignIn}
              disabled={socialBusy}
              activeOpacity={0.75}
            >
              {googleLoading ? (
                <ActivityIndicator color={COLORS.primary} size="small" />
              ) : (
                <>
                  <GoogleLogo />
                  <Text style={styles.socialPillText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Facebook */}
            <TouchableOpacity
              style={[styles.socialPill, styles.socialPillFacebook, socialBusy && styles.socialPillDisabled]}
              onPress={handleFacebookSignIn}
              disabled={socialBusy}
              activeOpacity={0.75}
            >
              {facebookLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <FacebookLogo />
                  <Text style={[styles.socialPillText, { color: '#fff' }]}>
                    Continue with Facebook
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Apple — iOS only, uses the required native AppleAuthenticationButton */}
            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
                cornerRadius={14}
                style={[styles.applePill, socialBusy && styles.socialPillDisabled]}
                onPress={handleAppleSignIn}
              />
            )}
          </View>

          {/* ── Footer Link ───────────────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.footer}
            onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            <Text style={styles.footerText}>
              {mode === 'signin'
                ? "Don't have an account? "
                : 'Already have an account? '}
              <Text style={styles.footerLink}>
                {mode === 'signin' ? 'Sign Up' : 'Sign In'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Social Logo Components ───────────────────────────────────────────────────

/**
 * Google "G" logo approximated with React Native Views.
 * Uses the four official Google brand colours arranged as a segmented arc.
 */
function GoogleLogo() {
  return (
    <View style={logoStyles.googleWrap}>
      {/* Outer ring — four colour quadrants clipped into a ring shape */}
      <View style={logoStyles.googleRing}>
        <View style={[logoStyles.googleQuad, logoStyles.googleTL, { backgroundColor: '#4285F4' }]} />
        <View style={[logoStyles.googleQuad, logoStyles.googleTR, { backgroundColor: '#EA4335' }]} />
        <View style={[logoStyles.googleQuad, logoStyles.googleBL, { backgroundColor: '#34A853' }]} />
        <View style={[logoStyles.googleQuad, logoStyles.googleBR, { backgroundColor: '#FBBC05' }]} />
        {/* Inner white circle to create the ring effect */}
        <View style={logoStyles.googleInner} />
        {/* Right-side cut-out for the "G" bar */}
        <View style={logoStyles.googleBarCutout} />
      </View>
      {/* Horizontal bar of the G */}
      <View style={logoStyles.googleBar} />
    </View>
  );
}

function FacebookLogo() {
  return (
    <View style={logoStyles.fbWrap}>
      <Text style={logoStyles.fbF}>f</Text>
    </View>
  );
}

const logoStyles = StyleSheet.create({
  // Google "G" — ring made of four coloured quadrants with a white inner circle
  googleWrap: {
    width: 24,
    height: 24,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    flexWrap: 'wrap',
    flexDirection: 'row',
  },
  googleQuad: {
    width: 12,
    height: 12,
  },
  googleTL: { borderTopLeftRadius: 12 },
  googleTR: { borderTopRightRadius: 12 },
  googleBL: { borderBottomLeftRadius: 12 },
  googleBR: { borderBottomRightRadius: 12 },
  googleInner: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    top: 5,
    left: 5,
  },
  googleBarCutout: {
    position: 'absolute',
    width: 8,
    height: 9,
    backgroundColor: '#fff',
    right: 0,
    top: 7.5,
  },
  googleBar: {
    position: 'absolute',
    width: 8,
    height: 3,
    backgroundColor: '#FBBC05',
    right: 0,
    top: 10.5,
    borderRadius: 1,
  },

  // Facebook "f" badge
  fbWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fbF: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1877F2',
    lineHeight: 18,
    marginTop: 1,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // Carousel
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 24,
    gap: 16,
  },
  slideIconBg: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    ...SHADOWS.card,
  },
  slideIcon: {
    fontSize: 36,
  },
  slideHeadline: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.onSurface,
    textAlign: 'center',
    lineHeight: 28,
  },
  slideDescription: {
    fontSize: 15,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
  dotActive: {
    width: 20,
    backgroundColor: COLORS.primary,
  },
  dotInactive: {
    width: 7,
    backgroundColor: COLORS.outlineVariant,
  },

  // Card
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    paddingHorizontal: 24,
    paddingBottom: 32,
    ...SHADOWS.modal,
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant + '40',
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: COLORS.primary,
  },
  tabLabelInactive: {
    color: COLORS.onSurfaceVariant,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 20,
    right: 20,
    height: 2,
    backgroundColor: COLORS.primary,
    borderRadius: 1,
  },

  // Form
  form: {
    gap: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1.5,
    borderColor: COLORS.outlineVariant,
    borderRadius: 14,
    height: 56,
    paddingHorizontal: 14,
  },
  inputWrapperFocused: {
    borderColor: COLORS.primary,
  },
  inputIcon: {
    fontSize: 18,
    marginRight: 10,
    lineHeight: 22,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.onSurface,
    height: '100%',
  },
  eyeButton: {
    padding: 4,
  },
  eyeIcon: {
    fontSize: 16,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Primary button
  primaryBtn: {
    height: 56,
    backgroundColor: COLORS.primary,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.65,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.outlineVariant + '50',
  },
  dividerText: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
  },

  // Social — full-width pill buttons (consistent with AppleAuthenticationButton)
  socialStack: {
    gap: 12,
  },
  socialPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.outlineVariant,
    gap: 12,
    ...SHADOWS.card,
  },
  socialPillFacebook: {
    backgroundColor: '#1877F2',
    borderColor: '#1877F2',
  },
  socialPillDisabled: {
    opacity: 0.6,
  },
  socialPillText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  // AppleAuthenticationButton must receive height + width via style
  applePill: {
    height: 56,
  },

  // Footer
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
  },
  footerLink: {
    color: COLORS.primary,
    fontWeight: '700',
  },
});
