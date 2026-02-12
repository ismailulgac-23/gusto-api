import { PrismaClient, UserType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Banka hesapları ve fatura ayarları seed işlemi başlatılıyor...");

    // Sadece PROVIDER (Hizmet Veren) kullanıcıları çekiyoruz
    const providers = await prisma.user.findMany({
        where: { userType: UserType.PROVIDER }
    });

    if (providers.length === 0) {
        console.log("❌ Seed yapılacak Hizmet Veren (PROVIDER) kullanıcı bulunamadı.");
        return;
    }

    const banks = [
        { name: "Garanti BBVA", color: "Yeşil" },
        { name: "Akbank", color: "Kırmızı" },
        { name: "İş Bankası", color: "Mavi" },
        { name: "Ziraat Bankası", color: "Ziraat" },
        { name: "Yapı Kredi", color: "Mavi" }
    ];

    for (const user of providers) {
        console.log(`📦 İşlem yapılıyor: ${user.name}`);

        // 1. Banka Hesabı (Varsayılan)
        await prisma.bankAccount.create({
            data: {
                userId: user.id,
                accountName: "Ana Maaş Hesabı",
                bankName: banks[Math.floor(Math.random() * banks.length)].name,
                iban: `TR${Math.floor(Math.random() * 90 + 10)} 0006 2000 0000 ${Math.floor(Math.random() * 8999 + 1000)} ${Math.floor(Math.random() * 8999 + 1000)} 01`,
                accountHolder: user.name || "İsimsiz Kullanıcı",
                isDefault: true
            }
        });

        // 2. Banka Hesabı (Yedek)
        await prisma.bankAccount.create({
            data: {
                userId: user.id,
                accountName: "Şahıs Şirketi Hesabı",
                bankName: banks[Math.floor(Math.random() * banks.length)].name,
                iban: `TR${Math.floor(Math.random() * 90 + 10)} 0006 2000 0000 ${Math.floor(Math.random() * 8999 + 1000)} ${Math.floor(Math.random() * 8999 + 1000)} 99`,
                accountHolder: user.name || "İsimsiz Kullanıcı",
                isDefault: false
            }
        });

        // 3. Fatura Ayarları
        const isCorporate = Math.random() > 0.5;
        await prisma.invoiceSettings.upsert({
            where: { userId: user.id },
            update: {},
            create: {
                userId: user.id,
                isCorporate: isCorporate,
                companyName: isCorporate ? `${user.name} Ltd. Şti.` : user.name,
                taxOffice: isCorporate ? "Zincirlikuyu Vergi Dairesi" : "Üsküdar Vergi Dairesi",
                taxNumber: Math.floor(Math.random() * 9000000000 + 1000000000).toString(),
                billingAddress: user.location || "İstanbul, Türkiye"
            }
        });
    }

    console.log("✅ Seed işlemi başarıyla tamamlandı!");
}

main()
    .catch((e) => {
        console.error("❌ Hata:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
