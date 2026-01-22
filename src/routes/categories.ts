import { NextFunction, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Get all categories with questions (only root categories by default, or all if includeChildren=true)
router.get('/', async (req, res, next) => {
  try {
    const includeChildren = req.query.includeChildren === 'true';
    const parentId = req.query.parentId as string | undefined;
    const onlyRoot = req.query.onlyRoot === 'true';

    let where: any = {};
    
    if (parentId) {
      where.parentId = parentId;
    } else if (onlyRoot) {
      where.parentId = null;
    }
    // If onlyRoot is false and no parentId, get all categories (no where filter)

    // Recursive function to get all children
    const getCategoryWithChildren = async (category: any): Promise<any> => {
      const children = await prisma.category.findMany({
        where: {
          parentId: category.id,
          isActive: true,
        },
        orderBy: { name: 'asc' },
      });

      if (includeChildren && children.length > 0) {
        const childrenWithSubChildren = await Promise.all(
          children.map(child => getCategoryWithChildren(child))
        );
        return {
          ...category,
          children: childrenWithSubChildren,
        };
      } else if (includeChildren) {
        return {
          ...category,
          children: [],
        };
      }
      return category;
    };

    const categories = await prisma.category.findMany({
      where,
      orderBy: {
        rank: "asc"
      }
    });

    // If includeChildren is true, recursively load all children
    let categoriesWithChildren = categories;
    if (includeChildren) {
      categoriesWithChildren = await Promise.all(
        categories.map(cat => getCategoryWithChildren(cat))
      );
    }

    console.log('categoriesWithChildren',categoriesWithChildren);
    

    res.json({
      success: true,
      data: categoriesWithChildren,
    });
  } catch (error) {
    next(error);
  }
});

// Get single category with questions and children
router.get('/:id', async (req, res, next) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
        children: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Kategori bulunamadı',
      });
    }

    res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    next(error);
  }
});

// Get children of a category
router.get('/:id/children', async (req, res, next) => {
  try {
    const children = await prisma.category.findMany({
      where: {
        parentId: req.params.id,
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json({
      success: true,
      data: children,
    });
  } catch (error) {
    next(error);
  }
});

// Create category (Admin only)
router.post(
  '/',
  authenticate,
  [
    body('name').isString().isLength({ min: 1, max: 100 }).withMessage('Kategori adı 1-100 karakter arasında olmalıdır'),
    body('icon').optional().isString(),
    body('isActive').optional().isBoolean(),
    body('questions').optional(),
    body('parentId').optional().isUUID().withMessage('Geçersiz üst kategori ID'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const { name, icon, isActive = true, questions, parentId } = req.body;

      // Check if category already exists
      const existingCategory = await prisma.category.findUnique({
        where: { name },
      });

      if (existingCategory) {
        throw new AppError('Bu kategori adı zaten kullanılıyor', 400);
      }

      // Validate parent if provided
      if (parentId) {
        const parent = await prisma.category.findUnique({
          where: { id: parentId },
        });
        if (!parent) {
          throw new AppError('Üst kategori bulunamadı', 404);
        }
      }

      const category = await prisma.category.create({
        data: {
          name,
          icon: icon || null,
          isActive,
          questions: questions || null,
          parentId: parentId || null,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Kategori başarıyla oluşturuldu',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update category (Admin only)
router.patch(
  '/:id',
  authenticate,
  [
    body('name').optional().isString().isLength({ min: 1, max: 100 }),
    body('icon').optional().isString(),
    body('isActive').optional().isBoolean(),
    body('questions').optional(),
    body('parentId').optional().isUUID().withMessage('Geçersiz üst kategori ID'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 400);
      }

      const { name, icon, isActive, questions, parentId } = req.body;

      const category = await prisma.category.findUnique({
        where: { id: req.params.id },
      });

      if (!category) {
        throw new AppError('Kategori bulunamadı', 404);
      }

      // Check if name is being changed and if it already exists
      if (name && name !== category.name) {
        const existingCategory = await prisma.category.findUnique({
          where: { name },
        });

        if (existingCategory) {
          throw new AppError('Bu kategori adı zaten kullanılıyor', 400);
        }
      }

      // Validate parent if provided
      if (parentId !== undefined) {
        if (parentId === category.id) {
          throw new AppError('Kategori kendi alt kategorisi olamaz', 400);
        }
        if (parentId) {
          const parent = await prisma.category.findUnique({
            where: { id: parentId },
          });
          if (!parent) {
            throw new AppError('Üst kategori bulunamadı', 404);
          }
          // Check for circular reference
          let currentParent = parent;
          while (currentParent.parentId) {
            if (currentParent.parentId === category.id) {
              throw new AppError('Döngüsel referans oluşturamazsınız', 400);
            }
            currentParent = await prisma.category.findUnique({
              where: { id: currentParent.parentId },
            }) as any;
            if (!currentParent) break;
          }
        }
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (icon !== undefined) updateData.icon = icon;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (questions !== undefined) updateData.questions = questions;
      if (parentId !== undefined) updateData.parentId = parentId || null;

      const updatedCategory = await prisma.category.update({
        where: { id: req.params.id },
        data: updateData,
      });

      res.json({
        success: true,
        message: 'Kategori başarıyla güncellendi',
        data: updatedCategory,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete category (Admin only)
router.delete('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: {
            demands: true,
            users: true,
            charityActivities: true,
          },
        },
      },
    });

    if (!category) {
      throw new AppError('Kategori bulunamadı', 404);
    }

    // Check if category is being used or has children
    const childrenCount = await prisma.category.count({
      where: { parentId: category.id },
    });

    if (category._count.demands > 0 || category._count.users > 0 || category._count.charityActivities > 0 || childrenCount > 0) {
      throw new AppError('Bu kategori kullanıldığı veya alt kategorileri olduğu için silinemez', 400);
    }

    await prisma.category.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      message: 'Kategori başarıyla silindi',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
