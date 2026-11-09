// Deterministic blood-pressure severity, shared by senior logging, family answers and bot reactions.
export type BpLevel = 'invalid' | 'low' | 'normal' | 'elevated' | 'high' | 'crisis';

/** Single numeric BP parser: any two numbers in 40–300 (out-of-range values are then judged 'invalid' by assessBloodPressure). */
export function parseBloodPressure(text: string): { systolic: number; diastolic: number } | null {
  const t = text.trim();
  const m = /혈압/.test(t)
    ? t.match(/(?:혈압[^\d]{0,12})?(?<!\d)(\d{2,3})\s*(?:에|\/|-|,|하고|\s)\s*(\d{2,3})(?!\d)/)
    : t.match(/(?<!\d)(\d{2,3})\s*\/\s*(\d{2,3})(?!\d)/);
  if (!m) return null;
  const systolic = +m[1], diastolic = +m[2];
  if (systolic < 40 || systolic > 300 || diastolic < 40 || diastolic > 300) return null;
  return { systolic, diastolic };
}

export function assessBloodPressure(r: { systolic: number; diastolic: number }): { level: BpLevel; label: string } {
  const { systolic: s, diastolic: d } = r;
  if (!Number.isFinite(s) || !Number.isFinite(d) || s < 70 || s > 250 || d < 40 || d > 150 || s <= d) return { level: 'invalid', label: '입력 확인 필요' };
  if (s >= 180 || d >= 120) return { level: 'crisis', label: '매우 높음' };
  if (s >= 160 || d >= 100) return { level: 'high', label: '높음' };
  if (s >= 140 || d >= 90) return { level: 'elevated', label: '다소 높음' };
  if (s < 90 || d < 60) return { level: 'low', label: '낮은 편' };
  return { level: 'normal', label: '정상 범위' };
}
