import { Router, Response, NextFunction } from "express";
import prisma from "../../lib/prisma";
import { authenticate, AuthRequest } from "../../middleware/auth";
import { AppError } from "../../middleware/errorHandler";

const router = Router();

// Provider Dashboard Stats
router.get(
    "/dashboard-stats",
    authenticate,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const providerId = req.userId!;

            // Get provider details including categories and city
            const provider = await prisma.user.findUnique({
                where: { id: providerId },
                include: {
                    categories: true,
                },
            });

            if (!provider) {
                throw new AppError("Provider not found", 404);
            }

            if (provider.userType !== "PROVIDER") {
                throw new AppError("Access denied. Only providers can access this.", 403);
            }

            const userCategoryIds = provider.categories.map((uc) => uc.categoryId);

            // 1. New Demands Count (matching categories, city, approved, active)
            // Note: We'll also include child categories if needed like in demands.ts, 
            // but for stats, a simple match is often enough or we can reuse the logic.

            const newDemandsCount = await prisma.demand.count({
                where: {
                    status: "ACTIVE",
                    isApproved: true,
                    categoryId: { in: userCategoryIds },
                    // If city filter is active (optional but recommended)
                    // cities: { some: { cityId: provider.cityId } } 
                },
            });

            // 2. Active Offers Count (Pending offers by this provider)
            const activeOffersCount = await prisma.offer.count({
                where: {
                    providerId: providerId,
                    status: "PENDING",
                },
            });

            // 3. Completed Jobs Count
            const completedJobsCount = await prisma.offer.count({
                where: {
                    providerId: providerId,
                    status: "COMPLETED",
                },
            });

            res.json({
                success: true,
                data: {
                    username: provider.name || provider.companyName || "Provider",
                    companyName: provider.companyName,
                    stats: {
                        newDemands: newDemandsCount,
                        activeOffers: activeOffersCount,
                        completedJobs: completedJobsCount,
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

export default router;
