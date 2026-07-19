import prisma from '../lib/prisma';

// Basit key/value ayarlar + review_mode için senkron okunabilen in-memory cache.
// Hot-path'ler (OTP doğrulama, talep onayı) DB'yi beklemeden cache'ten okur.

const REVIEW_MODE_KEY = 'review_mode';
const CACHE_TTL_MS = 30_000;

let cachedReviewMode = false; // varsayılan: kapalı (mevcut canlı durum)
let cacheLoadedAt = 0;

export async function refreshReviewModeCache(): Promise<boolean> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: REVIEW_MODE_KEY } });
    cachedReviewMode = row?.value === 'on';
    cacheLoadedAt = Date.now();
  } catch (error) {
    // DB erişilemezse mevcut cache korunur
    console.error('[Settings] review_mode cache yenilenemedi:', error);
  }
  return cachedReviewMode;
}

// Senkron okuma. Cache bayatsa arka planda tazeler (fire-and-forget).
export function getReviewMode(): boolean {
  if (Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    void refreshReviewModeCache();
  }
  return cachedReviewMode;
}

// ==================== ZORUNLU SÜRÜM GÜNCELLEME ====================

// Uygulamanın çalışmasına izin verilen EN DÜŞÜK sürüm. Buradaki değer
// yükseltilince, daha eski sürümdeki kullanıcılar güncelleme ekranında kilitlenir.
export const APP_VERSION_KEYS = {
  minIos: 'min_ios_version',
  minAndroid: 'min_android_version',
  iosUrl: 'ios_store_url',
  androidUrl: 'android_store_url',
} as const;

const DEFAULTS: Record<string, string> = {
  [APP_VERSION_KEYS.minIos]: '1.0.0',
  [APP_VERSION_KEYS.minAndroid]: '1.0.0',
  [APP_VERSION_KEYS.iosUrl]: 'https://apps.apple.com/tr/app/gustoapp/id6765545622',
  [APP_VERSION_KEYS.androidUrl]: 'https://play.google.com/store/apps/details?id=com.gustoapp.net',
};

export async function getAppVersionConfig() {
  const keys = Object.values(APP_VERSION_KEYS);
  const rows = await prisma.setting.findMany({ where: { key: { in: [...keys] } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    minIosVersion: map.get(APP_VERSION_KEYS.minIos) ?? DEFAULTS[APP_VERSION_KEYS.minIos],
    minAndroidVersion: map.get(APP_VERSION_KEYS.minAndroid) ?? DEFAULTS[APP_VERSION_KEYS.minAndroid],
    iosStoreUrl: map.get(APP_VERSION_KEYS.iosUrl) ?? DEFAULTS[APP_VERSION_KEYS.iosUrl],
    androidStoreUrl: map.get(APP_VERSION_KEYS.androidUrl) ?? DEFAULTS[APP_VERSION_KEYS.androidUrl],
  };
}

export async function setAppVersionConfig(input: Record<string, string | undefined>) {
  const entries: Array<[string, string]> = [];
  if (input.minIosVersion) entries.push([APP_VERSION_KEYS.minIos, input.minIosVersion]);
  if (input.minAndroidVersion) entries.push([APP_VERSION_KEYS.minAndroid, input.minAndroidVersion]);
  if (input.iosStoreUrl) entries.push([APP_VERSION_KEYS.iosUrl, input.iosStoreUrl]);
  if (input.androidStoreUrl) entries.push([APP_VERSION_KEYS.androidUrl, input.androidStoreUrl]);

  for (const [key, value] of entries) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  return getAppVersionConfig();
}

export async function setReviewMode(enabled: boolean): Promise<void> {
  const value = enabled ? 'on' : 'off';
  await prisma.setting.upsert({
    where: { key: REVIEW_MODE_KEY },
    update: { value },
    create: { key: REVIEW_MODE_KEY, value },
  });
  cachedReviewMode = enabled;
  cacheLoadedAt = Date.now();
}
