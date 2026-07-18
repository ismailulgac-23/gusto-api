import prisma from '../lib/prisma';
import { sendNotificationToMultipleUsers } from './fcm.service';

export type CharityNotifyKind = 'CREATED' | 'ENDING_SOON' | 'ENDED';

interface CharitySummary {
  id: string;
  title: string;
  address: string;
  providerId: string;
}

// Bildirim türüne göre başlık/metin ve Notification.type (String kolon, enum değil).
function buildContent(kind: CharityNotifyKind, activity: CharitySummary) {
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
        message: `${activity.title} — ${activity.address}`,
      };
  }
}

// Hayır aktivitesinin bulunduğu şehirdeki kullanıcılara bildirim gönder.
// Fire-and-forget: hata olursa çağıran akışı etkilemez.
export async function notifyCityAboutCharity(
  activity: CharitySummary,
  kind: CharityNotifyKind = 'CREATED'
) {
  try {
    const provider = await prisma.user.findUnique({
      where: { id: activity.providerId },
      select: { cityId: true, companyName: true, name: true },
    });
    if (!provider?.cityId) return;

    const users = await prisma.user.findMany({
      where: {
        cityId: provider.cityId,
        isActive: true,
        id: { not: activity.providerId },
      },
      select: { id: true, fcmToken: true },
      take: 2000,
    });
    if (users.length === 0) return;

    const { type, title, message } = buildContent(kind, activity);

    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        title,
        message,
        type,
        data: { charityActivityId: activity.id },
      })),
    });

    const tokens = users.map((u) => u.fcmToken).filter(Boolean) as string[];
    if (tokens.length > 0) {
      // Firebase yapılandırılmamışsa servis kendi içinde no-op/hata döner.
      await sendNotificationToMultipleUsers(tokens, title, message, {
        type,
        charityActivityId: activity.id,
      });
    }
  } catch (error) {
    console.error(`[Charity] ${kind} bildirimi gönderilemedi:`, error);
  }
}
