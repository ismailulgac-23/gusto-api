import { Router } from 'express';
import { PrismaClient, TransactionType, TransactionStatus } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get transactions for current user
router.get('/my', authenticate, async (req: AuthRequest, res, next) => {
    try {
        const transactions = await prisma.transaction.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            success: true,
            data: transactions
        });
    } catch (error) {
        next(error);
    }
});

// Get user balance
router.get('/balance', authenticate, async (req: AuthRequest, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { balance: true }
        });

        res.json({
            success: true,
            balance: user?.balance || 0
        });
    } catch (error) {
        next(error);
    }
});

// Create a transaction (e.g. deposit or internal payment)
// This is a basic implementation, usually payment provider callbacks would handle this
router.post('/deposit', authenticate, async (req: AuthRequest, res, next) => {
    try {
        const { amount, description } = req.body;

        if (!amount || amount <= 0) {
            res.status(400).json({ success: false, message: 'Geçersiz miktar' });
            return;
        }

        const transaction = await prisma.$transaction(async (tx) => {
            const newTx = await tx.transaction.create({
                data: {
                    userId: req.userId as string,
                    amount: parseFloat(amount),
                    type: TransactionType.DEPOSIT,
                    status: TransactionStatus.COMPLETED,
                    description: description || 'Bakiye yükleme'
                }
            });

            await tx.user.update({
                where: { id: req.userId },
                data: { balance: { increment: parseFloat(amount) } }
            });

            return newTx;
        });

        res.status(201).json({
            success: true,
            message: 'Bakiye başarıyla yüklendi',
            data: transaction
        });
    } catch (error) {
        next(error);
    }
});

export default router;
