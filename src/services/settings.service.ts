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
