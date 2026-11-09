import { getLocale } from '../locale';
// Deterministic blood-pressure severity, shared by senior logging, family answers and bot reactions.
export type BpLevel = 'invalid' | 'low' | 'normal' | 'elevated' | 'high' | 'crisis';

/** Single numeric BP parser: any two numbers in 40–300 (out-of-range values are then judged 'invalid' by assessBloodPressure). */
export function parseBloodPressure(text: string): { systolic: number; diastolic: number } | null {
  const t = text.trim();
  if (!/[가-힣]/.test(t) && /[A-Za-z]/.test(t)) return parseBloodPressureEn(t);
  const m = /혈압/.test(t)
    ? t.match(/(?:혈압[^\d]{0,12})?(?<!\d)(\d{2,3})\s*(?:에|\/|-|,|하고|\s)\s*(\d{2,3})(?!\d)/)
    : t.match(/(?<!\d)(\d{2,3})\s*\/\s*(\d{2,3})(?!\d)/);
  if (!m) return null;
  const systolic = +m[1], diastolic = +m[2];
  if (systolic < 40 || systolic > 300 || diastolic < 40 || diastolic > 300) return null;
  return { systolic, diastolic };
}

/** English: 'blood pressure 132 over 84', 'BP was 132/84', '132 over 84', '132/84'. */
export function parseBloodPressureEn(t: string): { systolic: number; diastolic: number } | null {
  const m = /\b(?:blood\s*pressure|bp|pressure)\b/i.test(t)
    ? t.match(/(?<![\d/])(\d{2,3})\s*(?:over|\/|-|,|and|\s)\s*(\d{2,3})(?![\d/])/i)
    : t.match(/(?<![\d/])(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})(?![\d/])/i);
  if (!m) return null;
  const systolic = +m[1], diastolic = +m[2];
  if (systolic < 40 || systolic > 300 || diastolic < 40 || diastolic > 300) return null;
  return { systolic, diastolic };
}

const BP_LABELS: Record<BpLevel, [string, string]> = {
  invalid: ['입력 확인 필요', 'Needs rechecking'], crisis: ['매우 높음', 'Very high'], high: ['높음', 'High'],
  elevated: ['다소 높음', 'Somewhat high'], low: ['낮은 편', 'On the low side'], normal: ['정상 범위', 'Normal range'],
};
const labelFor = (level: BpLevel): string => BP_LABELS[level][getLocale() === 'en' ? 1 : 0];

export function assessBloodPressure(r: { systolic: number; diastolic: number }): { level: BpLevel; label: string } {
  const { systolic: s, diastolic: d } = r;
  if (!Number.isFinite(s) || !Number.isFinite(d) || s < 70 || s > 250 || d < 40 || d > 150 || s <= d) return { level: 'invalid', label: labelFor('invalid') };
  if (s >= 180 || d >= 120) return { level: 'crisis', label: labelFor('crisis') };
  if (s >= 160 || d >= 100) return { level: 'high', label: labelFor('high') };
  if (s >= 140 || d >= 90) return { level: 'elevated', label: labelFor('elevated') };
  if (s < 90 || d < 60) return { level: 'low', label: labelFor('low') };
  return { level: 'normal', label: labelFor('normal') };
}
