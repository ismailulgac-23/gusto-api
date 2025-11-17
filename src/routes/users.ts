import { Router, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

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

    // Transform categories to array of IDs (can be parent or child categories)
    const userData = {
      ...user,
      categories: user.categories.map(uc => uc.category.id),
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
    body('name').optional().isString(),
    body('email').optional().isEmail(),
    body('bio').optional().isString(),
    body('location').optional().isString(),
    body('profileImage').optional().isString(),
    body('companyName').optional().isString(),
    body('address').optional().isString(),
    body('categories').optional().isArray(),
    body('responseTime').optional().isString(),
    body('fcmToken').optional().isString(),
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

      const user = await prisma.user.update({
        where: { id: req.userId },
        data: {
          name,
          email,
          bio,
          location,
          profileImage,
          companyName,
          address,
          responseTime,
          fcmToken,
        },
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

      // Transform categories to array of IDs (can be parent or child categories)
      const userData = {
        ...user,
        categories: user.categories.map(uc => uc.category.id),
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
      categories: user.categories.map(uc => uc.category.id),
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

export default router;

