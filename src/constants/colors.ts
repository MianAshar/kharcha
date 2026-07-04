export const COLORS = {
  // Brand
  primary: '#B3193D',       // Coral red — CTAs, highlights, expense amounts
  primaryLight: '#D63653',  // primary-container
  primaryMuted: '#FFB2B7',  // inverse-primary / tints

  // Secondary (Dark Navy)
  secondary: '#1A1A2E',     // on-secondary-fixed — headers, primary text
  secondaryContainer: '#E2E0FC',

  // Tertiary (Success Green)
  tertiary: '#006A42',      // tertiary — income, credits, matched
  tertiaryContainer: '#008655',

  // Surfaces
  background: '#FFF8F7',    // off-white background
  surface: '#FFFFFF',       // card surfaces
  surfaceDim: '#EED4D4',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#FFF0F0',
  surfaceContainer: '#FFE9E9',
  surfaceContainerHigh: '#FDE2E2',
  surfaceContainerHighest: '#F7DCDD',

  // Text
  onSurface: '#261819',        // primary text on surface
  onSurfaceVariant: '#5A4042', // secondary text
  muted: '#877273',            // muted/placeholder text
  outline: '#8E7071',
  outlineVariant: '#E2BEBF',

  // Semantic
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  success: '#006A42',

  // Utility
  separator: '#F1F3F5',
  inputBorder: '#DEE2E6',
  progressTrack: '#E9ECEF',

  // Shadows
  shadowColor: '#1A1A2E',
} as const;

export const SHADOWS = {
  card: {
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  modal: {
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 8,
  },
} as const;
