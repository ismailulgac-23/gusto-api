import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Get all reviews (Admin panel)
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
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

// Create review
router.post(
  '/',
  authenticate,
  [
    body('reviewedUserId').isUUID(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('comment').optional().isString().isLength({ max: 500 }),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const { reviewedUserId, rating, comment } = req.body;

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

      // Check if review already exists
      const existingReview = await prisma.review.findFirst({
        where: {
          reviewerId: req.userId,
          reviewedUserId,
        },
      });

      if (existingReview) {
        throw new AppError('You have already reviewed this user', 400);
      }

      const review = await prisma.review.create({
        data: {
          reviewerId: req.userId!,
          reviewedUserId,
          rating,
          comment,
        },
        include: {
          reviewer: {
            select: {
              id: true,
              name: true,
              profileImage: true,
            },
          },
        },
      });

      // Update user's rating
      const reviews = await prisma.review.findMany({
        where: { reviewedUserId },
      });

      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

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

