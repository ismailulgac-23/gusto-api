import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import bcryptjs from "bcryptjs";
import * as fs from "fs";
import * as path from "path";
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // Clear existing data
  console.log("🧹 Clearing existing data...");
  await prisma.charityActivity.deleteMany();
  await prisma.review.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.demand.deleteMany();
  await prisma.userCategory.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.city.deleteMany();
  console.log("  ✅ Existing data cleared");

  // Create Cities
  console.log("🏙️ Creating cities...");
  const izmir = await prisma.city.upsert({
    where: { name: "İzmir" },
    update: { isActive: true },
    create: {
      name: "İzmir",
      isActive: true,
    },
  });
  console.log(`  ✅ Created city: İzmir (${izmir.id})`);

  const manisa = await prisma.city.upsert({
    where: { name: "Manisa" },
    update: { isActive: true },
    create: {
      name: "Manisa",
      isActive: true,
    },
  });
  console.log(`  ✅ Created city: Manisa (${manisa.id})`);

  // Create Categories from JSON file
  console.log("📦 Creating categories from JSON file...");
  
  // Read categories from JSON file
  const categoriesPath = path.join(__dirname, "categories.json");
  const categoriesData = JSON.parse(fs.readFileSync(categoriesPath, "utf8"));
  
  // Create a map to track created categories by their original ID
  const categoryIdMap = new Map<string, string>();
  
  // First pass: Create all categories without parent relationships
  for (const categoryData of categoriesData) {
    const category = await prisma.category.upsert({
      where: { name: categoryData.name },
      update: {
        icon: categoryData.icon,
        isActive: categoryData.isActive,
        questions: categoryData.questions,
        commissionRate: categoryData.commissionRate,
        parentId: null, // Will be set in second pass
      },
      create: {
        name: categoryData.name,
        icon: categoryData.icon,
        isActive: categoryData.isActive,
        questions: categoryData.questions,
        commissionRate: categoryData.commissionRate,
        parentId: null, // Will be set in second pass
      },
    });
    
    categoryIdMap.set(categoryData.id, category.id);
    console.log(`  ✅ Created category: ${categoryData.name} (${category.id})`);
  }
  
  // Second pass: Update parent relationships
  for (const categoryData of categoriesData) {
    if (categoryData.parentId) {
      const newCategoryId = categoryIdMap.get(categoryData.id);
      const newParentId = categoryIdMap.get(categoryData.parentId);
      
      if (newCategoryId && newParentId) {
        await prisma.category.update({
          where: { id: newCategoryId },
          data: { parentId: newParentId },
        });
        console.log(`  ✅ Updated parent relationship: ${categoryData.name} -> parent`);
      }
    }
  }

  // Create Admin User
  console.log("👤 Creating admin user...");
  const admin = await prisma.user.upsert({
    where: { phoneNumber: "+905551111111" },
    update: {},
    create: {
      phoneNumber: "+905551111111",
      name: "Admin",
      email: "admin@admin.com",
      password: await bcryptjs.hashSync("admin123", 10),
      userType: "RECEIVER",
      isAdmin: true,
      location: "İzmir, Türkiye",
      profileImage: "https://i.pravatar.cc/150?img=1",
      cityId: izmir.id,
    },
  });
  console.log(`  ✅ Created admin user: ${admin.name} (${admin.id})`);

  // Create Fake User
  console.log("👤 Creating fake user...");
  const fakeUser = await prisma.user.upsert({
    where: { phoneNumber: "+905552222222" },
    update: {},
    create: {
      phoneNumber: "+905552222222",
      name: "Test Kullanıcı",
      email: "test@example.com",
      password: await bcryptjs.hashSync("test123", 10),
      userType: "RECEIVER",
      location: "İzmir, Türkiye",
      profileImage: "https://i.pravatar.cc/150?img=2",
      cityId: izmir.id,
    },
  });
  console.log(`  ✅ Created fake user: ${fakeUser.name} (${fakeUser.id})`);

  console.log("🎉 Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
