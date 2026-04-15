import { Router, Response, NextFunction } from "express";
import { body, query, validationResult } from "express-validator";
import prisma from "../lib/prisma";
import {
  authenticate,
  authorizeReceiver,
  AuthRequest,
} from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// Get all demands (with filters) - For providers, filters by their categories
router.get(
  "/",
  authenticate,
  [
    query("category").optional().isString(),
    query("status")
      .optional()
      .isIn(["ACTIVE", "CLOSED", "COMPLETED", "CANCELLED"]),
    query("cityId").optional().isString(),
    query("search").optional().isString(),
    query("allOpportunities").optional().isBoolean(),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const {
        category,
        status = "ACTIVE",
        cityId,
        search,
        allOpportunities,
        page = "1",
        limit = "10"
      } = req.query;


      // Get current user to check type and categories
      const currentUser = await prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          userType: true,
          cityId: true,
          categories: {
            select: {
              categoryId: true,
            },
          },
        },
      });

      const where: any = {};

      // Helper function to get all child category IDs recursively
      const getAllChildCategoryIds = async (
        categoryId: string
      ): Promise<string[]> => {
        const children = await prisma.category.findMany({
          where: { parentId: categoryId },
          select: { id: true },
        });

        let allIds = [categoryId];
        for (const child of children) {
          const childIds = await getAllChildCategoryIds(child.id);
          allIds = [...allIds, ...childIds];
        }
        return allIds;
      };

      // If user is PROVIDER, filter by their categories and their subcategories
      // Unless allOpportunities=true is specified
      let allowedCategoryIds: string[] = [];
      const isAllOpps = String(allOpportunities) === "true";

      if (
        currentUser?.userType === "PROVIDER" &&
        currentUser.categories.length > 0 &&
        !isAllOpps
      ) {
        const userCategoryIds = currentUser.categories.map(
          (uc) => uc.categoryId
        );

        // Get all child categories for each user category
        for (const categoryId of userCategoryIds) {
          const allCategoryIds = await getAllChildCategoryIds(categoryId);
          allowedCategoryIds = [...allowedCategoryIds, ...allCategoryIds];
        }

        // Remove duplicates
        allowedCategoryIds = [...new Set(allowedCategoryIds)];

        // If a specific category filter is provided, check if it's in allowed categories
        if (category) {
          const categoryRecord = await prisma.category.findFirst({
            where: {
              OR: [{ id: category as string }, { name: category as string }],
            },
          });

          if (
            categoryRecord &&
            allowedCategoryIds.includes(categoryRecord.id)
          ) {
            where.categoryId = categoryRecord.id;
          } else {
            // Category filter not in allowed categories, return empty
            where.categoryId = { in: [] };
          }
        } else {
          // No category filter, show all demands in allowed categories
          where.categoryId = {
            in: allowedCategoryIds,
          };
        }
      } else if (category) {
        // Non-provider, no categories, OR allOpportunities=true, filtered by specific category
        const categoryRecord = await prisma.category.findFirst({
          where: {
            OR: [{ id: category as string }, { name: category as string }],
          },
        });
        if (categoryRecord) {
          // If we filter by a category, we should also include its children
          const allCatIds = await getAllChildCategoryIds(categoryRecord.id);
          where.categoryId = { in: allCatIds };
        }
      }

      // City Filter
      if (cityId) {
        where.cities = {
          some: {
            cityId: cityId as string
          }
        };
      }

      // Search Filter
      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      if (status) where.status = status;

      // Provider'lar sadece onaylanmış talepleri görebilir
      if (currentUser?.userType === "PROVIDER") {
        where.isApproved = true;
      }



      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;



      const [demands, total] = await Promise.all([
        prisma.demand.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                profileImage: true,
                rating: true,
              },
            },
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
              },
            },
            cities: {
              include: {
                city: {
                  select: {
                    id: true,
                    name: true,
                    isActive: true,
                  },
                },
              },
            },
            _count: {
              select: {
                offers: true,
              },
            },
          },
          orderBy: [
            { createdAt: "desc" },
          ],
          skip,
          take: limitNum,
        }),
        prisma.demand.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          demands,
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get demand by ID
router.get("/:id", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const demand = await prisma.demand.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            email: true,
            profileImage: true,
            rating: true,
            location: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
            questions: true,
            commissionRate: true,
          },
        },
        offers: {
          include: {
            provider: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
                profileImage: true,
                rating: true,
                companyName: true,
                address: true,
                location: true,
              },
            },
          },
        },
        _count: {
          select: {
            offers: true,
          },
        },
      },
    });

    if (!demand) {
      throw new AppError("Demand not found", 404);
    }

    if (!demand.isApproved) {
      throw new AppError("Bu talep henüz onaylanmamış", 403);
    }

    // Map offers to hide contact info unless accepted/completed or requester is the provider
    const protectedOffers = demand.offers.map(offer => {
      const isAccepted = offer.status === 'ACCEPTED' || offer.status === 'COMPLETED';
      const isOwnOffer = offer.providerId === req.userId;

      if (!isAccepted && !isOwnOffer && offer.provider) {
        // Hide sensitive info
        return {
          ...offer,
          provider: {
            id: offer.provider.id,
            name: offer.provider.name,
            profileImage: offer.provider.profileImage,
            rating: offer.provider.rating,
            // Hidden fields
            email: null,
            phoneNumber: null,
            companyName: null,
            address: null,
            location: null,
          }
        };
      }
      return offer;
    });

    res.json({
      success: true,
      data: {
        ...demand,
        offers: protectedOffers
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create demand
router.post(
  "/",
  authenticate,
  authorizeReceiver,
  [
    body("title")
      .trim()
      .isString()
      .withMessage("Başlık metin olmalıdır")
      .isLength({ min: 2, max: 200 })
      .withMessage("Başlık en az 2, en fazla 200 karakter olmalıdır"),
    body("category").isString().withMessage("Kategori zorunludur"), // Can be category ID or name
    body("location")
      .optional()
      .custom((value) => {
        if (value === undefined || value === null || value === "") return true;
        return typeof value === "string";
      })
      .withMessage("location must be a string"),
    body("latitude")
      .optional()
      .custom((value) => {
        if (value === undefined || value === null) return true;
        const num = typeof value === "string" ? parseFloat(value) : value;
        return !isNaN(num) && isFinite(num);
      })
      .withMessage("Geçersiz latitude"),
    body("longitude")
      .optional()
      .custom((value) => {
        if (value === undefined || value === null) return true;
        const num = typeof value === "string" ? parseFloat(value) : value;
        return !isNaN(num) && isFinite(num);
      })
      .withMessage("Geçersiz longitude"),
    body("images")
      .optional()
      .custom((value) => {
        if (value === undefined || value === null) return true;
        return Array.isArray(value);
      })
      .withMessage("images must be an array"),
    body("peopleCount")
      .optional()
      .custom((value) => {
        if (value === undefined || value === null) return true;
        const num = typeof value === "string" ? parseInt(value, 10) : value;
        return !isNaN(num) && Number.isInteger(num) && num >= 1;
      })
      .withMessage("Geçersiz peopleCount"),
    body("eventDate")
      .optional()
      .custom((value) => {
        if (!value) return true;
        // ISO8601 veya timestamp (number) kabul et
        if (typeof value === "string") {
          const date = new Date(value);
          return !isNaN(date.getTime());
        }
        if (typeof value === "number") {
          const date = new Date(value);
          return !isNaN(date.getTime());
        }
        return false;
      })
      .withMessage("Geçersiz tarih formatı"),
    body("eventTime")
      .optional()
      .custom((value) => {
        if (value === undefined || value === null || value === "") return true;
        return typeof value === "string";
      })
      .withMessage("eventTime must be a string"),
    body("deadline")
      .optional()
      .custom((value) => {
        if (value === undefined || value === null || value === "") return true;
        return typeof value === "string";
      })
      .withMessage("deadline must be a string"),
    body("address")
      .optional()
      .custom((value) => {
        if (value === undefined || value === null || value === "") return true;
        return typeof value === "string";
      })
      .withMessage("address must be a string"),
    body("questionResponses")
      .optional()
      .custom((value) => {
        if (value === undefined || value === null) return true;
        // Object veya Map kontrolü
        return (
          typeof value === "object" && !Array.isArray(value) && value !== null
        );
      })
      .withMessage("questionResponses must be an object"),
    body("cityIds")
      .optional()
      .custom((value) => {
        if (value === undefined || value === null) return true;
        if (!Array.isArray(value)) return false;
        return value.every(
          (id: any) => typeof id === "string" && id.length > 0
        );
      })
      .withMessage("cityIds must be an array of strings"),
    body("countie")
      .optional()
      .custom((value) => {
        if (value === undefined || value === null || value === "") return true;
        return typeof value === "string";
      })
      .withMessage("countie must be a string"),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Log incoming request body for debugging
      console.log("📥 Incoming demand creation request:");
      console.log("Body:", JSON.stringify(req.body, null, 2));
      console.log(
        "Body types:",
        Object.keys(req.body).reduce((acc, key) => {
          acc[key] = typeof req.body[key];
          return acc;
        }, {} as Record<string, string>)
      );

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error("❌ Validation errors:", errors.array());
        const errorMessages = errors
          .array()
          .map((err) => {
            const field =
              "path" in err
                ? err.path
                : "param" in err
                  ? err.param
                  : "field";
            const value = "value" in err ? err.value : "N/A";
            return `${field}: ${err.msg} (gelen: ${JSON.stringify(value)})`;
          })
          .join(", ");
        throw new AppError(`Talep doğrulama hatası: ${errorMessages}`, 400);
      }

      const {
        title,
        category,
        location,
        latitude,
        longitude,
        images,
        peopleCount,
        eventDate,
        eventTime,
        deadline,
        address,
        questionResponses,
        cityIds,
        countie,
      } = req.body;

      console.log("cityIds", cityIds);

      // Find category by ID or name
      const categoryRecord = await prisma.category.findFirst({
        where: {
          OR: [{ id: category }, { name: category }],
          isActive: true,
        },
      });

      if (!categoryRecord) {
        throw new AppError("Kategori bulunamadı", 404);
      }

      // Validate and process cityIds - tek şehir seçimi
      let processedCityIds: string[] = [];
      if (cityIds && Array.isArray(cityIds) && cityIds.length > 0) {
        // Sadece ilk şehri al (tek şehir seçimi)
        const cityId = cityIds[0];

        // Validate city ID exists and is active
        const city = await prisma.city.findUnique({
          where: {
            id: cityId,
            isActive: true,
          },
        });

        if (!city) {
          throw new AppError("Geçersiz veya aktif olmayan şehir ID'si", 400);
        }

        processedCityIds = [city.id];
      } else {
        // If no cities provided, get user's city
        const user = await prisma.user.findUnique({
          where: { id: req.userId! },
          select: { cityId: true },
        });

        if (user?.cityId) {
          // Check if user's city is active
          const userCity = await prisma.city.findUnique({
            where: { id: user.cityId },
          });

          if (userCity && userCity.isActive) {
            processedCityIds = [user.cityId];
          }
        }

        // If still no cities, throw error
        if (processedCityIds.length === 0) {
          throw new AppError("Bir aktif şehir seçmelisiniz", 400);
        }
      }

      // Validate countie - tek ilçe string kontrolü
      if (countie && typeof countie === "string" && countie.trim().length === 0) {
        throw new AppError("İlçe adı boş olamaz", 400);
      }

      // Parse eventDate safely
      let parsedEventDate: Date | null = null;
      if (eventDate) {
        if (typeof eventDate === "string") {
          parsedEventDate = new Date(eventDate);
        } else if (typeof eventDate === "number") {
          parsedEventDate = new Date(eventDate);
        }
        // Validate date
        if (parsedEventDate && isNaN(parsedEventDate.getTime())) {
          throw new AppError("Geçersiz tarih formatı", 400);
        }
      }

      // Generate demand number using transaction to prevent race conditions
      const demand = await prisma.$transaction(async (tx) => {
        // Find the highest demandNumber and increment by 1, or start from 1000000
        const lastDemand = await tx.demand.findFirst({
          orderBy: { demandNumber: "desc" },
          select: { demandNumber: true },
        });

        const nextDemandNumber = lastDemand?.demandNumber
          ? lastDemand.demandNumber + 1
          : 1000000;

        // Ensure it's 7 digits (should be between 1000000 and 9999999)
        if (nextDemandNumber > 9999999) {
          throw new AppError("Talep numarası limitine ulaşıldı", 500);
        }

        return await tx.demand.create({
          data: {
            userId: req.userId!,
            categoryId: categoryRecord.id,
            title,
            description: '', // Boş string olarak ayarla (zorunlu alan)
            location: address || location || null,
            latitude: latitude ? parseFloat(latitude.toString()) : null,
            longitude: longitude ? parseFloat(longitude.toString()) : null,
            images: Array.isArray(images) ? images : [],
            peopleCount: peopleCount ? parseInt(peopleCount.toString()) : null,
            eventDate: parsedEventDate,
            eventTime: eventTime || null,
            isUrgent: false, // Varsayılan değer
            deadline: deadline || null,
            address: address || null,
            questionResponses: questionResponses || null,
            countie: countie || null,
            demandNumber: nextDemandNumber,
            isApproved: false, // Admin onayı bekliyor
            cities: {
              create: processedCityIds.map((cityId: string) => ({
                cityId,
              })),
            },
          } as any,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                profileImage: true,
                rating: true,
              },
            },
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
              },
            },
          },
        });
      });

      res.status(201).json({
        success: true,
        message: "Talep başarıyla oluşturuldu",
        data: demand,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update demand
router.put(
  "/:id",
  authenticate,
  authorizeReceiver,
  [
    body("title").optional().isString().isLength({ min: 3, max: 200 }),
    body("category").optional().isString(), // Can be category ID or name
    body("location").optional().isString(),
    body("latitude").optional().isFloat(),
    body("longitude").optional().isFloat(),
    body("images").optional().isArray(),
    body("status")
      .optional()
      .isIn(["ACTIVE", "CLOSED", "COMPLETED", "CANCELLED"]),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const demand = await prisma.demand.findUnique({
        where: { id: req.params.id },
      });

      if (!demand) {
        throw new AppError("Demand not found", 404);
      }

      if (demand.userId !== req.userId) {
        throw new AppError("You are not authorized to update this demand", 403);
      }

      const updateData: any = { ...req.body };

      // Handle category update
      if (req.body.category) {
        const categoryRecord = await prisma.category.findFirst({
          where: {
            OR: [{ id: req.body.category }, { name: req.body.category }],
            isActive: true,
          },
        });

        if (!categoryRecord) {
          throw new AppError("Kategori bulunamadı", 404);
        }

        updateData.categoryId = categoryRecord.id;
        delete updateData.category;
      }

      const updatedDemand = await prisma.demand.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              profileImage: true,
              rating: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
            },
          },
        },
      });

      res.json({
        success: true,
        message: "Demand updated successfully",
        data: updatedDemand,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete demand
router.delete(
  "/:id",
  authenticate,
  authorizeReceiver,
  async (req: AuthRequest, res, next) => {
    try {
      const demand = await prisma.demand.findUnique({
        where: { id: req.params.id },
      });

      if (!demand) {
        throw new AppError("Demand not found", 404);
      }

      if (demand.userId !== req.userId) {
        throw new AppError("You are not authorized to delete this demand", 403);
      }

      await prisma.demand.delete({
        where: { id: req.params.id },
      });

      res.json({
        success: true,
        message: "Demand deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get user's demands
router.get("/user/me", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const demands = await prisma.demand.findMany({
      where: {
        userId: req.userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profileImage: true,
            rating: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
        _count: {
          select: {
            offers: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      data: {
        demands,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get user's public demands (for profile)
router.get("/user/:id", async (req, res, next) => {
  try {
    const demands = await prisma.demand.findMany({
      where: {
        userId: req.params.id,
        isApproved: true,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
        _count: {
          select: {
            offers: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    res.json({
      success: true,
      data: demands,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
