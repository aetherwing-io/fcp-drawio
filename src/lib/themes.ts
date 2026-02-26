import type { ThemeColors, ThemeName } from "../types/index.js";

export const THEMES: Record<ThemeName, ThemeColors> = {
  blue: { fill: "#dae8fc", stroke: "#6c8ebf" },
  green: { fill: "#d5e8d4", stroke: "#82b366" },
  red: { fill: "#f8cecc", stroke: "#b85450" },
  yellow: { fill: "#fff2cc", stroke: "#d6b656" },
  orange: { fill: "#ffe6cc", stroke: "#d79b00" },
  purple: { fill: "#e1d5e7", stroke: "#9673a6" },
  gray: { fill: "#f5f5f5", stroke: "#666666" },
  dark: { fill: "#1a1a2e", stroke: "#16213e", fontColor: "#e0e0e0" },
  white: { fill: "#ffffff", stroke: "#000000" },
};

const THEME_NAMES = new Set(Object.keys(THEMES));

export function isThemeName(name: string): name is ThemeName {
  return THEME_NAMES.has(name);
}

export function resolveTheme(name: string): ThemeColors | null {
  if (isThemeName(name)) {
    return THEMES[name];
  }
  return null;
}

/**
 * Resolve a color value: either a theme name (returns fill color) or a hex color.
 */
export function resolveColor(value: string): string | null {
  if (value.startsWith("#")) {
    return value;
  }
  const theme = resolveTheme(value);
  return theme ? theme.fill : null;
}
