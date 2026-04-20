import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Dinamik uygulama verileri temizleniyor...");
  console.log("Korunan sabit veriler: categories, cities");

  const countsBefore = await Promise.all([
    prisma.paymentNotification.count(),
    prisma.invoiceSettings.count(),
    prisma.bankAccount.count(),
    prisma.transaction.count(),
    prisma.review.count(),
    prisma.notification.count(),
    prisma.offer.count(),
    prisma.demandCity.count(),
    prisma.demand.count(),
    prisma.charityActivity.count(),
    prisma.userCategory.count(),
    prisma.user.count(),
  ]);

  console.log("Silinecek kayıt adetleri:");
  console.log(`- payment_notifications: ${countsBefore[0]}`);
  console.log(`- invoice_settings: ${countsBefore[1]}`);
  console.log(`- bank_accounts: ${countsBefore[2]}`);
  console.log(`- transactions: ${countsBefore[3]}`);
  console.log(`- reviews: ${countsBefore[4]}`);
  console.log(`- notifications: ${countsBefore[5]}`);
  console.log(`- offers: ${countsBefore[6]}`);
  console.log(`- demand_cities: ${countsBefore[7]}`);
  console.log(`- demands: ${countsBefore[8]}`);
  console.log(`- charity_activities: ${countsBefore[9]}`);
  console.log(`- user_categories: ${countsBefore[10]}`);
  console.log(`- users: ${countsBefore[11]}`);

  await prisma.$transaction([
    prisma.paymentNotification.deleteMany(),
    prisma.invoiceSettings.deleteMany(),
    prisma.bankAccount.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.review.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.offer.deleteMany(),
    prisma.demandCity.deleteMany(),
    prisma.demand.deleteMany(),
    prisma.charityActivity.deleteMany(),
    prisma.userCategory.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  console.log("✅ Dinamik veriler temizlendi.");
  console.log("Sabit veriler korundu: categories, cities");
}

main()
  .catch((error) => {
    console.error("❌ Dinamik veri sıfırlama hatası:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
