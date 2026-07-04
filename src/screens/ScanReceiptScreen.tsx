import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { CompositeNavigationProp, useNavigation, useIsFocused } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { RootStackParamList, MainTabParamList, AIReceiptResult } from '../types';
import { compressImage } from '../utils/compress';
import { uploadReceipt, processReceipt } from '../services/receipts';
import { useAuth } from '../hooks/useAuth';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'ScanReceipt'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type ScreenMode = 'camera' | 'preview' | 'processing';

// ── Zoom levels: label shown on button → expo-camera zoom value (0–1) ─────────
const ZOOM_LEVELS = [
  { label: '0.5×', value: 0 },
  { label: '1×',   value: 0.15 },
  { label: '2×',   value: 0.35 },
  { label: '5×',   value: 0.7 },
] as const;

type ZoomLevel = typeof ZOOM_LEVELS[number];

export default function ScanReceiptScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isFocused = useIsFocused(); // fix #4: release camera when screen is not focused
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState<ScreenMode>('camera');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [processingText, setProcessingText] = useState('');
  const [zoom, setZoom] = useState<ZoomLevel>(ZOOM_LEVELS[1]); // default 1×

  // ── Capture from camera ────────────────────────────────────────────────────
  const capture = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (photo?.uri) {
        setPreviewUri(photo.uri);
        setMode('preview');
      }
    } catch {
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  }, []);

  // ── Pick from gallery ──────────────────────────────────────────────────────
  const pickFromGallery = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Allow photo library access to pick receipt images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false, // fix #1: no auto-crop; use full image as-is
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPreviewUri(result.assets[0].uri);
      setMode('preview');
    }
  }, []);

  // ── "Use Photo" — full pipeline: compress → upload → extract → navigate ────
  const usePhoto = useCallback(async () => {
    if (!previewUri || !user) return;

    // ── Step 1: Compress ────────────────────────────────────────────────────
    setProcessingText('Preparing image…');
    setMode('processing');

    let compressed: string;
    try {
      compressed = await compressImage(previewUri);
    } catch {
      Alert.alert('Error', 'Failed to compress image. Please try again.');
      setMode('preview');
      return;
    }

    // ── Step 2: Upload to Supabase Storage + insert receipt record ──────────
    setProcessingText('Uploading receipt…');

    let receiptId: string | null = null;
    let imageUrl: string = compressed;

    try {
      const receipt = await uploadReceipt(user.id, compressed);
      receiptId = receipt.id;
      imageUrl = receipt.image_url;
      console.log('[ScanReceipt] upload success — receiptId:', receiptId);
    } catch (err) {
      console.log('[ScanReceipt] upload failed:', err instanceof Error ? err.message : err);
    }

    // ── Step 3: Try AI extraction ────────────────────────────────────────────
    let aiResult: AIReceiptResult | null = null;

    if (receiptId) {
      setProcessingText('Analyzing receipt…');
      try {
        aiResult = await processReceipt(receiptId);
        console.log('[ScanReceipt] AI extraction success');
      } catch (err) {
        console.log('[ScanReceipt] AI extraction failed:', err instanceof Error ? err.message : err);
      }
    }

    // ── Step 4: Navigate with whatever data we have ──────────────────────────
    navigation.navigate('ReviewExpense', { imageUri: imageUrl, receiptId, aiResult });

    // Reset for next scan
    setPreviewUri(null);
    setMode('camera');
    setProcessingText('');
    setZoom(ZOOM_LEVELS[1]); // reset to 1×
  }, [previewUri, user, navigation]);

  // ── Retake ─────────────────────────────────────────────────────────────────
  const retake = useCallback(() => {
    setPreviewUri(null);
    setMode('camera');
  }, []);

  // ── Permission: loading ────────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  // ── Permission: denied ─────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.permIcon}>📷</Text>
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permBody}>
          Allow camera access to scan receipts and automatically extract expense details.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.galleryAlt} onPress={pickFromGallery}>
          <Text style={styles.galleryAltText}>Pick from Gallery instead</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Preview or processing ──────────────────────────────────────────────────
  if (mode === 'preview' || mode === 'processing') {
    return (
      <View style={styles.root}>
        {/* Pinch-to-zoom image preview */}
        {previewUri && (
          <ScrollView
            style={StyleSheet.absoluteFill}
            contentContainerStyle={styles.zoomContent}
            maximumZoomScale={8}
            minimumZoomScale={1}
            centerContent
            bouncesZoom
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          </ScrollView>
        )}

        {/* Close / back button */}
        <View style={[styles.topGradient, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={retake}
            disabled={mode === 'processing'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Processing overlay */}
        {mode === 'processing' && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.processingText}>{processingText}</Text>
          </View>
        )}

        {/* Bottom buttons — only shown in preview mode */}
        {mode === 'preview' && (
          <View style={[styles.previewActions, { paddingBottom: insets.bottom + 24 }]}>
            <TouchableOpacity style={styles.retakeBtn} onPress={retake} activeOpacity={0.85}>
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.usePhotoBtn} onPress={usePhoto} activeOpacity={0.85}>
              <Text style={styles.usePhotoBtnText}>Use Photo</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ── Live camera ────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* fix #4: only mount CameraView when this tab is focused */}
      {isFocused && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          zoom={zoom.value}
        />
      )}

      <View style={[styles.topGradient, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => navigation.navigate('Home')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Receipt frame guide */}
      <View style={styles.frameWrapper} pointerEvents="none">
        <View style={styles.frame}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
        <Text style={styles.guideText}>Position receipt within frame</Text>
      </View>

      <View style={[styles.bottomGradient, { paddingBottom: insets.bottom + 24 }]}>
        {/* fix #2: zoom level buttons */}
        <View style={styles.zoomRow}>
          {ZOOM_LEVELS.map((z) => {
            const active = zoom.label === z.label;
            return (
              <TouchableOpacity
                key={z.label}
                style={[styles.zoomBtn, active && styles.zoomBtnActive]}
                onPress={() => setZoom(z)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={[styles.zoomBtnText, active && styles.zoomBtnTextActive]}>
                  {z.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Capture + gallery */}
        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.sideBtn} onPress={pickFromGallery}>
            <Text style={styles.sideBtnIcon}>🖼️</Text>
            <Text style={styles.sideBtnLabel}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureOuter} onPress={capture} activeOpacity={0.85}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
          <View style={styles.sideBtn} />
        </View>
      </View>
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },

  // ── Permission ─────────────────────────────────────────────────────────────
  permIcon: { fontSize: 56, marginBottom: 16 },
  permTitle: {
    fontSize: 20, fontWeight: '700', color: COLORS.secondary,
    marginBottom: 12, textAlign: 'center',
  },
  permBody: {
    fontSize: 14, color: COLORS.muted, textAlign: 'center',
    lineHeight: 20, marginBottom: 32,
  },
  permBtn: {
    backgroundColor: COLORS.primary, paddingHorizontal: 32,
    paddingVertical: 14, borderRadius: 100, marginBottom: 16,
  },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  galleryAlt: { padding: 8 },
  galleryAltText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },

  // ── Shared overlays ────────────────────────────────────────────────────────
  topGradient: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingBottom: 32,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // ── Preview zoom ───────────────────────────────────────────────────────────
  zoomContent: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: SCREEN_W,
    height: SCREEN_H,
  },

  // ── Processing overlay ─────────────────────────────────────────────────────
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  processingText: {
    color: '#fff', fontSize: 16, fontWeight: '600', letterSpacing: 0.2,
  },

  // ── Preview actions ────────────────────────────────────────────────────────
  previewActions: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 24, paddingTop: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  retakeBtn: {
    flex: 1, height: 52, borderRadius: 100,
    borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  retakeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  usePhotoBtn: {
    flex: 1, height: 52, borderRadius: 100,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  usePhotoBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Camera frame guide ─────────────────────────────────────────────────────
  frameWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  frame: { width: '78%', aspectRatio: 0.65, position: 'relative' },
  corner: {
    position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: '#fff',
  },
  topLeft: {
    top: 0, left: 0,
    borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: 4,
  },
  topRight: {
    top: 0, right: 0,
    borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: 4,
  },
  bottomLeft: {
    bottom: 0, left: 0,
    borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: 4,
  },
  bottomRight: {
    bottom: 0, right: 0,
    borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: 4,
  },
  guideText: {
    color: 'rgba(255,255,255,0.9)', fontSize: 13,
    fontWeight: '500', letterSpacing: 0.3,
  },

  // ── Camera bottom controls ─────────────────────────────────────────────────
  bottomGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingTop: 20, backgroundColor: 'rgba(0,0,0,0.55)',
    gap: 16,
  },

  // Zoom row
  zoomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  zoomBtn: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  zoomBtnActive: {
    backgroundColor: COLORS.primary,
  },
  zoomBtnText: {
    color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600',
  },
  zoomBtnTextActive: {
    color: '#fff', fontWeight: '700',
  },

  controlsRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 36,
  },
  sideBtn: { width: 64, alignItems: 'center', gap: 4 },
  sideBtnIcon: { fontSize: 28 },
  sideBtnLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '500' },
  captureOuter: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 16, elevation: 8,
  },
  captureInner: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#fff', opacity: 0.2,
  },
});
