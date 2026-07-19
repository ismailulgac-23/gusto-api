import prisma from '../lib/prisma';
import { notifyCityAboutCharity } from './charity-notify.service';

// Kaç dakikada bir kontrol edilecek.
const TICK_MS = 5 * 60 * 1000;
// Bitişe bu kadar kala "bitmek üzere" bildirimi gider.
const ENDING_SOON_MS = 30 * 60 * 1000;

const SELECT = {
  id: true,
  title: true,
  address: true,
  providerId: true,
  // Yakınlık bazlı hedefleme için koordinat da gerekir.
  latitude: true,
  longitude: true,
} as const;

// Bitişe yakın olanlar: bitiş zamanı şu an ile +30dk arasında ve henüz bildirilmemiş.
async function notifyEndingSoon(now: Date) {
  const soon = new Date(now.getTime() + ENDING_SOON_MS);

  const activities = await prisma.charityActivity.findMany({
    where: {
      estimatedEndTime: { gt: now, lte: soon },
      endingSoonNotifiedAt: null,
    },
    select: SELECT,
    take: 200,
  });

  for (const activity of activities) {
    await notifyCityAboutCharity(activity, 'ENDING_SOON');
    await prisma.charityActivity.update({
      where: { id: activity.id },
      data: { endingSoonNotifiedAt: new Date() },
    });
  }

  return activities.length;
}

// Sona erenler: bitiş zamanı geçmiş ve henüz bildirilmemiş.
async function notifyEnded(now: Date) {
  const activities = await prisma.charityActivity.findMany({
    where: {
      estimatedEndTime: { lt: now },
      endedNotifiedAt: null,
    },
    select: SELECT,
    take: 200,
  });

  for (const activity of activities) {
    await notifyCityAboutCharity(activity, 'ENDED');
    await prisma.charityActivity.update({
      where: { id: activity.id },
      // Bitiş bildirimi gittiyse "bitmek üzere" penceresi kaçmış demektir; ikisini de damgala.
      data: { endedNotifiedAt: new Date(), endingSoonNotifiedAt: new Date() },
    });
  }

  return activities.length;
}

async function tick() {
  try {
    const now = new Date();
    const soonCount = await notifyEndingSoon(now);
    const endedCount = await notifyEnded(now);
    if (soonCount > 0 || endedCount > 0) {
      console.log(
        `[CharityScheduler] bitişe yakın: ${soonCount}, sona eren: ${endedCount}`
      );
    }
  } catch (error) {
    console.error('[CharityScheduler] tick hatası:', error);
  }
}

let timer: NodeJS.Timeout | null = null;

export function startCharityScheduler() {
  if (timer) return;
  // İlk turu hemen değil, kısa bir gecikmeyle çalıştır (boot sırasında DB hazır olsun).
  setTimeout(tick, 15 * 1000);
  timer = setInterval(tick, TICK_MS);
  console.log('[CharityScheduler] başlatıldı (5 dakikada bir)');
}
