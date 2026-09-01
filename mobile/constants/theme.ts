/**
 * Design tokens for the whole app. Palette is a "live auction house" theme —
 * warm neutrals with a gold/amber accent (gavel, trophy, winning-bid gold)
 * instead of a generic default blue — plus semantic status colors used by
 * Badge for auction/player/bid states.
 */

import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#1C1A16",
    textSecondary: "#736B5E",
    background: "#FAF8F4",
    backgroundElement: "#F1ECE2",
    backgroundSelected: "#FBE8C8",
    border: "#E4DCCB",
    accent: "#B4690E",
    accentText: "#FFFFFF",
    success: "#15803D",
    successBg: "#DCF3E3",
    danger: "#B91C1C",
    dangerBg: "#FBE1DE",
    live: "#C2410C",
    liveBg: "#FDE7D8",
    neutralBg: "#ECE7DC",
  },
  dark: {
    text: "#F5EFE4",
    textSecondary: "#B0A38C",
    background: "#16130E",
    backgroundElement: "#241E15",
    backgroundSelected: "#3D2C13",
    border: "#3A311F",
    accent: "#EFA53D",
    accentText: "#1C1305",
    success: "#4ADE80",
    successBg: "#173023",
    danger: "#F87171",
    dangerBg: "#3A1B1B",
    live: "#FB923C",
    liveBg: "#3A2313",
    neutralBg: "#2E2818",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 14,
  large: 20,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
