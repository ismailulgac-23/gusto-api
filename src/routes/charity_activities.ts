import { Router, Response, NextFunction } from 'express';
import { body, validationResult, query } from 'express-validator';
import prisma from '../lib/prisma';
import { authenticate, authorizeProvider, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { sendNotificationToMultipleUsers } from '../services/fcm.service';

const router = Router();

// Yeni hayır aktivitesi açıldığında şehirdeki kullanıcılara bildirim gönder.
// Fire-and-forget: hata olursa aktivite oluşturmayı etkilemez.
async function notifyCityAboutCharity(activity: {
  id: string;
  title: string;
  address: string;
  providerId: string;
}) {
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

    const title = 'Yakınında Hayır Dağıtımı! 📍';
    const message = `${activity.title} — ${activity.address}`;

    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        title,
        message,
        type: 'CHARITY',
        data: { charityActivityId: activity.id },
      })),
    });

    const tokens = users.map((u) => u.fcmToken).filter(Boolean) as string[];
    if (tokens.length > 0) {
      // Firebase yapılandırılmamışsa servis kendi içinde no-op/hata döner.
      await sendNotificationToMultipleUsers(tokens, title, message, {
        type: 'CHARITY',
        charityActivityId: activity.id,
      });
    }
  } catch (error) {
    console.error('[Charity] Bildirim gönderilemedi:', error);
  }
}

// Haversine formülü ile mesafe hesaplama (km cinsinden)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Dünya yarıçapı (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Get all charity activities (Admin panel)
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const activities = await prisma.charityActivity.findMany({
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            profileImage: true,
            rating: true,
            companyName: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: activities,
    });
  } catch (error) {
    next(error);
  }
});

// Yakındaki hayır aktivitelerini getir (5KM radius)
router.get(
  '/nearby',
  authenticate,
  [
    query('latitude').isFloat().withMessage('Geçerli bir enlem giriniz'),
    query('longitude').isFloat().withMessage('Geçerli bir boylam giriniz'),
    query('radius').optional().isFloat({ min: 0.1, max: 50 }).withMessage('Yarıçap 0.1-50 km arasında olmalıdır'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      const radius = parseFloat(req.query.radius as string) || 5; // Varsayılan 5KM

      // Tüm aktiviteleri çek (daha sonra mesafe filtresi uygulanacak)
      const activities = await prisma.charityActivity.findMany({
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              companyName: true,
              profileImage: true,
              rating: true,
              ratingCount: true,
              phoneNumber: true,
              email: true,
              bio: true,
              address: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
            },
          },
        },
      });

      // Mesafe filtresi uygula
      const nearbyActivities = activities
        .map(activity => ({
          ...activity,
          distance: calculateDistance(latitude, longitude, activity.latitude, activity.longitude),
        }))
        .filter(activity => activity.distance <= radius)
        .sort((a, b) => a.distance - b.distance);

      res.json({
        success: true,
        data: nearbyActivities,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Hayır aktivitesi oluştur
router.post(
  '/',
  authenticate,
  authorizeProvider,
  [
    body('categoryId').isUUID().withMessage('Geçersiz kategori ID'),
    body('title').isString().isLength({ min: 3, max: 200 }).withMessage('Başlık 3-200 karakter arasında olmalıdır'),
    body('description').isString().isLength({ min: 10, max: 2000 }).withMessage('Açıklama 10-2000 karakter arasında olmalıdır'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Geçerli bir enlem giriniz'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Geçerli bir boylam giriniz'),
    body('address').isString().isLength({ min: 5, max: 500 }).withMessage('Adres 5-500 karakter arasında olmalıdır'),
    body('estimatedEndTime').optional().isISO8601().withMessage('Geçerli bir tarih formatı giriniz'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const { categoryId, title, description, latitude, longitude, address, estimatedEndTime } = req.body;

      // Kategori kontrolü
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
      });

      if (!category || !category.isActive) {
        throw new AppError('Kategori bulunamadı veya aktif değil', 404);
      }

      const activity = await prisma.charityActivity.create({
        data: {
          providerId: req.userId!,
          categoryId,
          title,
          description,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          address,
          estimatedEndTime: estimatedEndTime ? new Date(estimatedEndTime) : null,
        },
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              companyName: true,
              profileImage: true,
              rating: true,
              ratingCount: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
            },
          },
        },
      });

      // Şehirdeki kullanıcılara bildirim (async, yanıtı bekletmez)
      void notifyCityAboutCharity({
        id: activity.id,
        title: activity.title,
        address: activity.address,
        providerId: req.userId!,
      });

      res.json({
        success: true,
        message: 'Hayır aktivitesi başarıyla oluşturuldu',
        data: activity,
      });
    } catch (error) {
      next(error);
    }
  }
);

// CANLI hayır dağıtım noktaları — PUBLIC (web ana sayfa haritası için, auth yok).
// Aktif sayılma kuralı: bitiş zamanı gelmemiş VEYA (bitiş zamanı yoksa) son 12 saatte açılmış.
router.get('/live', async (_req, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const freshSince = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    const activities = await prisma.charityActivity.findMany({
      where: {
        OR: [
          { estimatedEndTime: { gte: now } },
          { estimatedEndTime: null, createdAt: { gte: freshSince } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        description: true,
        latitude: true,
        longitude: true,
        address: true,
        estimatedEndTime: true,
        createdAt: true,
        provider: {
          select: { name: true, companyName: true, city: { select: { name: true } } },
        },
        category: { select: { name: true, icon: true } },
      },
    });

    res.json({ success: true, data: activities });
  } catch (error) {
    next(error);
  }
});

// Hayır aktivitesi detayı
router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const activity = await prisma.charityActivity.findUnique({
      where: { id: req.params.id },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            companyName: true,
            profileImage: true,
            rating: true,
            ratingCount: true,
            phoneNumber: true,
            email: true,
            bio: true,
            address: true,
            location: true,
            completedJobs: true,
            categories: {
              include: {
                category: {
                  select: {
                    id: true,
                    name: true,
                    icon: true,
                  },
                },
              },
            },
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
      },
    });

    if (!activity) {
      throw new AppError('Hayır aktivitesi bulunamadı', 404);
    }

    res.json({
      success: true,
      data: activity,
    });
  } catch (error) {
    next(error);
  }
});

// Hayır aktivitesi güncelle
router.put(
  '/:id',
  authenticate,
  authorizeProvider,
  [
    body('title').optional().isString().isLength({ min: 3, max: 200 }),
    body('description').optional().isString().isLength({ min: 10, max: 2000 }),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('address').optional().isString().isLength({ min: 5, max: 500 }),
    body('estimatedEndTime').optional().isISO8601(),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const activity = await prisma.charityActivity.findUnique({
        where: { id: req.params.id },
      });

      if (!activity) {
        throw new AppError('Hayır aktivitesi bulunamadı', 404);
      }

      if (activity.providerId !== req.userId) {
        throw new AppError('Bu aktiviteyi güncelleme yetkiniz yok', 403);
      }

      const updateData: any = {};
      if (req.body.title) updateData.title = req.body.title;
      if (req.body.description) updateData.description = req.body.description;
      if (req.body.latitude) updateData.latitude = parseFloat(req.body.latitude);
      if (req.body.longitude) updateData.longitude = parseFloat(req.body.longitude);
      if (req.body.address) updateData.address = req.body.address;
      if (req.body.estimatedEndTime !== undefined) {
        updateData.estimatedEndTime = req.body.estimatedEndTime ? new Date(req.body.estimatedEndTime) : null;
      }

      const updatedActivity = await prisma.charityActivity.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              companyName: true,
              profileImage: true,
              rating: true,
              ratingCount: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
            },
          },
        },
      });

      res.json({
        success: true,
        message: 'Hayır aktivitesi başarıyla güncellendi',
        data: updatedActivity,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Hayır aktivitesi sil (Admin veya Provider)
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const activity = await prisma.charityActivity.findUnique({
      where: { id: req.params.id },
    });

    if (!activity) {
      throw new AppError('Hayır aktivitesi bulunamadı', 404);
    }

    // Admin can delete any activity, provider can only delete their own
    if (activity.providerId !== req.userId) {
      // Check if user is admin (you may need to add admin check here)
      // For now, allowing deletion for admin panel
    }

    await prisma.charityActivity.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      message: 'Hayır aktivitesi başarıyla silindi',
    });
  } catch (error) {
    next(error);
  }
});

export default router;

