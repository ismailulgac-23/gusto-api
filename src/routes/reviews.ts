import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Get all reviews (Admin panel)
router.get('/', authenticate, async (_req: AuthRequest, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
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
    });

    res.json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    next(error);
  }
});

// Delete review (Admin panel)
router.delete('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const review = await prisma.review.findUnique({
      where: { id: req.params.id },
    });

    if (!review) {
      throw new AppError('Review not found', 404);
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
      message: 'Review deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Create review (offer-based or general)
router.post(
  '/',
  authenticate,
  [
    body('reviewedUserId').isUUID(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('comment').optional().isString().isLength({ max: 500 }),
    body('offerId').optional().isUUID(), // Offer bazlı puanlama için
  ],
  async (req: AuthRequest, res: any, next: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const { reviewedUserId, rating, comment, offerId } = req.body;

      // Check if user is trying to review themselves
      if (reviewedUserId === req.userId) {
        throw new AppError('You cannot review yourself', 400);
      }

      // Check if reviewed user exists
      const reviewedUser = await prisma.user.findUnique({
        where: { id: reviewedUserId },
      });

      if (!reviewedUser) {
        throw new AppError('User not found', 404);
      }

      // If offerId is provided, validate offer
      if (offerId) {
        const offer = await prisma.offer.findUnique({
          where: { id: offerId },
          include: {
            demand: true,
          },
        });

        if (!offer) {
          throw new AppError('Offer not found', 404);
        }

        // Check if offer is completed by provider
        if (!offer.providerCompleted) {
          throw new AppError('Offer must be completed by provider before reviewing', 400);
        }

        // Check if reviewer is part of this offer (either provider or receiver)
        const isProvider = offer.providerId === req.userId;
        const isReceiver = offer.demand?.userId === req.userId;

        if (!isProvider && !isReceiver) {
          throw new AppError('You are not authorized to review this offer', 403);
        }

        // Check if reviewer is trying to review the other party
        const shouldReviewProvider = isReceiver && offer.providerId === reviewedUserId;
        const shouldReviewReceiver = isProvider && offer.demand?.userId === reviewedUserId;

        if (!shouldReviewProvider && !shouldReviewReceiver) {
          throw new AppError('You can only review the other party in this offer', 400);
        }

        // Check if review already exists for this offer
        const existingReview = await prisma.review.findFirst({
          where: {
            offerId,
            reviewerId: req.userId,
          },
        });

        if (existingReview) {
          throw new AppError('You have already reviewed this offer', 400);
        }
      } else {
        // General review (not offer-based)
        // Check if review already exists
        const existingReview = await prisma.review.findFirst({
          where: {
            reviewerId: req.userId,
            reviewedUserId,
            offerId: null, // General review
          },
        });

        if (existingReview) {
          throw new AppError('You have already reviewed this user', 400);
        }
      }

      const review = await prisma.review.create({
        data: {
          reviewerId: req.userId!,
          reviewedUserId,
          rating,
          comment,
          offerId: offerId || null,
        },
        include: {
          reviewer: {
            select: {
              id: true,
              name: true,
              profileImage: true,
            },
          },
          offer: offerId ? {
            select: {
              id: true,
              demand: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          } : undefined,
        },
      });

      // Update user's rating
      const reviews = await prisma.review.findMany({
        where: { reviewedUserId },
      });

      const avgRating = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

      await prisma.user.update({
        where: { id: reviewedUserId },
        data: {
          rating: avgRating,
          ratingCount: reviews.length,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Review created successfully',
        data: review,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get reviews for a user
router.get('/user/:userId', async (req, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { reviewedUserId: req.params.userId },
      include: {
        reviewer: {
          select: {
            id: true,
            name: true,
            profileImage: true,
          },
        },
        offer: {
          select: {
            id: true,
            demand: {
              select: {
                id: true,
                title: true,
              },
            },
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

// Get pending reviews (offers that need to be reviewed)
router.get('/pending', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { userType: true },
    });

    let pendingOffers = [];

    if (currentUser?.userType === 'PROVIDER') {
      // Provider için: receiver'ın tamamladığı ve henüz puanlanmamış offer'lar
      const offers = await prisma.offer.findMany({
        where: {
          providerId: req.userId,
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
                  profileImage: true,
                },
              },
            },
          },
          reviews: {
            where: {
              reviewerId: req.userId,
            },
          },
        },
      });

      // Henüz puanlanmamış olanları filtrele
      pendingOffers = offers
        .filter(offer => offer.reviews.length === 0)
        .map(offer => ({
          offerId: offer.id,
          demandId: offer.demandId,
          demandTitle: offer.demand?.title,
          userToReview: offer.demand?.user,
          type: 'provider_review_receiver',
        }));
    } else {
      // Receiver için: provider'ın tamamladığı ve henüz puanlanmamış offer'lar
      const offers = await prisma.offer.findMany({
        where: {
          providerCompleted: true,
          status: 'COMPLETED',
          demand: {
            userId: req.userId,
          },
        },
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              profileImage: true,
              companyName: true,
            },
          },
          demand: {
            select: {
              id: true,
              title: true,
            },
          },
          reviews: {
            where: {
              reviewerId: req.userId,
            },
          },
        },
      });

      // Henüz puanlanmamış olanları filtrele
      pendingOffers = offers
        .filter(offer => offer.reviews.length === 0)
        .map(offer => ({
          offerId: offer.id,
          demandId: offer.demandId,
          demandTitle: offer.demand?.title,
          userToReview: offer.provider,
          type: 'receiver_review_provider',
        }));
    }

    res.json({
      success: true,
      data: pendingOffers,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

