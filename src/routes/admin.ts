import { Router, Response, NextFunction } from 'express';
import { body, query, validationResult } from 'express-validator';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validator';

const router = Router();

// Admin middleware - Check if user is admin
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

// ==================== CATEGORIES ====================

// Get all categories (Admin) - with pagination
router.get(
  '/categories',
  authenticate,
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('isActive').optional().isBoolean(),
    query('search').optional().isString(),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
      const search = req.query.search as string;

      const where: any = {};
      if (isActive !== undefined) {
        where.isActive = isActive;
      }
      if (search) {
        where.name = {
          contains: search,
          mode: 'insensitive',
        };
      }

      const [categories, total] = await Promise.all([
        prisma.category.findMany({
          where,
          skip,
          take: limit,
          include: {
            parent: {
              select: {
                id: true,
                name: true,
                icon: true,
              },
            },
            _count: {
              select: {
                children: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.category.count({ where }),
      ]);

      res.json({
        success: true,
        data: categories,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get single category (Admin)
router.get('/categories/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
        children: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!category) {
      throw new AppError('Kategori bulunamadı', 404);
    }

    res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    next(error);
  }
});

// Create category (Admin)
router.post(
  '/categories',
  authenticate,
  requireAdmin,
  [
    body('name').isString().isLength({ min: 1, max: 100 }).withMessage('Kategori adı 1-100 karakter arasında olmalıdır'),
    body('icon').optional().isString(),
    body('isActive').optional().isBoolean(),
    body('questions').optional(),
    body('parentId')
      .optional({ values: 'falsy' })
      .custom((value) => {
        if (!value || value === '' || value === null) {
          return true; // Boş değer geçerli
        }
        // UUID format kontrolü
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
          throw new Error('Geçersiz üst kategori ID');
        }
        return true;
      }),
    body('commissionRate').optional().isFloat({ min: 0 }).withMessage('Komisyon oranı 0 veya daha büyük bir sayı olmalıdır'),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, icon, isActive = true, questions, parentId, commissionRate } = req.body;

      const existingCategory = await prisma.category.findUnique({
        where: { name },
      });

      if (existingCategory) {
        throw new AppError('Bu kategori adı zaten kullanılıyor', 400);
      }

      // Validate parent if provided
      if (parentId) {
        const parent = await prisma.category.findUnique({
          where: { id: parentId },
        });
        if (!parent) {
          throw new AppError('Üst kategori bulunamadı', 404);
        }
      }

      const category = await prisma.category.create({
        data: {
          name,
          icon: icon || null,
          isActive,
          questions: questions || null,
          parentId: parentId || null,
          commissionRate: commissionRate || null,
        } as any,
      });

      res.status(201).json({
        success: true,
        message: 'Kategori başarıyla oluşturuldu',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update category (Admin)
router.patch(
  '/categories/:id',
  authenticate,
  requireAdmin,
  [
    body('name').optional().isString().isLength({ min: 1, max: 100 }),
    body('icon').optional().isString(),
    body('isActive').optional().isBoolean(),
    body('questions').optional(),
    body('parentId')
      .optional({ values: 'falsy' })
      .custom((value) => {
        if (!value || value === '' || value === null) {
          return true; // Boş değer geçerli
        }
        // UUID format kontrolü
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
          throw new Error('Geçersiz üst kategori ID');
        }
        return true;
      }),
    body('commissionRate').optional().isFloat({ min: 0 }).withMessage('Komisyon oranı 0 veya daha büyük bir sayı olmalıdır'),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, icon, isActive, questions, parentId, commissionRate } = req.body;

      const category = await prisma.category.findUnique({
        where: { id: req.params.id },
      });

      if (!category) {
        throw new AppError('Kategori bulunamadı', 404);
      }

      if (name && name !== category.name) {
        const existingCategory = await prisma.category.findUnique({
          where: { name },
        });

        if (existingCategory) {
          throw new AppError('Bu kategori adı zaten kullanılıyor', 400);
        }
      }

      // Validate parent if provided
      if (parentId !== undefined) {
        if (parentId === category.id) {
          throw new AppError('Kategori kendi alt kategorisi olamaz', 400);
        }
        if (parentId) {
          const parent = await prisma.category.findUnique({
            where: { id: parentId },
          });
          if (!parent) {
            throw new AppError('Üst kategori bulunamadı', 404);
          }
          // Check for circular reference
          let currentParent = parent;
          while (currentParent.parentId) {
            if (currentParent.parentId === category.id) {
              throw new AppError('Döngüsel referans oluşturamazsınız', 400);
            }
            currentParent = await prisma.category.findUnique({
              where: { id: currentParent.parentId },
            }) as any;
            if (!currentParent) break;
          }
        }
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (icon !== undefined) updateData.icon = icon;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (questions !== undefined) updateData.questions = questions;
      if (parentId !== undefined) updateData.parentId = parentId || null;
      if (commissionRate !== undefined) updateData.commissionRate = commissionRate || null;

      const updatedCategory = await prisma.category.update({
        where: { id: req.params.id },
        data: updateData,
      });

      res.json({
        success: true,
        message: 'Kategori başarıyla güncellendi',
        data: updatedCategory,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete category (Admin)
router.delete('/categories/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: {
            demands: true,
            users: true,
            charityActivities: true,
          },
        },
      },
    });

    if (!category) {
      throw new AppError('Kategori bulunamadı', 404);
    }

    const childrenCount = await prisma.category.count({
      where: { parentId: category.id },
    });

    if (category._count.demands > 0 || category._count.users > 0 || category._count.charityActivities > 0 || childrenCount > 0) {
      throw new AppError('Bu kategori kullanıldığı veya alt kategorileri olduğu için silinemez', 400);
    }

    await prisma.category.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      message: 'Kategori başarıyla silindi',
    });
  } catch (error) {
    next(error);
  }
});

// ==================== DEMANDS ====================

// Get all demands (Admin) - with pagination and filters
router.get(
  '/demands',
  authenticate,
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['ACTIVE', 'CLOSED', 'COMPLETED', 'CANCELLED']),
    query('categoryId').optional().isUUID(),
    query('userId').optional().isUUID(),
    query('isUrgent').optional().isBoolean(),
    query('isApproved').optional().isBoolean(),
    query('search').optional().isString(),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      const { status, categoryId, userId, isUrgent, isApproved, search } = req.query;

      const where: any = {};
      if (status) where.status = status;
      if (categoryId) where.categoryId = categoryId as string;
      if (userId) where.userId = userId as string;
      if (isUrgent !== undefined) where.isUrgent = isUrgent === 'true';
      if (isApproved !== undefined) where.isApproved = isApproved === 'true';
      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const [demands, total] = await Promise.all([
        prisma.demand.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                profileImage: true,
                rating: true,
              },
            },
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
                parent: {
                  select: {
                    id: true,
                    name: true,
                    icon: true,
                  },
                },
              },
            },
            cities: {
              include: {
                city: {
                  select: {
                    id: true,
                    name: true,
                    isActive: true,
                  },
                },
              },
            },
            _count: {
              select: {
                offers: true,
              },
            },
          },
          orderBy: [
            { isUrgent: 'desc' },
            { createdAt: 'desc' },
          ],
          skip,
          take: limit,
        }),
        prisma.demand.count({ where }),
      ]);

      res.json({
        success: true,
        data: demands,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get single demand (Admin)
router.get('/demands/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const demand = await prisma.demand.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            email: true,
            profileImage: true,
            rating: true,
            location: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
            questions: true,
          },
        },
        cities: {
          include: {
            city: {
              select: {
                id: true,
                name: true,
                isActive: true,
              },
            },
          },
        },
        offers: {
          include: {
            provider: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                profileImage: true,
                rating: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            offers: true,
          },
        },
      },
    });

    if (!demand) {
      throw new AppError('Talep bulunamadı', 404);
    }

    // Teklifler artık direkt onaylanıyor, bu hesaplamalar artık gerekli değil
    // const approvedOffersCount = demand.offers.filter(offer => offer.isApproved === true).length;
    // const pendingOffersCount = demand.offers.filter(offer => offer.isApproved === false).length;

    res.json({
      success: true,
      data: demand,
    });
  } catch (error) {
    next(error);
  }
});

// Create demand (Admin)
router.post(
  '/demands',
  authenticate,
  requireAdmin,
  [
    body('userId').isUUID().withMessage('Geçersiz kullanıcı ID'),
    body('title').isString().isLength({ min: 3, max: 200 }).withMessage('Başlık 3-200 karakter arasında olmalıdır'),
    body('description').isString().isLength({ min: 10 }).withMessage('Açıklama en az 10 karakter olmalıdır'),
    body('categoryId').isUUID().withMessage('Geçersiz kategori ID'),
    body('status').optional().isIn(['ACTIVE', 'CLOSED', 'COMPLETED', 'CANCELLED']),
    body('isUrgent').optional().isBoolean(),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        userId,
        title,
        description,
        categoryId,
        status = 'ACTIVE',
        location,
        latitude,
        longitude,
        images = [],
        peopleCount,
        eventDate,
        eventTime,
        isUrgent = false,
        deadline,
        address,
        questionResponses,
      } = req.body;

      // Validate user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new AppError('Kullanıcı bulunamadı', 404);
      }

      // Validate category exists
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
      });

      if (!category) {
        throw new AppError('Kategori bulunamadı', 404);
      }

      const demand = await prisma.demand.create({
        data: {
          userId,
          title,
          description,
          categoryId,
          status,
          location: location || null,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          images: Array.isArray(images) ? images : [],
          peopleCount: peopleCount ? parseInt(peopleCount) : null,
          eventDate: eventDate ? new Date(eventDate) : null,
          eventTime: eventTime || null,
          isUrgent,
          deadline: deadline || null,
          address: address || null,
          questionResponses: questionResponses || null,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
              profileImage: true,
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

      res.status(201).json({
        success: true,
        message: 'Talep başarıyla oluşturuldu',
        data: demand,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update demand (Admin)
router.patch(
  '/demands/:id',
  authenticate,
  requireAdmin,
  [
    body('title').optional().isString().isLength({ min: 3, max: 200 }),
    body('description').optional().isString().isLength({ min: 10 }),
    body('status').optional().isIn(['ACTIVE', 'CLOSED', 'COMPLETED', 'CANCELLED']),
    body('isUrgent').optional().isBoolean(),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const demand = await prisma.demand.findUnique({
        where: { id: req.params.id },
      });

      if (!demand) {
        throw new AppError('Talep bulunamadı', 404);
      }

      const updateData: any = {};
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.status !== undefined) updateData.status = req.body.status;
      if (req.body.categoryId !== undefined) updateData.categoryId = req.body.categoryId;
      if (req.body.userId !== undefined) updateData.userId = req.body.userId;
      if (req.body.location !== undefined) updateData.location = req.body.location;
      if (req.body.latitude !== undefined) updateData.latitude = req.body.latitude ? parseFloat(req.body.latitude) : null;
      if (req.body.longitude !== undefined) updateData.longitude = req.body.longitude ? parseFloat(req.body.longitude) : null;
      if (req.body.images !== undefined) updateData.images = Array.isArray(req.body.images) ? req.body.images : [];
      if (req.body.peopleCount !== undefined) updateData.peopleCount = req.body.peopleCount ? parseInt(req.body.peopleCount) : null;
      if (req.body.eventDate !== undefined) updateData.eventDate = req.body.eventDate ? new Date(req.body.eventDate) : null;
      if (req.body.eventTime !== undefined) updateData.eventTime = req.body.eventTime || null;
      if (req.body.isUrgent !== undefined) updateData.isUrgent = req.body.isUrgent;
      if (req.body.deadline !== undefined) updateData.deadline = req.body.deadline || null;
      if (req.body.address !== undefined) updateData.address = req.body.address || null;
      if (req.body.questionResponses !== undefined) updateData.questionResponses = req.body.questionResponses || null;

      const updatedDemand = await prisma.demand.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
              profileImage: true,
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
        message: 'Talep başarıyla güncellendi',
        data: updatedDemand,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete demand (Admin)
router.delete('/demands/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const demand = await prisma.demand.findUnique({
      where: { id: req.params.id },
    });

    if (!demand) {
      throw new AppError('Talep bulunamadı', 404);
    }

    await prisma.demand.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      message: 'Talep başarıyla silindi',
    });
  } catch (error) {
    next(error);
  }
});

// Approve/Reject demand (Admin)
router.patch(
  '/demands/:id/approval',
  authenticate,
  requireAdmin,
  [
    body('isApproved').isBoolean().withMessage('isApproved boolean olmalıdır'),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const demand = await prisma.demand.findUnique({
        where: { id: req.params.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              fcmToken: true,
            },
          },
        },
      });

      if (!demand) {
        throw new AppError('Talep bulunamadı', 404);
      }

      const { isApproved } = req.body;

      const updatedDemand = await prisma.demand.update({
        where: { id: req.params.id },
        data: { isApproved },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
              profileImage: true,
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

      // Onaylandığında veya reddedildiğinde kullanıcıya bildirim gönder
      await prisma.notification.create({
        data: {
          userId: demand.userId,
          title: isApproved ? 'Talep Onaylandı' : 'Talep Reddedildi',
          message: isApproved 
            ? `"${demand.title}" başlıklı talebiniz onaylandı ve artık sağlayıcılar tarafından görülebilir.`
            : `"${demand.title}" başlıklı talebiniz reddedildi.`,
          type: isApproved ? 'DEMAND_APPROVED' : 'DEMAND_REJECTED',
          data: {
            demandId: demand.id,
            isApproved,
          },
        },
      });

      res.json({
        success: true,
        message: isApproved ? 'Talep onaylandı' : 'Talep reddedildi',
        data: updatedDemand,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get pending demands count (Admin) - for sidebar badge
router.get('/demands/pending/count', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.demand.count({
      where: { isApproved: false },
    });

    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    next(error);
  }
});

// Get pending demands (Admin) - Bekleyen talepler
router.get(
  '/demands/pending',
  authenticate,
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const where: any = {
        isApproved: false, // Sadece onay bekleyen talepler
      };

      const [demands, total] = await Promise.all([
        prisma.demand.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                profileImage: true,
                rating: true,
              },
            },
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
              },
            },
            _count: {
              select: {
                offers: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.demand.count({ where }),
      ]);

      res.json({
        success: true,
        data: demands,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== OFFERS ====================

// Teklif onay mekanizması kaldırıldı - teklifler direkt onaylanıyor
// Get pending offers count ve Get pending offers endpoint'leri artık kullanılmıyor

// Get all offers (Admin) - with pagination and filters
router.get(
  '/offers',
  authenticate,
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED']),
    query('demandId').optional().isUUID(),
    query('providerId').optional().isUUID(),
    // isApproved artık kullanılmıyor - teklifler direkt onaylanıyor
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      const { status, demandId, providerId } = req.query;

      const where: any = {};
      if (status) where.status = status;
      if (demandId) where.demandId = demandId as string;
      if (providerId) where.providerId = providerId as string;
      // isApproved artık kullanılmıyor - teklifler direkt onaylanıyor

      const [offers, total] = await Promise.all([
        prisma.offer.findMany({
          where,
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
            demand: {
              select: {
                id: true,
                title: true,
                status: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.offer.count({ where }),
      ]);

      res.json({
        success: true,
        data: offers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get single offer (Admin)
router.get('/offers/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            profileImage: true,
            rating: true,
            email: true,
            address: true,
            bio: true,
            location: true,
            ratingCount: true,
            companyName: true,
          },
        },
        demand: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
                parent: {
                  select: {
                    id: true,
                    name: true,
                    icon: true,
                  },
                },
              },
            },
            user: {
              select: {
                id: true,
                name: true,
                profileImage: true,
              },
            },
          },
        },
      },
    });

    if (!offer) {
      throw new AppError('Teklif bulunamadı', 404);
    }

    res.json({
      success: true,
      data: offer,
    });
  } catch (error) {
    next(error);
  }
});

// Create offer (Admin)
router.post(
  '/offers',
  authenticate,
  requireAdmin,
  [
    body('demandId').isUUID().withMessage('Geçersiz talep ID'),
    body('providerId').isUUID().withMessage('Geçersiz sağlayıcı ID'),
    body('price').isFloat({ min: 0 }).withMessage('Geçerli bir fiyat giriniz'),
    body('estimatedTime').isString().withMessage('Tahmini süre zorunludur'),
    body('status').optional().isIn(['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED']),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { demandId, providerId, message, price, estimatedTime, status = 'PENDING' } = req.body;

      // Validate demand exists
      const demand = await prisma.demand.findUnique({
        where: { id: demandId },
      });

      if (!demand) {
        throw new AppError('Talep bulunamadı', 404);
      }

      // Validate provider exists
      const provider = await prisma.user.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        throw new AppError('Sağlayıcı bulunamadı', 404);
      }

      const offer = await prisma.offer.create({
        data: {
          demandId,
          providerId,
          message: message || null,
          price: parseFloat(price),
          estimatedTime,
          status,
          isApproved: true, // Teklifler direkt onaylanıyor
        },
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
              profileImage: true,
              rating: true,
            },
          },
          demand: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      res.status(201).json({
        success: true,
        message: 'Teklif başarıyla oluşturuldu',
        data: offer,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Teklif onay mekanizması kaldırıldı - teklifler direkt onaylanıyor
// Approve/Reject offer endpoint'i artık kullanılmıyor

// Update offer (Admin)
router.patch(
  '/offers/:id',
  authenticate,
  requireAdmin,
  [
    body('message').optional().isString().isLength({ max: 1000 }),
    body('price').optional().isFloat({ min: 0 }),
    body('estimatedTime').optional().isString(),
    body('status').optional().isIn(['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED']),
    // isApproved artık kullanılmıyor - teklifler direkt onaylanıyor
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const offer = await prisma.offer.findUnique({
        where: { id: req.params.id },
      });

      if (!offer) {
        throw new AppError('Teklif bulunamadı', 404);
      }

      const updateData: any = {};
      if (req.body.message !== undefined) updateData.message = req.body.message;
      if (req.body.price !== undefined) updateData.price = parseFloat(req.body.price);
      if (req.body.estimatedTime !== undefined) updateData.estimatedTime = req.body.estimatedTime;
      if (req.body.status !== undefined) updateData.status = req.body.status;
      // isApproved artık kullanılmıyor - teklifler direkt onaylanıyor

      const updatedOffer = await prisma.offer.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              profileImage: true,
              rating: true,
            },
          },
          demand: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      res.json({
        success: true,
        message: 'Teklif başarıyla güncellendi',
        data: updatedOffer,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete offer (Admin)
router.delete('/offers/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
    });

    if (!offer) {
      throw new AppError('Teklif bulunamadı', 404);
    }

    await prisma.offer.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      message: 'Teklif başarıyla silindi',
    });
  } catch (error) {
    next(error);
  }
});

// ==================== REVIEWS ====================

// Get all reviews (Admin) - with pagination
router.get(
  '/reviews',
  authenticate,
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('reviewedUserId').optional().isUUID(),
    query('reviewerId').optional().isUUID(),
    query('rating').optional().isInt({ min: 1, max: 5 }),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      const { reviewedUserId, reviewerId, rating } = req.query;

      const where: any = {};
      if (reviewedUserId) where.reviewedUserId = reviewedUserId as string;
      if (reviewerId) where.reviewerId = reviewerId as string;
      if (rating) where.rating = parseInt(rating as string);

      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where,
          include: {
            reviewer: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                profileImage: true,
              },
            },
            reviewedUser: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                profileImage: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.review.count({ where }),
      ]);

      res.json({
        success: true,
        data: reviews,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete review (Admin)
router.delete('/reviews/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const review = await prisma.review.findUnique({
      where: { id: req.params.id },
    });

    if (!review) {
      throw new AppError('Değerlendirme bulunamadı', 404);
    }

    await prisma.review.delete({
      where: { id: req.params.id },
    });

    // Update user's rating
    const reviews = await prisma.review.findMany({
      where: { reviewedUserId: review.reviewedUserId },
    });

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    await prisma.user.update({
      where: { id: review.reviewedUserId },
      data: {
        rating: avgRating,
        ratingCount: reviews.length,
      },
    });

    res.json({
      success: true,
      message: 'Değerlendirme başarıyla silindi',
    });
  } catch (error) {
    next(error);
  }
});

// ==================== CHARITY ACTIVITIES ====================

// Get all charity activities (Admin) - with pagination and filters
router.get(
  '/charity-activities',
  authenticate,
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('categoryId').optional().isUUID(),
    query('providerId').optional().isUUID(),
    query('search').optional().isString(),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      const { categoryId, providerId, search } = req.query;

      const where: any = {};
      if (categoryId) where.categoryId = categoryId as string;
      if (providerId) where.providerId = providerId as string;
      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const [activities, total] = await Promise.all([
        prisma.charityActivity.findMany({
          where,
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
                parent: {
                  select: {
                    id: true,
                    name: true,
                    icon: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.charityActivity.count({ where }),
      ]);

      res.json({
        success: true,
        data: activities,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get single charity activity (Admin)
router.get('/charity-activities/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
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
                    parent: {
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

// Create charity activity (Admin)
router.post(
  '/charity-activities',
  authenticate,
  requireAdmin,
  [
    body('providerId').isUUID().withMessage('Geçersiz sağlayıcı ID'),
    body('categoryId').isUUID().withMessage('Geçersiz kategori ID'),
    body('title').isString().isLength({ min: 3, max: 200 }).withMessage('Başlık 3-200 karakter arasında olmalıdır'),
    body('description').isString().isLength({ min: 10, max: 2000 }).withMessage('Açıklama 10-2000 karakter arasında olmalıdır'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Geçerli bir enlem giriniz'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Geçerli bir boylam giriniz'),
    body('address').isString().isLength({ min: 5, max: 500 }).withMessage('Adres 5-500 karakter arasında olmalıdır'),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { providerId, categoryId, title, description, latitude, longitude, address, estimatedEndTime } = req.body;

      // Validate provider exists
      const provider = await prisma.user.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        throw new AppError('Sağlayıcı bulunamadı', 404);
      }

      // Validate category exists
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
      });

      if (!category || !category.isActive) {
        throw new AppError('Kategori bulunamadı veya aktif değil', 404);
      }

      const activity = await prisma.charityActivity.create({
        data: {
          providerId,
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

      res.status(201).json({
        success: true,
        message: 'Hayır aktivitesi başarıyla oluşturuldu',
        data: activity,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update charity activity (Admin)
router.put(
  '/charity-activities/:id',
  authenticate,
  requireAdmin,
  [
    body('title').optional().isString().isLength({ min: 3, max: 200 }),
    body('description').optional().isString().isLength({ min: 10, max: 2000 }),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('address').optional().isString().isLength({ min: 5, max: 500 }),
    body('estimatedEndTime').optional().isISO8601(),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const activity = await prisma.charityActivity.findUnique({
        where: { id: req.params.id },
      });

      if (!activity) {
        throw new AppError('Hayır aktivitesi bulunamadı', 404);
      }

      const updateData: any = {};
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.latitude !== undefined) updateData.latitude = parseFloat(req.body.latitude);
      if (req.body.longitude !== undefined) updateData.longitude = parseFloat(req.body.longitude);
      if (req.body.address !== undefined) updateData.address = req.body.address;
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

// Delete charity activity (Admin)
router.delete('/charity-activities/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const activity = await prisma.charityActivity.findUnique({
      where: { id: req.params.id },
    });

    if (!activity) {
      throw new AppError('Hayır aktivitesi bulunamadı', 404);
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

// ==================== USERS (Admin) ====================

// Get all users (Admin) - with pagination and filters
router.get(
  '/users',
  authenticate,
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('userType').optional().isIn(['PROVIDER', 'RECEIVER']),
    query('isActive').optional().isBoolean(),
    query('isAdmin').optional().isBoolean(),
    query('search').optional().isString(),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      const { userType, isActive, isAdmin, search } = req.query;

      const where: any = {};
      if (userType) where.userType = userType;
      if (isActive !== undefined) where.isActive = isActive === 'true';
      if (isAdmin !== undefined) where.isAdmin = isAdmin === 'true';
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
          { phoneNumber: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          include: {
            categories: {
              include: {
                category: {
                  select: {
                    id: true,
                    name: true,
                    icon: true,
                    parent: {
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
            _count: {
              select: {
                demands: true,
                offers: true,
                reviewsReceived: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.user.count({ where }),
      ]);

      res.json({
        success: true,
        data: users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get single user (Admin)
router.get('/users/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
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
                parent: {
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
      throw new AppError('Kullanıcı bulunamadı', 404);
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// Update user (Admin)
router.patch(
  '/users/:id',
  authenticate,
  requireAdmin,
  [
    body('name').optional().isString(),
    body('email').optional().isEmail(),
    body('phoneNumber').optional().isMobilePhone('any'),
    body('userType').optional().isIn(['PROVIDER', 'RECEIVER']),
    body('bio').optional().isString(),
    body('location').optional().isString(),
    body('profileImage').optional().isString(),
    body('companyName').optional().isString(),
    body('address').optional().isString(),
    body('responseTime').optional().isString(),
    body('isActive').optional().isBoolean(),
    body('isAdmin').optional().isBoolean(),
    body('password').optional().isLength({ min: 6 }),
    body('categories').optional().isArray(),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
      });

      if (!user) {
        throw new AppError('Kullanıcı bulunamadı', 404);
      }

      const {
        name,
        email,
        phoneNumber,
        userType,
        bio,
        location,
        profileImage,
        companyName,
        address,
        responseTime,
        isActive,
        isAdmin,
        password,
        categories,
      } = req.body;

      // Hash password if provided
      let hashedPassword = undefined;
      if (password) {
        const bcrypt = (await import('bcrypt')).default;
        hashedPassword = await bcrypt.hash(password, 10);
      }

      // Handle categories update
      if (categories !== undefined) {
        // Delete existing categories
        await prisma.userCategory.deleteMany({
          where: { userId: req.params.id },
        });

        // Add new categories if provided and not empty
        if (Array.isArray(categories) && categories.length > 0) {
          // Filter out empty strings, null, and undefined values
          const validCategories = categories.filter(cat => {
            if (cat === null || cat === undefined) return false;
            if (typeof cat === 'string' && cat.trim() === '') return false;
            return true;
          });

          if (validCategories.length > 0) {
            // Extract IDs or names from categories
            const categoryIds: string[] = [];
            const categoryNames: string[] = [];

            validCategories.forEach(cat => {
              if (typeof cat === 'string') {
                // Check if it's a UUID or a name
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (uuidRegex.test(cat.trim())) {
                  categoryIds.push(cat.trim());
                } else if (cat.trim().length > 0) {
                  categoryNames.push(cat.trim());
                }
              } else if (cat && typeof cat === 'object' && 'id' in cat && cat.id) {
                categoryIds.push(String(cat.id));
              }
            });

            // Only query if we have valid IDs or names
            if (categoryIds.length > 0 || categoryNames.length > 0) {
              // Build where clause
              const whereConditions: any[] = [];

              if (categoryIds.length > 0) {
                whereConditions.push({ id: { in: categoryIds } });
              }
              if (categoryNames.length > 0) {
                whereConditions.push({ name: { in: categoryNames } });
              }

              // Find categories by ID or name
              const categoryRecords = await prisma.category.findMany({
                where: {
                  OR: whereConditions,
                  isActive: true,
                },
              });

              // Create UserCategory records
              if (categoryRecords.length > 0) {
                await prisma.userCategory.createMany({
                  data: categoryRecords.map(cat => ({
                    userId: req.params.id,
                    categoryId: cat.id,
                  })),
                  skipDuplicates: true,
                });
              }
            }
          }
        }
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
      if (userType !== undefined) updateData.userType = userType;
      if (bio !== undefined) updateData.bio = bio;
      if (location !== undefined) updateData.location = location;
      if (profileImage !== undefined) updateData.profileImage = profileImage;
      if (companyName !== undefined) updateData.companyName = companyName;
      if (address !== undefined) updateData.address = address;
      if (responseTime !== undefined) updateData.responseTime = responseTime;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (isAdmin !== undefined) updateData.isAdmin = isAdmin;
      if (hashedPassword !== undefined) updateData.password = hashedPassword;

      const updatedUser = await prisma.user.update({
        where: { id: req.params.id },
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
          _count: {
            select: {
              demands: true,
              offers: true,
              reviewsReceived: true,
            },
          },
        },
      });

      res.json({
        success: true,
        message: 'Kullanıcı başarıyla güncellendi',
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete user (Admin)
router.delete('/users/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
    });

    if (!user) {
      throw new AppError('Kullanıcı bulunamadı', 404);
    }

    await prisma.user.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      message: 'Kullanıcı başarıyla silindi',
    });
  } catch (error) {
    next(error);
  }
});

// ==================== STATISTICS ====================

// Get dashboard statistics (Admin)
router.get('/statistics', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Users statistics
    const [
      totalUsers,
      activeUsers,
      totalProviders,
      activeProviders,
      totalReceivers,
      activeReceivers,
      totalAdmins,
      activeAdmins,
      newUsersToday,
      newUsersThisMonth,
      newUsersLastMonth,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { userType: 'PROVIDER' } }),
      prisma.user.count({ where: { userType: 'PROVIDER', isActive: true } }),
      prisma.user.count({ where: { userType: 'RECEIVER' } }),
      prisma.user.count({ where: { userType: 'RECEIVER', isActive: true } }),
      prisma.user.count({ where: { isAdmin: true } }),
      prisma.user.count({ where: { isAdmin: true, isActive: true } }),
      prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.user.count({ where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } } }),
    ]);

    // Demands statistics
    const [
      totalDemands,
      activeDemands,
      closedDemands,
      completedDemands,
      cancelledDemands,
      urgentDemands,
      newDemandsToday,
      newDemandsThisMonth,
    ] = await Promise.all([
      prisma.demand.count(),
      prisma.demand.count({ where: { status: 'ACTIVE' } }),
      prisma.demand.count({ where: { status: 'CLOSED' } }),
      prisma.demand.count({ where: { status: 'COMPLETED' } }),
      prisma.demand.count({ where: { status: 'CANCELLED' } }),
      prisma.demand.count({ where: { isUrgent: true, status: 'ACTIVE' } }),
      prisma.demand.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.demand.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    // Offers statistics
    const [
      totalOffers,
      pendingOffers,
      acceptedOffers,
      rejectedOffers,
      completedOffers,
      newOffersToday,
      newOffersThisMonth,
    ] = await Promise.all([
      prisma.offer.count(),
      prisma.offer.count({ where: { status: 'PENDING' } }),
      prisma.offer.count({ where: { status: 'ACCEPTED' } }),
      prisma.offer.count({ where: { status: 'REJECTED' } }),
      prisma.offer.count({ where: { status: 'COMPLETED' } }),
      prisma.offer.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.offer.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    // Categories statistics
    const [
      totalCategories,
      activeCategories,
    ] = await Promise.all([
      prisma.category.count(),
      prisma.category.count({ where: { isActive: true } }),
    ]);

    // Reviews statistics
    const [
      totalReviews,
      averageRating,
      reviewsThisMonth,
    ] = await Promise.all([
      prisma.review.count(),
      prisma.review.aggregate({
        _avg: { rating: true },
      }),
      prisma.review.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    // Charity Activities statistics
    const [
      totalCharityActivities,
      activeCharityActivities,
      newCharityActivitiesToday,
      newCharityActivitiesThisMonth,
    ] = await Promise.all([
      prisma.charityActivity.count(),
      prisma.charityActivity.count({
        where: {
          OR: [
            { estimatedEndTime: { gte: now } },
            { estimatedEndTime: null },
          ],
        },
      }),
      prisma.charityActivity.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.charityActivity.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    // Notifications statistics
    const [
      totalNotifications,
      unreadNotifications,
    ] = await Promise.all([
      prisma.notification.count(),
      prisma.notification.count({ where: { isRead: false } }),
    ]);

    // Calculate total price from accepted offers
    const acceptedOffersWithPrice = await prisma.offer.findMany({
      where: { status: 'ACCEPTED' },
      select: { price: true },
    });
    const totalAcceptedPrice = acceptedOffersWithPrice.reduce((sum, offer) => sum + (offer.price || 0), 0);

    // Calculate total price from completed offers
    const allCompletedOffers = await prisma.offer.findMany({
      where: { status: 'COMPLETED' },
      select: { price: true },
    });
    const totalCompletedPrice = allCompletedOffers.reduce((sum, offer) => sum + (offer.price || 0), 0);

    // User growth percentage
    const userGrowthPercentage = newUsersLastMonth > 0
      ? ((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) * 100
      : newUsersThisMonth > 0 ? 100 : 0;

    // Demand growth percentage
    const lastMonthDemands = await prisma.demand.count({
      where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } }
    });
    const demandGrowthPercentage = lastMonthDemands > 0
      ? ((newDemandsThisMonth - lastMonthDemands) / lastMonthDemands) * 100
      : newDemandsThisMonth > 0 ? 100 : 0;

    // Get last 10 users
    const lastTenUsers = await prisma.user.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        userType: true,
        profileImage: true,
        isActive: true,
        isAdmin: true,
        createdAt: true,
      },
    });

    // Get monthly transactions (last 12 months)
    const monthlyTransactions = [];
    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

    // Get start date for last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    // Get all completed offers from last 12 months for monthly chart
    const completedOffersForChart = await prisma.offer.findMany({
      where: {
        status: 'COMPLETED',
        updatedAt: {
          gte: twelveMonthsAgo,
        },
      },
      select: {
        price: true,
        updatedAt: true,
      },
    });

    // Group by month
    const monthlyData: { [key: string]: number } = {};

    // Initialize all 12 months with 0
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[monthKey] = 0;
    }

    // Sum amounts by month
    completedOffersForChart.forEach((offer: { price: number | null; updatedAt: Date }) => {
      const offerDate = new Date(offer.updatedAt);
      const monthKey = `${offerDate.getFullYear()}-${String(offerDate.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyData[monthKey] !== undefined) {
        monthlyData[monthKey] += offer.price || 0;
      }
    });

    // Convert to array format
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      monthlyTransactions.push({
        month: monthNames[date.getMonth()],
        amount: monthlyData[monthKey] || 0,
      });
    }

    const statistics = {
      // Users
      totalUsers,
      activeUsers,
      totalProviders,
      activeProviders,
      totalReceivers,
      activeReceivers,
      totalAdmins,
      activeAdmins,
      newUsersToday,
      newUsersThisMonth,
      userGrowthPercentage: Number(userGrowthPercentage.toFixed(2)),

      // Demands
      totalDemands,
      activeDemands,
      closedDemands,
      completedDemands,
      cancelledDemands,
      urgentDemands,
      newDemandsToday,
      newDemandsThisMonth,
      demandGrowthPercentage: Number(demandGrowthPercentage.toFixed(2)),

      // Offers
      totalOffers,
      pendingOffers,
      acceptedOffers,
      rejectedOffers,
      completedOffers,
      newOffersToday,
      newOffersThisMonth,
      totalAcceptedPrice,
      totalCompletedPrice,

      // Categories
      totalCategories,
      activeCategories,

      // Reviews
      totalReviews,
      averageRating: averageRating._avg.rating ? Number(averageRating._avg.rating.toFixed(2)) : 0,
      reviewsThisMonth,

      // Charity Activities
      totalCharityActivities,
      activeCharityActivities,
      newCharityActivitiesToday,
      newCharityActivitiesThisMonth,

      // Notifications
      totalNotifications,
      unreadNotifications,
    };

    res.json({
      success: true,
      data: {
        statistics,
        monthlyTransactions,
        lastTenUsers,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

