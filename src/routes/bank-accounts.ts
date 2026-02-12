import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get all bank accounts for user
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
    try {
        const accounts = await prisma.bankAccount.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, data: accounts });
    } catch (error) {
        next(error);
    }
});

// Create bank account
router.post('/', authenticate, async (req: AuthRequest, res, next) => {
    try {
        const { accountName, bankName, iban, accountHolder, isDefault } = req.body;

        if (isDefault) {
            await prisma.bankAccount.updateMany({
                where: { userId: req.userId },
                data: { isDefault: false }
            });
        }

        const account = await prisma.bankAccount.create({
            data: {
                userId: req.userId as string,
                accountName,
                bankName,
                iban,
                accountHolder,
                isDefault: !!isDefault
            }
        });
        res.status(201).json({ success: true, data: account });
    } catch (error) {
        next(error);
    }
});

// Update bank account
router.patch('/:id', authenticate, async (req: AuthRequest, res, next) => {
    try {
        const { id } = req.params;
        const { accountName, bankName, iban, accountHolder, isDefault } = req.body;

        if (isDefault) {
            await prisma.bankAccount.updateMany({
                where: { userId: req.userId, id: { not: id } },
                data: { isDefault: false }
            });
        }

        const account = await prisma.bankAccount.update({
            where: { id, userId: req.userId },
            data: {
                accountName,
                bankName,
                iban,
                accountHolder,
                isDefault: !!isDefault
            }
        });
        res.json({ success: true, data: account });
    } catch (error) {
        next(error);
    }
});

// Delete bank account
router.delete('/:id', authenticate, async (req: AuthRequest, res, next) => {
    try {
        await prisma.bankAccount.delete({
            where: { id: req.params.id, userId: req.userId }
        });
        res.json({ success: true, message: 'Hesap başarıyla silindi' });
    } catch (error) {
        next(error);
    }
});

export default router;
