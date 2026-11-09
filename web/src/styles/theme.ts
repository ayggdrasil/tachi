export type Theme = 'light' | 'dark';

/** Sets the theme and keeps the browser chrome colour in sync (drops the media-gated metas so the choice wins). */
export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute('media');
    m.content = t === 'dark' ? '#212121' : '#ffffff';
  });
}
