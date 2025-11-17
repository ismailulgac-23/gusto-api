import { Router, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { sendNotificationToUser, sendNotificationToMultipleUsers } from '../services/fcm.service';

const router = Router();

// Admin middleware
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

// Tek kullanıcıya bildirim gönder
router.post(
  '/send-single',
  authenticate,
  requireAdmin,
  [
    body('userId').isUUID().withMessage('Geçerli bir kullanıcı ID giriniz'),
    body('title').trim().notEmpty().withMessage('Başlık gereklidir'),
    body('body').trim().notEmpty().withMessage('Mesaj gereklidir'),
    body('data').optional().isObject().withMessage('Data bir obje olmalıdır'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const { userId, title, body: messageBody, data } = req.body;

      // Kullanıcıyı bul
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, fcmToken: true },
      });

      if (!user) {
        throw new AppError('Kullanıcı bulunamadı', 404);
      }

      if (!user.fcmToken) {
        throw new AppError('Kullanıcının FCM token\'ı bulunamadı', 400);
      }

      // FCM bildirimi gönder
      const fcmResult = await sendNotificationToUser(
        user.fcmToken,
        title,
        messageBody,
        data
      );

      if (!fcmResult.success) {
        throw new AppError(fcmResult.error || 'Bildirim gönderilemedi', 500);
      }

      // Veritabanına bildirim kaydet
      const notification = await prisma.notification.create({
        data: {
          userId,
          title,
          message: messageBody,
          type: 'ADMIN_NOTIFICATION',
          data: data || {},
        },
      });

      res.json({
        success: true,
        message: 'Bildirim başarıyla gönderildi',
        data: {
          notification,
          fcmMessageId: fcmResult.messageId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Çoklu kullanıcıya bildirim gönder
router.post(
  '/send-multiple',
  authenticate,
  requireAdmin,
  [
    body('userIds').isArray().withMessage('Kullanıcı ID\'leri bir dizi olmalıdır'),
    body('userIds.*').isUUID().withMessage('Her kullanıcı ID geçerli bir UUID olmalıdır'),
    body('title').trim().notEmpty().withMessage('Başlık gereklidir'),
    body('body').trim().notEmpty().withMessage('Mesaj gereklidir'),
    body('data').optional().isObject().withMessage('Data bir obje olmalıdır'),
    body('userType').optional().isIn(['PROVIDER', 'RECEIVER']).withMessage('Geçerli bir kullanıcı tipi giriniz'),
    body('cityId').optional().isUUID().withMessage('Geçerli bir şehir ID giriniz'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const { userIds, title, body: messageBody, data, userType, cityId } = req.body;

      // Kullanıcıları bul
      let whereClause: any = {};
      
      if (userIds && Array.isArray(userIds) && userIds.length > 0) {
        whereClause.id = { in: userIds };
      }
      
      if (userType) {
        whereClause.userType = userType;
      }
      
      if (cityId) {
        whereClause.cityId = cityId;
      }

      const users = await prisma.user.findMany({
        where: {
          ...whereClause,
          fcmToken: { not: null },
          isActive: true,
        },
        select: { id: true, fcmToken: true },
      });

      if (users.length === 0) {
        throw new AppError('FCM token\'ı olan aktif kullanıcı bulunamadı', 404);
      }

      const fcmTokens = users.map(u => u.fcmToken!).filter(Boolean);

      // FCM bildirimi gönder
      const fcmResult = await sendNotificationToMultipleUsers(
        fcmTokens,
        title,
        messageBody,
        data
      );

      // Veritabanına bildirimleri kaydet
      const notifications = await prisma.notification.createMany({
        data: users.map(user => ({
          userId: user.id,
          title,
          message: messageBody,
          type: 'ADMIN_NOTIFICATION',
          data: data || {},
        })),
      });

      res.json({
        success: true,
        message: `${fcmResult.successCount} kullanıcıya bildirim gönderildi`,
        data: {
          totalUsers: users.length,
          successCount: fcmResult.successCount,
          failureCount: fcmResult.failureCount,
          notificationsCreated: notifications.count,
          errors: fcmResult.errors,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Tüm aktif kullanıcılara bildirim gönder
router.post(
  '/send-all',
  authenticate,
  requireAdmin,
  [
    body('title').trim().notEmpty().withMessage('Başlık gereklidir'),
    body('body').trim().notEmpty().withMessage('Mesaj gereklidir'),
    body('data').optional().isObject().withMessage('Data bir obje olmalıdır'),
    body('userType').optional().isIn(['PROVIDER', 'RECEIVER']).withMessage('Geçerli bir kullanıcı tipi giriniz'),
    body('cityId').optional().isUUID().withMessage('Geçerli bir şehir ID giriniz'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const { title, body: messageBody, data, userType, cityId } = req.body;

      // Kullanıcıları bul
      let whereClause: any = {
        fcmToken: { not: null },
        isActive: true,
      };

      if (userType) {
        whereClause.userType = userType;
      }

      if (cityId) {
        whereClause.cityId = cityId;
      }

      const users = await prisma.user.findMany({
        where: whereClause,
        select: { id: true, fcmToken: true },
      });

      if (users.length === 0) {
        throw new AppError('FCM token\'ı olan aktif kullanıcı bulunamadı', 404);
      }

      const fcmTokens = users.map(u => u.fcmToken!).filter(Boolean);

      // FCM bildirimi gönder
      const fcmResult = await sendNotificationToMultipleUsers(
        fcmTokens,
        title,
        messageBody,
        data
      );

      // Veritabanına bildirimleri kaydet
      const notifications = await prisma.notification.createMany({
        data: users.map(user => ({
          userId: user.id,
          title,
          message: messageBody,
          type: 'ADMIN_NOTIFICATION',
          data: data || {},
        })),
      });

      res.json({
        success: true,
        message: `${fcmResult.successCount} kullanıcıya bildirim gönderildi`,
        data: {
          totalUsers: users.length,
          successCount: fcmResult.successCount,
          failureCount: fcmResult.failureCount,
          notificationsCreated: notifications.count,
          errors: fcmResult.errors,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Kullanıcı listesini getir (bildirim göndermek için)
router.get(
  '/users',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { userType, cityId, search } = req.query;

      let whereClause: any = {
        isActive: true,
      };

      if (userType) {
        whereClause.userType = userType;
      }

      if (cityId) {
        whereClause.cityId = cityId;
      }

      if (search) {
        whereClause.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { phoneNumber: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const users = await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          email: true,
          userType: true,
          profileImage: true,
          fcmToken: true,
          city: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

