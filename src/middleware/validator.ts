import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';
import { AppError } from './errorHandler';

// Global validation error handler middleware
export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const firstError = errors.array()[0] as ValidationError;
    
    // Türkçe hata mesajları
    const errorMessages: Record<string, string> = {
      'Invalid phone number': 'Geçersiz telefon numarası',
      'OTP must be 6 digits': 'OTP kodu 6 haneli olmalıdır',
      'Invalid value': 'Geçersiz değer',
      'Invalid email': 'Geçersiz email adresi',
    };

    const message = errorMessages[firstError.msg] || firstError.msg;
    
    throw new AppError(message, 400);
  }
  
  next();
};

