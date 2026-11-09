// Server copy dictionary (owned by the server agent). Every key must exist in BOTH en and ko.
const en: Record<string, string> = {
  'tachi.name': 'Tachi',
};
const ko: Record<string, string> = {
  'tachi.name': '타치',
};
export default { en, ko } as Record<'en' | 'ko', Record<string, string>>;
