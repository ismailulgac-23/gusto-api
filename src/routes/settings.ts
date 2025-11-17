import { Router, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// ==================== CITIES ====================

// Get all cities (Public - for registration)
router.get('/cities', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cities = await prisma.city.findMany({
      where: {
        isActive: true, // Sadece aktif şehirleri döndür
      },
      orderBy: {
        name: 'asc',
      },
      select: {
        id: true,
        name: true,
      },
    });

    res.json({
      success: true,
      data: cities,
    });
  } catch (error) {
    next(error);
  }
});

// Get all cities (Admin - includes inactive)
const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      throw new AppError('Authentication required', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      throw new AppError('Access denied. Admin role required.', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Get all cities (Admin)
router.get(
  '/admin/cities',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const cities = await prisma.city.findMany({
        orderBy: {
          name: 'asc',
        },
      });

      res.json({
        success: true,
        data: cities,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update city active status (Admin)
router.put(
  '/admin/cities/:id',
  authenticate,
  requireAdmin,
  [
    body('isActive').isBoolean().withMessage('isActive must be a boolean'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const { id } = req.params;
      const { isActive } = req.body;

      const city = await prisma.city.update({
        where: { id },
        data: { isActive },
      });

      res.json({
        success: true,
        data: city,
        message: 'Şehir durumu güncellendi',
      });
    } catch (error) {
      next(error);
    }
  }
);

// Bulk update cities (Admin) - Set active cities
router.put(
  '/admin/cities',
  authenticate,
  requireAdmin,
  [
    body('cityIds').isArray().withMessage('cityIds must be an array'),
    body('cityIds.*').isUUID().withMessage('Each cityId must be a valid UUID'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const { cityIds } = req.body;

      // Önce tüm şehirleri pasif yap
      await prisma.city.updateMany({
        data: { isActive: false },
      });

      // Seçilen şehirleri aktif yap
      if (cityIds.length > 0) {
        await prisma.city.updateMany({
          where: {
            id: {
              in: cityIds,
            },
          },
          data: { isActive: true },
        });
      }

      const cities = await prisma.city.findMany({
        orderBy: {
          name: 'asc',
        },
      });

      res.json({
        success: true,
        data: cities,
        message: 'Aktif şehirler güncellendi',
      });
    } catch (error) {
      next(error);
    }
  }
);

// Create city (Admin) - Türkiye şehirlerini eklemek için
router.post(
  '/admin/cities',
  authenticate,
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Şehir adı gereklidir'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const { name } = req.body;

      // Şehir zaten var mı kontrol et
      const existingCity = await prisma.city.findUnique({
        where: { name },
      });

      if (existingCity) {
        throw new AppError('Bu şehir zaten mevcut', 400);
      }

      const city = await prisma.city.create({
        data: {
          name,
          isActive: false, // Varsayılan olarak pasif
        },
      });

      res.json({
        success: true,
        data: city,
        message: 'Şehir eklendi',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

