import { Router, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { isProtectedTestPhone } from '../services/sms.service';

const router = Router();

// Get current user profile
router.get('/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
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
        _count: {
          select: {
            demands: true,
            offers: true,
            reviewsReceived: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Transform categories to array of objects
    const userData = {
      ...user,
      categories: user.categories.map(uc => uc.category),
      isAdmin: user.isAdmin,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    next(error);
  }
});

// Update current user profile
router.put(
  '/me',
  authenticate,
  [
    body('name').optional({ values: 'null' }).isString(),
    body('email').optional({ values: 'null' }).isEmail(),
    body('bio').optional({ values: 'null' }).isString(),
    body('location').optional({ values: 'null' }).isString(),
    body('profileImage').optional({ values: 'null' }).isString(),
    body('companyName').optional({ values: 'null' }).isString(),
    body('address').optional({ values: 'null' }).isString(),
    body('categories').optional({ values: 'null' }).isArray(),
    body('responseTime').optional({ values: 'null' }).isString(),
    body('fcmToken').optional({ values: 'null' }).isString(),
    body('userType').optional({ values: 'null' }).isIn(['PROVIDER', 'RECEIVER']).withMessage('Geçerli bir kullanıcı tipi giriniz (PROVIDER veya RECEIVER)'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const {
        name,
        email,
        bio,
        location,
        profileImage,
        companyName,
        address,
        categories,
        responseTime,
        fcmToken,
        userType,
      } = req.body;

      // Handle categories update
      if (categories !== undefined) {
        // Delete existing categories
        await prisma.userCategory.deleteMany({
          where: { userId: req.userId },
        });

        // Add new categories if provided
        if (Array.isArray(categories) && categories.length > 0) {
          // Filter out empty strings, null, and undefined values
          const validCategories = categories.filter(cat => {
            if (cat === null || cat === undefined) return false;
            if (typeof cat === 'string' && cat.trim() === '') return false;
            return true;
          });

          if (validCategories.length > 0) {
            // Find categories by ID or name (support both for backward compatibility)
            const categoryRecords = await prisma.category.findMany({
              where: {
                OR: [
                  { id: { in: validCategories } },
                  { name: { in: validCategories } },
                ],
                isActive: true,
              },
            });

            // Create UserCategory records
            if (categoryRecords.length > 0) {
              await prisma.userCategory.createMany({
                data: categoryRecords.map(cat => ({
                  userId: req.userId!,
                  categoryId: cat.id,
                })),
                skipDuplicates: true,
              });
            }
          }
        }
      }

      const updateData: any = {
        name,
        email,
        bio,
        location,
        profileImage,
        companyName,
        address,
        responseTime,
        fcmToken,
      };

      // Add userType if provided
      if (userType !== undefined) {
        updateData.userType = userType;
      }

      // Son bilinen konum — yakınlık bazlı hayır bildirimlerinin hedeflemesi
      // bu koordinata dayanır. Uygulama profil ve harita ekranlarından gönderir.
      const { latitude, longitude, cityId, countie } = req.body;
      if (latitude !== undefined && latitude !== null && latitude !== '') {
        const lat = parseFloat(String(latitude));
        if (!isNaN(lat) && lat >= -90 && lat <= 90) updateData.latitude = lat;
      }
      if (longitude !== undefined && longitude !== null && longitude !== '') {
        const lng = parseFloat(String(longitude));
        if (!isNaN(lng) && lng >= -180 && lng <= 180) updateData.longitude = lng;
      }
      if (cityId !== undefined) updateData.cityId = cityId || null;
      if (countie !== undefined) updateData.countie = countie || null;

      const user = await prisma.user.update({
        where: { id: req.userId },
        data: updateData,
        include: {
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
      });

      // Transform categories to array of objects
      const userData = {
        ...user,
        categories: user.categories.map(uc => uc.category),
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      res.json({
        success: true,
        message: 'Profil başarıyla güncellendi',
        data: userData,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Hesabı kalıcı olarak sil (App Store 5.1.1(v) gereği)
// İlişkili tüm kayıtlar (talep, teklif, işlem, bildirim, kategori, banka hesabı,
// inceleme vb.) şemadaki onDelete: Cascade kuralları ile otomatik silinir.
router.delete('/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, phoneNumber: true },
    });

    if (!user) {
      throw new AppError('Kullanıcı bulunamadı', 404);
    }

    // App Store inceleme demo hesapları korunur: gerçek kayıt silinmez,
    // böylece sonraki incelemelerde giriş yapılabilir. Akış (onay -> çıkış)
    // kullanıcı tarafında aynen çalışır.
    const isTestAccount = isProtectedTestPhone(user.phoneNumber || '');

    if (!isTestAccount) {
      await prisma.user.delete({ where: { id: user.id } });
    }

    res.json({
      success: true,
      message: 'Hesabınız kalıcı olarak silindi.',
    });
  } catch (error) {
    next(error);
  }
});

// Get user by ID
router.get('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
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
        _count: {
          select: {
            demands: true,
            offers: true,
            reviewsReceived: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Transform categories to array of IDs (can be parent or child categories)
    const userData = {
      id: user.id,
      phoneNumber: user.phoneNumber,
      name: user.name,
      email: user.email,
      userType: user.userType,
      isAdmin: user.isAdmin,
      isActive: user.isActive,
      profileImage: user.profileImage,
      bio: user.bio,
      location: user.location,
      rating: user.rating,
      ratingCount: user.ratingCount,
      companyName: user.companyName,
      address: user.address,
      responseTime: user.responseTime,
      memberSince: user.memberSince,
      completedJobs: user.completedJobs,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      categories: user.categories.map(uc => uc.category),
      _count: user._count,
    };

    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    next(error);
  }
});

// Get user reviews
router.get('/:id/reviews', async (req, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { reviewedUserId: req.params.id },
      include: {
        reviewer: {
          select: {
            id: true,
            name: true,
            profileImage: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    next(error);
  }
});

// Get all providers (public list)
router.get('/public/providers', async (req, res, next) => {
  try {
    const { categoryId, search, page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      userType: 'PROVIDER',
      isActive: true,
      isAdmin: false,
    };

    if (categoryId) {
      where.categories = {
        some: {
          categoryId: categoryId as string,
        },
      };
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { companyName: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [providers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          companyName: true,
          profileImage: true,
          rating: true,
          ratingCount: true,
          location: true,
          bio: true,
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
        orderBy: { rating: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.user.count({ where }),
    ]);

    // Transform categories
    const transformedProviders = providers.map(p => ({
      ...p,
      categories: p.categories.map(uc => uc.category),
    }));

    res.json({
      success: true,
      data: transformedProviders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

