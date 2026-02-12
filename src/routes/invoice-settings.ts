import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get invoice settings
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
    try {
        const settings = await prisma.invoiceSettings.findUnique({
            where: { userId: req.userId }
        });
        res.json({ success: true, data: settings });
    } catch (error) {
        next(error);
    }
});

// Update invoice settings
router.put('/', authenticate, async (req: AuthRequest, res, next) => {
    try {
        const { taxOffice, taxNumber, companyName, billingAddress, isCorporate } = req.body;

        const settings = await prisma.invoiceSettings.upsert({
            where: { userId: req.userId },
            update: {
                taxOffice,
                taxNumber,
                companyName,
                billingAddress,
                isCorporate
            },
            create: {
                userId: req.userId as string,
                taxOffice,
                taxNumber,
                companyName,
                billingAddress,
                isCorporate
            }
        });
        res.json({ success: true, data: settings });
    } catch (error) {
        next(error);
    }
});

export default router;
