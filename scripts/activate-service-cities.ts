import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ACTIVE_CITY_NAMES = [
  "İzmir",
  "Aydın",
  "Uşak",
  "Kütahya",
  "Afyon",
  "Denizli",
  "Muğla",
  "Çanakkale",
  "Balıkesir",
  "Bursa",
  "Bilecik",
] as const;

async function main() {
  console.log("🏙️ Aktif hizmet şehirleri güncelleniyor...");

  const activeCitySet = new Set(ACTIVE_CITY_NAMES);

  await prisma.city.updateMany({
    where: {
      name: {
        notIn: [...activeCitySet],
      },
    },
    data: {
      isActive: false,
    },
  });

  for (const cityName of ACTIVE_CITY_NAMES) {
    const city = await prisma.city.upsert({
      where: { name: cityName },
      update: { isActive: true },
      create: {
        name: cityName,
        isActive: true,
      },
    });

    console.log(`✅ Aktif: ${city.name} (${city.id})`);
  }

  const activeCities = await prisma.city.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
    },
  });

  console.log("");
  console.log(`Toplam aktif şehir: ${activeCities.length}`);
  for (const city of activeCities) {
    console.log(`- ${city.name} (${city.id})`);
  }
}

main()
  .catch((error) => {
    console.error("❌ Aktif şehir güncelleme hatası:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
