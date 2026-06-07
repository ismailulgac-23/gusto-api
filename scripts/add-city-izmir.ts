import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const city = await prisma.city.upsert({
    where: { name: "İzmir" },
    update: { isActive: true },
    create: { name: "İzmir", isActive: true },
  });

  console.log(`✅ İzmir hazır: ${city.name} (${city.id}) - aktif: ${city.isActive}`);

  const total = await prisma.city.count();
  const active = await prisma.city.count({ where: { isActive: true } });
  console.log(`Toplam şehir: ${total} | Aktif şehir: ${active}`);
}

main()
  .catch((error) => {
    console.error("❌ İzmir ekleme hatası:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
