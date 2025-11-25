import { Router, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { sendOTP, verifyOTP } from '../services/sms.service';
import { AuthRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validator';

const router = Router();

// Send OTP - Netgsm SMS entegrasyonu ile
router.post(
  '/send-otp',
  [body('phoneNumber').isMobilePhone('any').withMessage('Geçersiz telefon numarası')],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { phoneNumber } = req.body;

      // SMS gönder
      const result = await sendOTP(phoneNumber);

      if (!result.success) {
        throw new AppError(result.error || 'SMS gönderilemedi', 500);
      }

      res.json({
        success: true,
        message: 'OTP sent successfully',
        jobid: result.jobid,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Verify OTP and Login/Register
router.post(
  '/verify-otp',
  [
    body('phoneNumber').isMobilePhone('any').withMessage('Geçersiz telefon numarası'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP kodu 6 haneli olmalıdır'),
    body('userType').isIn(['PROVIDER', 'RECEIVER']).optional(),
    body('name').optional().isString(),
    body('email').optional().isEmail().withMessage('Geçersiz email adresi'),
    body('companyName').optional().isString(),
    body('address').optional().isString(),
    body('categories').optional().isArray(),
    body('cityId').optional().isUUID().withMessage('Geçersiz şehir ID'),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { phoneNumber, otp, userType, name, email, companyName, address, categories, cityId } = req.body;

      // OTP doğrula
      const isValid = verifyOTP(phoneNumber, otp);
      if (!isValid) {
        throw new AppError('Geçersiz veya süresi dolmuş OTP kodu', 400);
      }

      // Telefonu normalize et
      const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { phoneNumber: normalizedPhone },
      });

      // Eğer kullanıcı varsa ve password yoksa, ilk giriş için otomatik parola oluştur
      if (user && !user.password) {
        // Rastgele 6 haneli parola oluştur (telefon numarasının son 6 hanesi + rastgele sayı)
        const randomPassword = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = await bcrypt.hash(randomPassword, 10);
        
        // Kullanıcının parolasını güncelle
        user = await prisma.user.update({
          where: { id: user.id },
          data: { password: hashedPassword },
        });
      }

      if (!user) {
        // Eğer kullanıcı yoksa ve userType da yoksa, bu bir login denemesi
        // Kullanıcıyı kayıt sayfasına yönlendirmek için daha açıklayıcı hata
        if (!userType) {
          throw new AppError('Bu telefon numarası ile kayıtlı kullanıcı bulunamadı. Lütfen kayıt olun.', 404);
        }

        // Handle categories - can be IDs or names
        let categoryIds: string[] = [];
        if (categories && Array.isArray(categories) && categories.length > 0) {
          const categoryRecords = await prisma.category.findMany({
            where: {
              OR: [
                { id: { in: categories } },
                { name: { in: categories } },
              ],
              isActive: true,
            },
          });
          categoryIds = categoryRecords.map(cat => cat.id);
        }

        // City validation - eğer cityId varsa ve aktif değilse hata ver
        if (cityId) {
          const city = await prisma.city.findUnique({
            where: { id: cityId },
          });
          if (!city) {
            throw new AppError('Geçersiz şehir ID', 400);
          }
          if (!city.isActive) {
            throw new AppError('Seçilen şehir aktif değil', 400);
          }
        }

        user = await prisma.user.create({
          data: {
            phoneNumber: normalizedPhone,
            userType,
            name: name || null,
            email: email || null,
            companyName: companyName || null,
            address: address || null,
            ...(cityId ? { cityId } : {}),
            categories: {
              create: categoryIds.map(categoryId => ({
                categoryId,
              })),
            },
          } as any,
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
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user.id, userType: user.userType },
        process.env.JWT_SECRET ?? 'secret',
        { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' } as jwt.SignOptions
      );


      // Get user with categories
      const userWithCategories = await prisma.user.findUnique({
        where: { id: user.id },
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

      res.json({
        success: true,
        message: 'Giriş başarılı',
        data: {
          token,
          user: {
            id: user.id,
            phoneNumber: user.phoneNumber,
            name: user.name,
            email: user.email,
            userType: user.userType,
            isAdmin: user.isAdmin,
            isActive: user.isActive,
            profileImage: user.profileImage,
            companyName: user.companyName,
            address: user.address,
            categories: userWithCategories?.categories.map(uc => uc.category.id) || [],
            bio: user.bio,
            location: user.location,
            rating: user.rating,
            ratingCount: user.ratingCount,
            responseTime: user.responseTime,
            memberSince: user.memberSince,
            completedJobs: user.completedJobs,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Admin Login - Email/Password ile
router.post(
  '/admin/login',
  [
    body('email').isEmail().withMessage('Geçerli bir email adresi giriniz'),
    body('password').isLength({ min: 6 }).withMessage('Şifre en az 6 karakter olmalıdır'),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email },
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

      if (!user) {
        throw new AppError('Email veya şifre hatalı', 401);
      }

      // Check if user is admin
      if (!user.isAdmin) {
        throw new AppError('Bu hesap admin yetkisine sahip değil', 403);
      }

      // Check if user has password
      if (!user.password) {
        throw new AppError('Bu hesap için şifre tanımlanmamış. Lütfen şifre belirleyin.', 401);
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new AppError('Email veya şifre hatalı', 401);
      }

      // Check if user is active
      if (!user.isActive) {
        throw new AppError('Hesabınız pasif durumda', 403);
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user.id, userType: user.userType, isAdmin: user.isAdmin },
        process.env.JWT_SECRET ?? 'secret',
        { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' } as jwt.SignOptions
      );

      res.json({
        success: true,
        message: 'Giriş başarılı',
        data: {
          token,
          user: {
            id: user.id,
            phoneNumber: user.phoneNumber,
            name: user.name,
            email: user.email,
            userType: user.userType,
            isAdmin: user.isAdmin,
            isActive: user.isActive,
            profileImage: user.profileImage,
            companyName: user.companyName,
            address: user.address,
            categories: user.categories.map(uc => uc.category.id) || [],
            bio: user.bio,
            location: user.location,
            rating: user.rating,
            ratingCount: user.ratingCount,
            responseTime: user.responseTime,
            memberSince: user.memberSince,
            completedJobs: user.completedJobs,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Check user - Telefon numarasına göre kullanıcının parolası var mı kontrol et
router.post(
  '/check-user',
  [body('phoneNumber').isMobilePhone('any').withMessage('Geçersiz telefon numarası')],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { phoneNumber } = req.body;

      // Telefonu normalize et
      const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      // Kullanıcıyı bul
      const user = await prisma.user.findUnique({
        where: { phoneNumber: normalizedPhone },
        select: {
          id: true,
          phoneNumber: true,
          password: true,
        },
      });

      if (!user) {
        throw new AppError('Bu telefon numarası ile kayıtlı kullanıcı bulunamadı', 404);
      }

      res.json({
        success: true,
        data: {
          hasPassword: !!user.password,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Login with Password - Telefon numarası ve parola ile giriş
router.post(
  '/login',
  [
    body('phoneNumber').isMobilePhone('any').withMessage('Geçersiz telefon numarası'),
    body('password').isLength({ min: 1 }).withMessage('Parola gereklidir'),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { phoneNumber, password } = req.body;

      // Telefonu normalize et
      const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      // Kullanıcıyı bul
      const user = await prisma.user.findUnique({
        where: { phoneNumber: normalizedPhone },
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

      if (!user) {
        throw new AppError('Telefon numarası veya parola hatalı', 401);
      }

      // Parola kontrolü
      if (!user.password) {
        throw new AppError('Bu hesap için parola tanımlanmamış. Lütfen SMS ile giriş yapın.', 401);
      }

      // Parola doğrula
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new AppError('Telefon numarası veya parola hatalı', 401);
      }

      // Kullanıcı aktif mi kontrol et
      if (!user.isActive) {
        throw new AppError('Hesabınız pasif durumda', 403);
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user.id, userType: user.userType },
        process.env.JWT_SECRET ?? 'secret',
        { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' } as jwt.SignOptions
      );

      res.json({
        success: true,
        message: 'Giriş başarılı',
        data: {
          token,
          user: {
            id: user.id,
            phoneNumber: user.phoneNumber,
            name: user.name,
            email: user.email,
            userType: user.userType,
            isAdmin: user.isAdmin,
            isActive: user.isActive,
            profileImage: user.profileImage,
            companyName: user.companyName,
            address: user.address,
            categories: user.categories.map(uc => uc.category.id) || [],
            bio: user.bio,
            location: user.location,
            rating: user.rating,
            ratingCount: user.ratingCount,
            responseTime: user.responseTime,
            memberSince: user.memberSince,
            completedJobs: user.completedJobs,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Admin Me - Get current admin user
router.get(
  '/admin/me',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization || req.headers.token;
      
      if (!authHeader) {
        throw new AppError('Authentication required', 401);
      }

      const token = typeof authHeader === 'string' 
        ? (authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : authHeader)
        : '';

      if (!token || token.trim() === '') {
        throw new AppError('Authentication required', 401);
      }

      const jwtSecret = process.env.JWT_SECRET || 'secret';
      const decoded = jwt.verify(token, jwtSecret) as any;

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
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

      if (!user) {
        throw new AppError('User not found', 404);
      }

      if (!user.isAdmin) {
        throw new AppError('Access denied. Admin role required.', 403);
      }

      res.json({
        success: true,
        data: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          name: user.name,
          email: user.email,
          userType: user.userType,
          isAdmin: user.isAdmin,
          isActive: user.isActive,
          profileImage: user.profileImage,
          companyName: user.companyName,
          address: user.address,
          categories: user.categories.map(uc => uc.category.id) || [],
          bio: user.bio,
          location: user.location,
          rating: user.rating,
          ratingCount: user.ratingCount,
          responseTime: user.responseTime,
          memberSince: user.memberSince,
          completedJobs: user.completedJobs,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

