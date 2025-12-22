import { NextFunction, Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma';
import { authenticate, authorizeProvider, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Create offer
router.post(
  '/',
  authenticate,
  authorizeProvider,
  [
    body('demandId').isUUID().withMessage('Geçersiz talep ID'),
    body('message').optional().isString().isLength({ max: 1000 }).withMessage('Mesaj en fazla 1000 karakter olabilir'),
    body('price').custom((value) => {
      if (value === undefined || value === null) {
        throw new Error('Fiyat zorunludur');
      }
      const num = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(num) || !isFinite(num) || num < 0) {
        throw new Error('Geçerli bir fiyat giriniz');
      }
      return true;
    }).withMessage('Geçerli bir fiyat giriniz'),
    body('estimatedTime').custom((value) => {
      if (value === undefined || value === null || value === '') {
        throw new Error('Tahmini süre zorunludur');
      }
      return typeof value === 'string';
    }).withMessage('Tahmini süre zorunludur'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => {
          const field = 'param' in err ? err.param : 'field';
          return `${field}: ${err.msg}`;
        }).join(', ');
        throw new AppError(`Validation error: ${errorMessages}`, 400);
      }

      const { demandId, message, price, estimatedTime } = req.body;

      // Parse price (required)
      const parsedPrice = typeof price === 'string' ? parseFloat(price) : price;
      if (isNaN(parsedPrice) || !isFinite(parsedPrice) || parsedPrice < 0) {
        throw new AppError('Geçerli bir fiyat giriniz', 400);
      }

      // Check if demand exists and is active, include category for commission rate
      const demand = await prisma.demand.findUnique({
        where: { id: demandId },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              commissionRate: true,
            },
          },
        },
      });

      if (!demand) {
        throw new AppError('Demand not found', 404);
      }

      if (demand.status !== 'ACTIVE') {
        throw new AppError('Cannot make offer on inactive demand', 400);
      }

      // Check if provider already made an offer
      const existingOffer = await prisma.offer.findFirst({
        where: {
          demandId,
          providerId: req.userId,
        },
      });

      if (existingOffer) {
        throw new AppError('You have already made an offer on this demand', 400);
      }

      // Get provider's current balance
      const provider = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { balance: true },
      });

      if (!provider) {
        throw new AppError('Provider not found', 404);
      }

      // Calculate commission based on category commission rate
      const commissionRate = demand.category?.commissionRate || 0; // Default 0 if no commission rate
      const commissionAmount = (parsedPrice / 1000) * commissionRate; // Binde cinsinden

      // Check if provider has enough balance
      if (provider.balance < commissionAmount) {
        throw new AppError(
          `Yetersiz bakiye. Gerekli: ${commissionAmount.toFixed(2)} TL, Mevcut: ${provider.balance.toFixed(2)} TL`,
          400
        );
      }

      // Deduct commission from balance and create offer in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Update provider balance
        await tx.user.update({
          where: { id: req.userId! },
          data: {
            balance: {
              decrement: commissionAmount,
            },
          },
        });

        // Create offer (otomatik onaylanıyor)
        const offer = await tx.offer.create({
          data: {
            demandId,
            providerId: req.userId!,
            message: message || null,
            price: parsedPrice,
            estimatedTime: estimatedTime,
            isApproved: true, // Teklifler direkt onaylanıyor
          },
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

        return { offer, commissionAmount };
      });

      const offer = result.offer;

      // Create notification for demand owner
      await prisma.notification.create({
        data: {
          userId: demand.userId,
          title: 'Yeni Teklif',
          message: `${offer.provider?.name || 'Bir sağlayıcı'} talebinize teklif verdi`,
          type: 'NEW_OFFER',
          data: {
            offerId: offer.id,
            demandId: demand.id,
          },
        },
      });

      res.status(201).json({
        success: true,
        message: 'Offer created successfully',
        data: {
          ...offer,
          commissionAmount: result.commissionAmount,
          newBalance: provider.balance - result.commissionAmount,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get offer by ID
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            profileImage: true,
            rating: true,
            phoneNumber: true,
            address: true,
            bio: true,
            email: true,
            location: true,
            ratingCount: true,
            categories: true
          },
        },
        demand: {
          include: {
            category: true,
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
      throw new AppError('Offer not found', 404);
    }

    // Check authorization
    if (offer.providerId !== req.userId && offer.demand?.userId !== req.userId) {
      throw new AppError('You are not authorized to view this offer', 403);
    }

    res.json({
      success: true,
      data: offer,
    });
  } catch (error) {
    next(error);
  }
});

// Update offer (Admin panel)
router.patch(
  '/:id',
  authenticate,
  [
    body('message').optional().isString().isLength({ max: 1000 }),
    body('price').optional().isFloat({ min: 0 }),
    body('estimatedTime').optional().isString(),
    body('status').optional().isIn(['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED']),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const offer = await prisma.offer.findUnique({
        where: { id: req.params.id },
      });

      if (!offer) {
        throw new AppError('Offer not found', 404);
      }

      const updateData: any = {};
      if (req.body.message !== undefined) updateData.message = req.body.message;
      if (req.body.price !== undefined) updateData.price = parseFloat(req.body.price);
      if (req.body.estimatedTime !== undefined) updateData.estimatedTime = req.body.estimatedTime;
      if (req.body.status !== undefined) updateData.status = req.body.status;

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
        message: 'Offer updated successfully',
        data: updatedOffer,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete offer (Admin panel)
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
    });

    if (!offer) {
      throw new AppError('Offer not found', 404);
    }

    await prisma.offer.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      message: 'Offer deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Update offer status (accept/reject)
router.patch(
  '/:id/status',
  authenticate,
  [body('status').isIn(['ACCEPTED', 'REJECTED'])],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const { status } = req.body;

      const offer = await prisma.offer.findUnique({
        where: { id: req.params.id },
        include: {
          demand: true,
        },
      });

      if (!offer) {
        throw new AppError('Offer not found', 404);
      }

      // Only demand owner can accept/reject
      if (offer.demand?.userId !== req.userId) {
        throw new AppError('You are not authorized to update this offer', 403);
      }

      const updatedOffer = await prisma.offer.update({
        where: { id: req.params.id },
        data: { status },
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              profileImage: true,
              rating: true,
            },
          },
        },
      });

      // Create notification for provider
      await prisma.notification.create({
        data: {
          userId: offer.providerId,
          title: status === 'ACCEPTED' ? 'Teklif Kabul Edildi' : 'Teklif Reddedildi',
          message: `Teklifiniz ${status === 'ACCEPTED' ? 'kabul edildi' : 'reddedildi'}`,
          type: 'OFFER_STATUS',
          data: {
            offerId: offer.id,
            demandId: offer.demandId,
            status,
          },
        },
      });

      // If offer is accepted, close the demand
      if (status === 'ACCEPTED') {
        await prisma.demand.update({
          where: { id: offer.demandId },
          data: { status: 'CLOSED' },
        });
      }

      res.json({
        success: true,
        message: `Offer ${status.toLowerCase()} successfully`,
        data: updatedOffer,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get all offers (Admin panel)
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { status } = req.query;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const offers = await prisma.offer.findMany({
      where,
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
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: offers,
    });
  } catch (error) {
    next(error);
  }
});

// Provider marks offer as completed
router.patch(
  '/:id/complete',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const offer = await prisma.offer.findUnique({
        where: { id: req.params.id },
        include: {
          demand: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  fcmToken: true,
                },
              },
            },
          },
          provider: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!offer) {
        throw new AppError('Offer not found', 404);
      }

      // Only provider can mark as completed
      if (offer.providerId !== req.userId) {
        throw new AppError('Only provider can mark offer as completed', 403);
      }

      // Offer must be accepted
      if (offer.status !== 'ACCEPTED') {
        throw new AppError('Only accepted offers can be marked as completed', 400);
      }

      // Already completed
      if (offer.providerCompleted) {
        throw new AppError('Offer already marked as completed by provider', 400);
      }

      // Update offer
      const updatedOffer = await prisma.offer.update({
        where: { id: req.params.id },
        data: { 
          providerCompleted: true,
          status: 'COMPLETED',
        },
        include: {
          demand: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          provider: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Create notification for receiver
      await prisma.notification.create({
        data: {
          userId: offer.demand!.userId,
          title: 'Hizmet Tamamlandı',
          message: `${offer.provider?.name || 'Hizmet sağlayıcı'} işi tamamladığını onayladı. Lütfen hizmeti değerlendirin.`,
          type: 'OFFER_COMPLETED',
          data: {
            offerId: offer.id,
            demandId: offer.demandId,
            providerId: offer.providerId,
          },
        },
      });

      // TODO: Send push notification if FCM token exists
      // if (offer.demand?.user?.fcmToken) {
      //   // Send FCM notification
      // }

      res.json({
        success: true,
        message: 'Offer marked as completed successfully',
        data: updatedOffer,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get user's offers - For PROVIDER: offers they made, For RECEIVER: offers on their demands
router.get('/user/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { status } = req.query;

    const allowedStatuses = ['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED'];
    const statusFilter: any =
      typeof status === 'string' && allowedStatuses.includes(status)
        ? status
        : undefined;

    // Get current user to check type
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { userType: true },
    });

    let offers;

    if (currentUser?.userType === 'PROVIDER') {
      // PROVIDER: Get offers they made
      offers = await prisma.offer.findMany({
        where: {
          providerId: req.userId,
          ...(statusFilter ? { status: statusFilter } : {}),
        },
        include: {
          demand: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  profileImage: true,
                  rating: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      // RECEIVER: Get demands with their offers
      const demands = await prisma.demand.findMany({
        where: {
          userId: req.userId,
          isApproved: true, // Sadece onaylanmış talepler
        },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
            },
          },
          offers: {
            where: {
              ...(statusFilter ? { status: statusFilter } : {}),
            },
            include: {
              provider: {
                select: {
                  id: true,
                  name: true,
                  profileImage: true,
                  rating: true,
                  ratingCount: true,
                  companyName: true,
                  phoneNumber: true,
                  address: true,
                  bio: true,
                  email: true,
                  location: true,
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
        orderBy: { createdAt: 'desc' },
      });

      // Sadece teklifi olan talepleri döndür
      const demandsWithOffers = demands.filter(demand => demand.offers.length > 0);

      res.json({
        success: true,
        data: {
          demands: demandsWithOffers,
          offers: [], // Provider için boş, receiver için demands kullanılacak
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        offers,
        demands: [], // Provider için boş
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

