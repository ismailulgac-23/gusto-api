import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';
import prisma from '../lib/prisma';

export interface AuthRequest extends Request {
  userId?: string;
  userType?: string;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('🔐 Auth check:', {
      method: req.method,
      path: req.path,
      hasAuthHeader: !!authHeader,
      authHeader: authHeader ? `${authHeader.substring(0, 20)}...` : 'none',
    });

    if (!authHeader) {
      console.error('❌ No authorization header');
      throw new AppError('Authentication required', 401);
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.replace('Bearer ', '') 
      : authHeader;

    if (!token || token.trim() === '') {
      console.error('❌ Empty token');
      throw new AppError('Authentication required', 401);
    }

    const jwtSecret = process.env.JWT_SECRET || 'secret';
    console.log('🔑 Verifying token with secret:', jwtSecret ? '***' : 'NOT SET');

    try {
      const decoded = jwt.verify(token, jwtSecret) as any;

      console.log('✅ Token verified:', {
        fullPayload: decoded,
        userId: decoded.userId,
        userType: decoded.userType,
        userTypeType: typeof decoded.userType,
      });

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { userType: true },
      });
      if (!user) {
        throw new AppError('User not found', 404);
      }

      req.userType = user.userType;
      req.userId = decoded.userId;
      
      // Eğer userType yoksa veya undefined ise, veritabanından çek
      if (!req.userType) {
        console.warn('⚠️ userType not found in token, fetching from database...');
        const prisma = (await import('../lib/prisma')).default;
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { userType: true },
        });
        if (user) {
          req.userType = user.userType;
          console.log('✅ userType fetched from database:', req.userType);
        }
      }

      next();
    } catch (jwtError: any) {
      console.error('❌ JWT verification failed:', {
        error: jwtError.message,
        name: jwtError.name,
      });
      throw new AppError(`Invalid or expired token: ${jwtError.message}`, 401);
    }
  } catch (error: any) {
    if (error instanceof AppError) {
      next(error);
    } else {
      console.error('❌ Auth middleware error:', error);
      next(new AppError('Invalid or expired token', 401));
    }
  }
};

export const authorizeProvider = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  console.log('🔒 Authorize Provider check:', {
    userId: req.userId,
    userType: req.userType,
    userTypeType: typeof req.userType,
    expected: 'PROVIDER',
    match: req.userType === 'PROVIDER',
    matchCaseInsensitive: req.userType?.toUpperCase() === 'PROVIDER',
  });

  // Case-insensitive kontrol
  if (!req.userType || req.userType.toUpperCase() !== 'PROVIDER') {
    console.error('❌ Provider authorization failed:', {
      received: req.userType,
      receivedType: typeof req.userType,
      expected: 'PROVIDER',
    });
    return next(new AppError('Access denied. Provider role required.', 403));
  }
  
  console.log('✅ Provider authorized');
  next();
};

export const authorizeReceiver = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  // Case-insensitive kontrol
  if (!req.userType || req.userType.toUpperCase() !== 'RECEIVER') {
    return next(new AppError('Access denied. Receiver role required.', 403));
  }
  next();
};

