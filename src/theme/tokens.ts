/**
 * "Chapa e Ferro" design tokens — the single source of truth for color,
 * spacing, radius, and type-scale values used across the app.
 *
 * tailwind.config.js mirrors these same literal values (it runs in plain
 * Node, outside the app's Metro/TypeScript pipeline, so it can't import
 * this file directly) — keep the two in sync if a token changes.
 */

export const colors = {
  bg: '#141414',
  surface: '#1F1F1F',
  border: '#2E2E2E',
  text: '#EDEDED',
  muted: '#8A8A8A',
  accent: '#E8442A',
  success: '#4A7C59',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

export const radius = {
  sm: 6,
} as const;

/**
 * Font family names as registered with expo-font's useFonts() — these are
 * the exact PostScript-style keys React Native uses to look up a loaded
 * custom font, so they must match the useFonts() call in app/_layout.tsx.
 */
export const fonts = {
  /** Display: large, heavy, condensed — load numbers, hero figures. */
  display: 'BarlowCondensed_900Black',
  /** Screen titles. */
  title: 'BarlowCondensed_700Bold',
  /** Card / section titles — condensed but lighter than the screen title. */
  cardTitle: 'BarlowCondensed_600SemiBold',
  /** Body copy. */
  body: 'Inter_400Regular',
  /** Slightly emphasized body copy. */
  bodyMedium: 'Inter_500Medium',
  /** Small uppercase metadata labels ("SÉRIES", "CARGA"). */
  label: 'Inter_600SemiBold',
} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type FontToken = keyof typeof fonts;
