import prisma from '../lib/prisma';
import { sendNotificationToMultipleUsers } from './fcm.service';

/**
 * Talep YAYINA ALINDIĞINDA (admin onayı sonrası veya otomatik onaylı ise
 * oluşturulduğunda), o kategoriye (üst kategoriler dahil) ve talebin
 * şehirlerine hizmet veren PROVIDER'lara push + uygulama içi bildirim gönderir.
 *
 * ÖNEMLİ: Onaylanmamış talep sağlayıcı listelerinde görünmez
 * (routes/demands.ts -> where.isApproved = true). Bu yüzden bildirim de
 * onaydan ÖNCE gönderilmemelidir; aksi halde sağlayıcı bildirimi görür ama
 * talebi hiçbir yerde bulamaz.
 *
 * Fire-and-forget: hata olursa çağıran akışı etkilemez.
 */
export async function notifyProvidersAboutDemand(demandId: string) {
  try {
    const demand = await prisma.demand.findUnique({
      where: { id: demandId },
      select: {
        id: true,
        title: true,
        userId: true,
        categoryId: true,
        isApproved: true,
        cities: { select: { cityId: true } },
        category: { select: { name: true } },
      },
    });
    if (!demand?.categoryId) return;

    // Güvenlik ağı: onaylanmamış talep için asla bildirim gönderme.
    if (!demand.isApproved) {
      console.log(`[Demand] ${demandId} onaylı değil, sağlayıcı bildirimi atlandı`);
      return;
    }

    // Kategori + üst kategoriler (ancestor zinciri)
    const categoryIds: string[] = [];
    let currentId: string | null = demand.categoryId;
    let guard = 0;
    while (currentId && guard < 20) {
      categoryIds.push(currentId);
      const cat: { parentId: string | null } | null = await prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      currentId = cat?.parentId || null;
      guard++;
    }

    const cityIds = demand.cities.map((c) => c.cityId);

    const providers = await prisma.user.findMany({
      where: {
        userType: 'PROVIDER',
        isActive: true,
        id: { not: demand.userId },
        categories: { some: { categoryId: { in: categoryIds } } },
        ...(cityIds.length > 0 ? { cityId: { in: cityIds } } : {}),
      },
      select: { id: true, fcmToken: true },
      take: 2000,
    });
    if (providers.length === 0) return;

    const title = 'Yeni Talep 📋';
    const message = `${demand.category?.name ? demand.category.name + ' — ' : ''}${demand.title}`;

    await prisma.notification.createMany({
      data: providers.map((p) => ({
        userId: p.id,
        title,
        message,
        type: 'NEW_DEMAND',
        data: { demandId: demand.id } as any,
      })),
    });

    const tokens = providers.map((p) => p.fcmToken).filter((t): t is string => !!t);
    if (tokens.length > 0) {
      await sendNotificationToMultipleUsers(tokens, title, message, {
        type: 'NEW_DEMAND',
        demandId: demand.id,
      });
    }

    console.log(
      `[Demand] ${demandId}: ${providers.length} sağlayıcıya bildirildi, ${tokens.length} cihaza gönderildi`
    );
  } catch (error) {
    console.error('[Demand] Sağlayıcı bildirimi gönderilemedi:', error);
  }
}
