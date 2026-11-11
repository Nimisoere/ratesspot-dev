/**
 * Brand colours as CSS variables, with text colours worked out so they're
 * always readable (WCAG contrast), whatever colours the business chose.
 */

const DEFAULT_BRAND = "#1f2937";
const DEFAULT_ACCENT = "#b45309";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on `background`. */
export function textOn(background: string): string {
  return contrast(background, "#ffffff") >= contrast(background, "#111111") ? "#ffffff" : "#111111";
}

/** The colour itself if it's readable as text on white; otherwise a dark neutral. */
function readableOnWhite(colour: string): string {
  return contrast(colour, "#ffffff") >= 4.5 ? colour : "#1f2937";
}

export function themeVars(brand: { brandColor: string | null; accentColor: string | null }): Record<string, string> {
  const valid = (c: string | null) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null);
  const b = valid(brand.brandColor) ?? DEFAULT_BRAND;
  const a = valid(brand.accentColor) ?? DEFAULT_ACCENT;
  return { "--brand": b, "--on-brand": textOn(b), "--brand-text": readableOnWhite(b), "--accent": a, "--on-accent": textOn(a), "--accent-text": readableOnWhite(a) };
}
