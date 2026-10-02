// Static copy and live readouts share one catalog. Switching language never reloads a scene.
const response = await fetch('translations.json?v=15');
if (!response.ok) throw Error(`Translation catalog HTTP ${response.status}`);
const catalog = await response.json();
let language = 'en';
export function t(key, values = {}) {
  const entry = catalog[key];
  if (!entry) throw Error(`Missing translation: ${key}`);
  return entry[language].replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}
export function getLanguage() { return language; }
export function applyLanguage(next) {
  language = next === 'ko' ? 'ko' : 'en';
  document.documentElement.lang = language;
  document.title = language === 'ko'
    ? '스쿠핑 파지 · 강화학습 | 엄승환'
    : 'Scooping Grasping · Reinforcement Learning | Seunghwan Um';
  try { localStorage.setItem('scooping-language', language); } catch (_) {}
  document.querySelectorAll('[data-i18n]').forEach(el => {el.textContent = t(el.dataset.i18n);});
  for (const attr of ['aria-label', 'title']) {
    document.querySelectorAll(`[data-i18n-${attr}]`).forEach(el => el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`))));
  }
  const button = document.getElementById('language-toggle');
  button.innerHTML = `<span class="${language === 'en' ? 'active' : ''}">EN</span><span>/</span><span class="${language === 'ko' ? 'active' : ''}">KO</span>`;
  button.setAttribute('aria-label', language === 'en' ? 'Switch to Korean' : '영어로 전환');
  window.dispatchEvent(new CustomEvent('languagechange', {detail: {language}}));
}
document.getElementById('language-toggle').onclick = () => applyLanguage(language === 'en' ? 'ko' : 'en');
let initialLanguage = 'en';
try { initialLanguage = localStorage.getItem('scooping-language') || 'en'; } catch (_) {}
applyLanguage(initialLanguage);
