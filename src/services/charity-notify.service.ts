import prisma from '../lib/prisma';
import { sendNotificationToMultipleUsers } from './fcm.service';

export type CharityNotifyKind = 'CREATED' | 'ENDING_SOON' | 'ENDED';

interface CharitySummary {
  id: string;
  title: string;
  address: string;
  providerId: string;
  latitude?: number | null;
  longitude?: number | null;
}

// Hayır noktasına bu yarıçap içindeki kullanıcılar bildirim alır.
// Şehir geneline değil, gerçekten yakındakilere gitmesi için kasıtlı olarak dar.
export const CHARITY_RADIUS_KM = 10;

const EARTH_RADIUS_KM = 6371;

// İki koordinat arası kuş uçuşu mesafe (km).
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Bildirim türüne göre başlık/metin ve Notification.type (String kolon, enum değil).
function buildContent(kind: CharityNotifyKind, activity: CharitySummary, distance?: number) {
  const yakinlik =
    distance !== undefined && distance >= 0
      ? distance < 1
        ? 'Hemen yanı başında'
        : `Yaklaşık ${distance.toFixed(1)} km uzaklıkta`
      : null;

  switch (kind) {
    case 'ENDING_SOON':
      return {
        type: 'CHARITY_ENDING_SOON',
        title: 'Hayır Dağıtımı Bitmek Üzere ⏳',
        message: `${activity.title} yakında sona eriyor — ${activity.address}`,
      };
    case 'ENDED':
      return {
        type: 'CHARITY_ENDED',
        title: 'Hayır Dağıtımı Sona Erdi',
        message: `${activity.title} tamamlandı. Katılan herkese teşekkürler.`,
      };
    case 'CREATED':
    default:
      return {
        type: 'CHARITY',
        title: 'Yakınında Hayır Dağıtımı! 📍',
        message: yakinlik
          ? `${yakinlik}: ${activity.title} — ${activity.address}`
          : `${activity.title} — ${activity.address}`,
      };
  }
}

/**
 * Hayır noktasına YAKIN kullanıcıları bulur.
 *
 * Hedefleme sırası:
 *  1. Koordinatı olan kullanıcılar -> gerçek mesafe (yarıçap içindekiler).
 *  2. Koordinatı olmayanlar -> sağlayıcı ile AYNI İLÇEDE ise dahil edilir.
 *
 * İl geneline bildirim GÖNDERİLMEZ; aksi halde Çiğli'deki bir etkinlik
 * Gaziemir'deki kullanıcıya da düşerdi.
 */
async function findNearbyUsers(activity: CharitySummary) {
  const provider = await prisma.user.findUnique({
    where: { id: activity.providerId },
    select: { cityId: true, countie: true },
  });

  const lat = activity.latitude;
  const lng = activity.longitude;
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';

  // Koordinat sorgusunu daraltmak için kaba sınır kutusu (haversine öncesi ön filtre).
  // 1 derece enlem ~111 km; boylamda enleme göre daralır.
  let boundingBox: any = {};
  if (hasCoords) {
    const latDelta = CHARITY_RADIUS_KM / 111;
    const lngDelta =
      CHARITY_RADIUS_KM / (111 * Math.max(Math.cos((lat! * Math.PI) / 180), 0.01));
    boundingBox = {
      latitude: { gte: lat! - latDelta, lte: lat! + latDelta },
      longitude: { gte: lng! - lngDelta, lte: lng! + lngDelta },
    };
  }

  const orConditions: any[] = [];
  if (hasCoords) orConditions.push(boundingBox);
  // Koordinatı olmayanlar için ilçe eşleşmesi (yalnızca ilçe biliniyorsa).
  if (provider?.countie) {
    orConditions.push({
      latitude: null,
      countie: provider.countie,
      ...(provider.cityId ? { cityId: provider.cityId } : {}),
    });
  }

  if (orConditions.length === 0) return [];

  const candidates = await prisma.user.findMany({
    where: {
      isActive: true,
      id: { not: activity.providerId },
      OR: orConditions,
    },
    select: { id: true, fcmToken: true, latitude: true, longitude: true },
    take: 5000,
  });

  // Sınır kutusu kare, yarıçap daire — köşeleri haversine ile ele.
  const result: Array<{ id: string; fcmToken: string | null; distance?: number }> = [];
  for (const u of candidates) {
    if (hasCoords && u.latitude != null && u.longitude != null) {
      const d = distanceKm(lat!, lng!, u.latitude, u.longitude);
      if (d <= CHARITY_RADIUS_KM) result.push({ id: u.id, fcmToken: u.fcmToken, distance: d });
    } else {
      // İlçe eşleşmesiyle gelenler (koordinatsız).
      result.push({ id: u.id, fcmToken: u.fcmToken });
    }
  }

  return result;
}

/**
 * Hayır aktivitesine yakın kullanıcılara bildirim gönderir.
 * Fire-and-forget: hata olursa çağıran akışı etkilemez.
 */
export async function notifyCityAboutCharity(
  activity: CharitySummary,
  kind: CharityNotifyKind = 'CREATED'
) {
  try {
    const users = await findNearbyUsers(activity);
    if (users.length === 0) {
      console.log(`[Charity] ${kind}: yarıçap içinde kullanıcı yok (${activity.id})`);
      return;
    }

    const { type, title, message } = buildContent(kind, activity);

    // Uygulama içi bildirim kaydı herkese yazılır — cihaz token'ı olmayan
    // kullanıcı da bildirimi uygulamanın bildirimler ekranında görür.
    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        title,
        message,
        type,
        data: {
          charityActivityId: activity.id,
          ...(activity.latitude != null ? { latitude: activity.latitude } : {}),
          ...(activity.longitude != null ? { longitude: activity.longitude } : {}),
        },
      })),
    });

    const tokens = users.map((u) => u.fcmToken).filter(Boolean) as string[];
    if (tokens.length > 0) {
      await sendNotificationToMultipleUsers(tokens, title, message, {
        type,
        charityActivityId: activity.id,
      });
    }

    console.log(
      `[Charity] ${kind}: ${users.length} kullanıcıya kaydedildi, ${tokens.length} cihaza gönderildi (${activity.id})`
    );
  } catch (error) {
    console.error(`[Charity] ${kind} bildirimi gönderilemedi:`, error);
  }
}
