import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// App Store inceleme + QA için iki kapsamlı test hesabı.
// Sabit OTP: 123456 (bkz. src/services/sms.service.ts -> TEST_OTP_PHONES)
// Aynı şehir/ilçe ve eşleşen kategorilerle oluşturulur; böylece RECEIVER bir
// talep açtığında PROVIDER bunu görüp teklif verebilir.

const RECEIVER_PHONE = '+5555555555';
const PROVIDER_PHONE = '+6666666666';
const TEST_DISTRICT = 'Kadıköy';

async function pickCity() {
  // Aktif bir şehir tercih et; yoksa ilkini aktif et.
  let city =
    (await prisma.city.findFirst({ where: { isActive: true, name: 'İstanbul' } })) ||
    (await prisma.city.findFirst({ where: { isActive: true } }));

  if (!city) {
    city =
      (await prisma.city.findFirst({ where: { name: 'İstanbul' } })) ||
      (await prisma.city.findFirst());
    if (city && !city.isActive) {
      city = await prisma.city.update({ where: { id: city.id }, data: { isActive: true } });
    }
  }

  if (!city) {
    throw new Error('Veritabanında hiç şehir bulunamadı. Önce şehirleri seed edin.');
  }
  return city;
}

async function upsertUser(opts: {
  phone: string;
  userType: 'RECEIVER' | 'PROVIDER';
  name: string;
  email: string;
  companyName?: string;
  cityId: string;
  address: string;
}) {
  const data = {
    phoneNumber: opts.phone,
    userType: opts.userType as any,
    name: opts.name,
    email: opts.email,
    companyName: opts.companyName || null,
    cityId: opts.cityId,
    address: opts.address,
    location: 'İstanbul',
    bio:
      opts.userType === 'PROVIDER'
        ? 'GustoApp test firması — lokma, pilav, helva, aşure ve yemek organizasyonu hizmetleri.'
        : 'GustoApp test müşterisi.',
    isActive: true,
    balance: 5000,
    rating: opts.userType === 'PROVIDER' ? 4.9 : 5.0,
    ratingCount: opts.userType === 'PROVIDER' ? 124 : 8,
    completedJobs: opts.userType === 'PROVIDER' ? 213 : 0,
    memberSince: '2025',
    responseTime: '~10 dk',
  };

  const user = await prisma.user.upsert({
    where: { phoneNumber: opts.phone },
    update: data as any,
    create: data as any,
  });
  return user;
}

async function main() {
  const city = await pickCity();
  console.log(`📍 Şehir: ${city.name} (${city.id})  ilçe: ${TEST_DISTRICT}`);

  const categories = await prisma.category.findMany({ where: { isActive: true } });
  console.log(`🗂️  ${categories.length} aktif kategori bulundu.`);

  // RECEIVER (hizmet alan)
  const receiver = await upsertUser({
    phone: RECEIVER_PHONE,
    userType: 'RECEIVER',
    name: 'Test Müşteri',
    email: 'test.musteri@gustoapp.net',
    cityId: city.id,
    address: `${TEST_DISTRICT}, ${city.name}`,
  });
  console.log(`✅ RECEIVER: ${receiver.phoneNumber} (${receiver.id})`);

  // PROVIDER (hizmet veren) — tüm kategorilerde hizmet versin ki tüm talepleri görsün
  const provider = await upsertUser({
    phone: PROVIDER_PHONE,
    userType: 'PROVIDER',
    name: 'Test Usta',
    email: 'test.usta@gustoapp.net',
    companyName: 'GustoApp Test İkram & Organizasyon',
    cityId: city.id,
    address: `${TEST_DISTRICT}, ${city.name}`,
  });
  console.log(`✅ PROVIDER: ${provider.phoneNumber} (${provider.id})`);

  // Provider'ın kategori bağlantılarını sıfırla ve tüm aktif kategorilere bağla
  await prisma.userCategory.deleteMany({ where: { userId: provider.id } });
  if (categories.length > 0) {
    await prisma.userCategory.createMany({
      data: categories.map((c) => ({ userId: provider.id, categoryId: c.id })),
      skipDuplicates: true,
    });
  }
  console.log(`🔗 PROVIDER ${categories.length} kategoriye bağlandı.`);

  console.log('\n🎉 Test hesapları hazır:');
  console.log(`   • Hizmet Alan  : 5555555555  / OTP 123456  (${city.name}, ${TEST_DISTRICT})`);
  console.log(`   • Hizmet Veren : 6666666666  / OTP 123456  (${city.name}, ${TEST_DISTRICT}, tüm kategoriler)`);
}

main()
  .catch((e) => {
    console.error('❌ Hata:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
