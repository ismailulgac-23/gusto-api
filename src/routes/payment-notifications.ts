import { Router, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validator';

const router = Router();

// ==================== USER ROUTES ====================

// Submit a payment notification
router.post(
    '/',
    authenticate,
    [
        body('amount').isFloat({ min: 1 }).withMessage('Miktar en az 1 TL olmalıdır'),
        body('paymentDate').isISO8601().withMessage('Geçerli bir tarih giriniz'),
        body('bankName').isString().notEmpty().withMessage('Banka adı gereklidir'),
        body('description').optional({ values: 'null' }).isString(),
    ],
    validateRequest,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const { amount, paymentDate, bankName, description } = req.body;

            const notification = await prisma.paymentNotification.create({
                data: {
                    userId: req.userId as string,
                    amount: parseFloat(amount),
                    paymentDate: new Date(paymentDate),
                    bankName,
                    description: description || null,
                    status: 'PENDING',
                },
            });

            res.status(201).json({
                success: true,
                message: 'Ödeme bildiriminiz başarıyla iletildi. Onaylandıktan sonra bakiyenize eklenecektir.',
                data: notification,
            });
        } catch (error) {
            next(error);
        }
    }
);

// Get my payment notifications
router.get('/my', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const notifications = await prisma.paymentNotification.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            success: true,
            data: notifications,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
