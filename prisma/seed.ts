import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data
  console.log('🧹 Clearing existing data...');
  await prisma.charityActivity.deleteMany();
  await prisma.review.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.demand.deleteMany();
  await prisma.userCategory.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.city.deleteMany();
  console.log('  ✅ Existing data cleared');

  // Create Cities
  console.log('🏙️ Creating cities...');
  const izmir = await prisma.city.upsert({
    where: { name: 'İzmir' },
    update: { isActive: true },
    create: {
      name: 'İzmir',
      isActive: true,
    },
  });
  console.log(`  ✅ Created city: İzmir (${izmir.id})`);

  const manisa = await prisma.city.upsert({
    where: { name: 'Manisa' },
    update: { isActive: true },
    create: {
      name: 'Manisa',
      isActive: true,
    },
  });
  console.log(`  ✅ Created city: Manisa (${manisa.id})`);

  // Create Categories with hierarchy
  console.log('📦 Creating categories...');
  const categoryMap = new Map<string, string>();

  // Define parent categories based on the image
  const parentCategories = [
    { id: 'lokma', name: 'Lokma', icon: '🍩' },
    { id: 'toplu_yemek', name: 'Toplu Yemek', icon: '🍽️' },
    { id: 'catering', name: 'Catering', icon: '🥘' },
    { id: 'tavuk_pilav', name: 'Tavuk Pilav', icon: '🍗' },
    { id: 'organizasyonlar', name: 'Organizasyonlar', icon: '🎉' },
    { id: 'pastaneler', name: 'Pastaneler', icon: '🎂' },
    { id: 'pideciler', name: 'Pideciler', icon: '🥖' },
  ];

  // Create parent categories
  for (const parentCat of parentCategories) {
    const category = await prisma.category.upsert({
      where: { name: parentCat.name },
      update: {
        icon: parentCat.icon,
        isActive: true,
        parentId: null,
      },
      create: {
        name: parentCat.name,
        icon: parentCat.icon,
        isActive: true,
        parentId: null,
      },
    });
    categoryMap.set(parentCat.id, category.id);
    console.log(`  ✅ Created parent category: ${parentCat.name} (${category.id})`);
  }

  // Define child categories based on the image
  const childCategoriesMap: { [key: string]: Array<{ id: string; name: string; icon: string }> } = {
    lokma: [
      { id: 'izmir_lokma', name: 'İzmir Lokma', icon: '🍩' },
      { id: 'saray_lokma', name: 'Saray Lokma', icon: '🍩' },
    ],
    toplu_yemek: [
      { id: 'dugun_yemegi', name: 'Düğün Yemeği', icon: '🍽️' },
      { id: 'iftar_yemegi', name: 'İftar Yemeği', icon: '🍽️' },
      { id: 'mevlit_yemegi', name: 'Mevlüt Yemeği', icon: '🍽️' },
      { id: 'sunnnet_yemegi', name: 'Sünnet Yemeği', icon: '🍽️' },
      { id: 'tabildot', name: 'Tabildot', icon: '🍽️' },
    ],
    catering: [
      { id: 'isyeri_personel_yemegi', name: 'İşyeri Personel Yemeği', icon: '🥘' },
      { id: 'nisan_ikramliklari', name: 'Nişan ikramlıkları', icon: '🥘' },
      { id: 'nisan_menusu', name: 'Nişan menüsü', icon: '🥘' },
      { id: 'dugun_catering', name: 'Düğün', icon: '🥘' },
      { id: 'davet_catering', name: 'Davet', icon: '🥘' },
      { id: 'kokteyl', name: 'Kokteyl', icon: '🥘' },
      { id: 'dogum_gunu_catering', name: 'Doğum günü', icon: '🥘' },
      { id: 'mevlit_yemegi_catering', name: 'Mevlüt yemeği', icon: '🥘' },
      { id: 'iftar_yemegi_catering', name: 'İftar yemeği', icon: '🥘' },
      { id: 'aksam_yemegi', name: 'Akşam yemeği', icon: '🥘' },
      { id: 'diger_catering', name: 'Diğer', icon: '🥘' },
    ],
    tavuk_pilav: [
      { id: 'tavuklu_pilav', name: 'Tavuklu Pilav', icon: '🍗' },
      { id: 'etli_pilav', name: 'Etli Pilav', icon: '🍗' },
      { id: 'nohutlu_pilav', name: 'Nohutlu Pilav', icon: '🍗' },
      { id: 'sade_pilav', name: 'Sade Pilav', icon: '🍗' },
      { id: 'kavurmali_pilav', name: 'Kavurmalı Pilav', icon: '🍗' },
    ],
    organizasyonlar: [
      { id: 'evlilik_teklifi_organizasyon', name: 'Evlilik Teklifi Organizasyon', icon: '🎉' },
      { id: 'soz_organizasyon', name: 'Söz Organizasyon', icon: '🎉' },
      { id: 'nisan_organizasyon', name: 'Nişan Organizasyon', icon: '🎉' },
      { id: 'kina_organizasyon', name: 'Kına organizasyon', icon: '🎉' },
      { id: 'dugun_organizasyon', name: 'Düğün Organizasyon', icon: '🎉' },
      { id: 'dogum_gunu_organizasyonu', name: 'Doğum Günü Organizasyonu', icon: '🎉' },
      { id: 'sunnnet_organizasyon', name: 'Sünnet Organizasyon', icon: '🎉' },
      { id: 'acilis_organizasyonu', name: 'Açılış Organizasyonu', icon: '🎉' },
      { id: 'nikah_organizasyon', name: 'Nikah Organizasyon', icon: '🎉' },
      { id: 'eglence_organizasyon', name: 'Eğlence Organizasyon', icon: '🎉' },
      { id: 'parti_organizasyon', name: 'Parti Organizasyon', icon: '🎉' },
      { id: 'bekarliga_veda_partisi_organizasyon', name: 'Bekarlığa Veda Partisi Organizasyon', icon: '🎉' },
      { id: 'cinsiyet_partisi_organizasyon', name: 'Cinsiyet Partisi Organizasyon', icon: '🎉' },
      { id: 'yilbasi_organizasyon', name: 'Yılbaşı Organizasyon', icon: '🎉' },
      { id: 'yemek_organizasyon', name: 'Yemek Organizasyon', icon: '🎉' },
      { id: 'evlilik_yildonumu_organizasyon', name: 'Evlilik Yıldönümü Organizasyon', icon: '🎉' },
      { id: 'kamp_organizasyon', name: 'Kamp Organizasyon', icon: '🎉' },
      { id: 'mezuniyet_organizasyonu', name: 'Mezuniyet Organizasyonu', icon: '🎉' },
      { id: 'davet_organizasyon', name: 'Davet Organizasyon', icon: '🎉' },
      { id: 'muzik_organizasyonu', name: 'Müzik Organizasyonu', icon: '🎉' },
      { id: 'konser_organizasyon', name: 'Konser Organizasyon', icon: '🎉' },
      { id: 'piknik_organizasyon', name: 'Piknik Organizasyon', icon: '🎉' },
      { id: 'fuar_organizasyon', name: 'Fuar Organizasyon', icon: '🎉' },
      { id: 'tur_organizasyon', name: 'Tur Organizasyon', icon: '🎉' },
      { id: 'susleme_organizasyon', name: 'Süsleme Organizasyon', icon: '🎉' },
      { id: 'etkinlik_organizasyonu', name: 'Etkinlik Organizasyonu', icon: '🎉' },
      { id: 'kongre_organizasyon', name: 'Kongre Organizasyon', icon: '🎉' },
      { id: 'dis_bugdayi_organizasyon', name: 'Diş Buğdayı Organizasyon', icon: '🎉' },
      { id: 'lansman_organizasyon', name: 'Lansman Organizasyon', icon: '🎉' },
      { id: 'tanitim_organizasyon', name: 'Tanıtım Organizasyon', icon: '🎉' },
      { id: 'toplanti_organizasyon', name: 'Toplantı Organizasyon', icon: '🎉' },
      { id: 'kurumsal_etkinlik_organizasyon', name: 'Kurumsal Etkinlik Organizasyon', icon: '🎉' },
      { id: 'baby_shower_organizasyon', name: 'Baby Shower Organizasyon', icon: '🎉' },
      { id: 'havai_fisek_organizasyon', name: 'Havai Fişek Organizasyon', icon: '🎉' },
      { id: 'diger_organizasyon', name: 'Diğer', icon: '🎉' },
    ],
    pastaneler: [
      { id: 'dogum_gunu_pastasi', name: 'Doğum Günü Pastası', icon: '🎂' },
      { id: 'butik_pasta', name: 'Butik Pasta', icon: '🎂' },
      { id: 'yazili_pasta', name: 'Yazılı Pasta', icon: '🎂' },
      { id: 'yas_pasta', name: 'Yaş Pasta', icon: '🎂' },
      { id: 'soz_pastasi', name: 'Söz Pastası', icon: '🎂' },
      { id: 'nisan_pastasi', name: 'Nişan Pastası', icon: '🎂' },
      { id: 'dugun_pastasi', name: 'Düğün Pastası', icon: '🎂' },
      { id: 'resimli_pasta', name: 'Resimli Pasta', icon: '🎂' },
      { id: 'seher_hamuru_pasta', name: 'Şeher Hamuru Pasta', icon: '🎂' },
      { id: 'kuru_pasta', name: 'Kuru Pasta', icon: '🎂' },
      { id: 'glutensiz_pasta', name: 'Gulutensiz Pasta', icon: '🎂' },
      { id: 'maket_pasta', name: 'Maket Pasta', icon: '🎂' },
      { id: 'diger_pasta', name: 'Diğer', icon: '🎂' },
    ],
    pideciler: [
      { id: 'pide', name: 'Pide', icon: '🥖' },
      { id: 'lahmacun', name: 'Lahmacun', icon: '🥖' },
    ],
  };

  // Create child categories
  for (const [parentId, childCats] of Object.entries(childCategoriesMap)) {
    const parentCategoryId = categoryMap.get(parentId);
    if (!parentCategoryId) continue;

    for (const childCat of childCats) {
      const category = await prisma.category.upsert({
        where: { name: childCat.name },
        update: {
          icon: childCat.icon,
          isActive: true,
          parentId: parentCategoryId,
        },
        create: {
          name: childCat.name,
          icon: childCat.icon,
          isActive: true,
          parentId: parentCategoryId,
        },
      });
      categoryMap.set(childCat.id, category.id);
      console.log(`  ✅ Created child category: ${childCat.name} (${category.id}) under ${parentCategories.find(p => p.id === parentId)?.name}`);
    }
  }

  // Create Admin User
  console.log('👤 Creating admin user...');
  const admin = await prisma.user.upsert({
    where: { phoneNumber: '+905551111111' },
    update: {},
    create: {
      phoneNumber: '+905551111111',
      name: 'Admin',
      email: 'admin@example.com',
      password: '$2b$10$rOzJqJqJqJqJqJqJqJqJqO', // You should hash this properly
      userType: 'RECEIVER',
      isAdmin: true,
      location: 'İzmir, Türkiye',
      profileImage: 'https://i.pravatar.cc/150?img=1',
      cityId: izmir.id,
    },
  });
  console.log(`  ✅ Created admin user: ${admin.name} (${admin.id})`);

  // Create Fake User
  console.log('👤 Creating fake user...');
  const fakeUser = await prisma.user.upsert({
    where: { phoneNumber: '+905552222222' },
    update: {},
    create: {
      phoneNumber: '+905552222222',
      name: 'Test Kullanıcı',
      email: 'test@example.com',
      userType: 'RECEIVER',
      location: 'İzmir, Türkiye',
      profileImage: 'https://i.pravatar.cc/150?img=2',
      cityId: izmir.id,
    },
  });
  console.log(`  ✅ Created fake user: ${fakeUser.name} (${fakeUser.id})`);

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
