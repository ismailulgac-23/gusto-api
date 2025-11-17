import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { categories } from '../src/data/categories';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

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

  // Define parent categories - All related to charity and food services
  const parentCategories = [
    { id: 'catering', name: 'Catering Hizmetleri', icon: '🍲' },
    { id: 'hayir_yemek', name: 'Hayır Yemekleri', icon: '🍲' },
    { id: 'toplu_yemek', name: 'Toplu Yemek', icon: '🍲' },
    { id: 'ozel_gun', name: 'Özel Gün Yemekleri', icon: '🍲' },
    { id: 'mevlit_catering', name: 'Mevlit Catering', icon: '🍲' },
    { id: 'iftar_catering', name: 'İftar Catering', icon: '🍲' },
  ];

  // Create parent categories
  for (const parentCat of parentCategories) {
    const catData = categories.find(c => c.id === parentCat.id);
    const category = await prisma.category.upsert({
      where: { name: parentCat.name },
      update: {
        icon: parentCat.icon,
        questions: catData?.questions as any || null,
        isActive: true,
        parentId: null,
      },
      create: {
        name: parentCat.name,
        icon: parentCat.icon,
        questions: catData?.questions as any || null,
        isActive: true,
        parentId: null,
      },
    });
    categoryMap.set(parentCat.id, category.id);
    console.log(`  ✅ Created parent category: ${parentCat.name} (${category.id})`);
  }

  // Define child categories for each parent - All related to charity and food services
  const childCategoriesMap: { [key: string]: Array<{ id: string; name: string; icon: string }> } = {
    catering: [
      { id: 'pilav', name: 'Pilav', icon: '🍲' },
      { id: 'lokma', name: 'Lokma', icon: '🍲' },
      { id: 'helva', name: 'Helva', icon: '🍲' },
      { id: 'asure', name: 'Aşure', icon: '🍲' },
      { id: 'borek', name: 'Börek', icon: '🍲' },
      { id: 'corba', name: 'Çorba', icon: '🍲' },
    ],
    hayir_yemek: [
      { id: 'cuma_yemegi', name: 'Cuma Yemeği', icon: '🍲' },
      { id: 'mevlit_yemegi', name: 'Mevlit Yemeği', icon: '🍲' },
      { id: 'hayir_pilav', name: 'Hayır Pilavı', icon: '🍲' },
      { id: 'hayir_lokma', name: 'Hayır Lokması', icon: '🍲' },
      { id: 'hayir_helva', name: 'Hayır Helvası', icon: '🍲' },
      { id: 'hayir_asure', name: 'Hayır Aşuresi', icon: '🍲' },
    ],
    toplu_yemek: [
      { id: 'toplu_pilav', name: 'Toplu Pilav', icon: '🍲' },
      { id: 'toplu_corba', name: 'Toplu Çorba', icon: '🍲' },
      { id: 'toplu_ana_yemek', name: 'Toplu Ana Yemek', icon: '🍲' },
      { id: 'toplu_tatli', name: 'Toplu Tatlı', icon: '🍲' },
      { id: 'toplu_ikram', name: 'Toplu İkram', icon: '🍲' },
    ],
    ozel_gun: [
      { id: 'dugun_yemek', name: 'Düğün Yemeği', icon: '🍲' },
      { id: 'sunnnet_yemek', name: 'Sünnet Yemeği', icon: '🍲' },
      { id: 'acilis_yemek', name: 'Açılış Yemeği', icon: '🍲' },
      { id: 'anma_yemek', name: 'Anma Yemeği', icon: '🍲' },
      { id: 'kutlama_yemek', name: 'Kutlama Yemeği', icon: '🍲' },
    ],
    mevlit_catering: [
      { id: 'mevlit_pilav', name: 'Mevlit Pilavı', icon: '🍲' },
      { id: 'mevlit_lokma', name: 'Mevlit Lokması', icon: '🍲' },
      { id: 'mevlit_helva', name: 'Mevlit Helvası', icon: '🍲' },
      { id: 'mevlit_asure', name: 'Mevlit Aşuresi', icon: '🍲' },
      { id: 'mevlit_ikram', name: 'Mevlit İkramı', icon: '🍲' },
    ],
    iftar_catering: [
      { id: 'iftar_pilav', name: 'İftar Pilavı', icon: '🍲' },
      { id: 'iftar_corba', name: 'İftar Çorbası', icon: '🍲' },
      { id: 'iftar_ana_yemek', name: 'İftar Ana Yemek', icon: '🍲' },
      { id: 'iftar_tatli', name: 'İftar Tatlısı', icon: '🍲' },
      { id: 'iftar_ikram', name: 'İftar İkramı', icon: '🍲' },
    ],
  };

  // Create child categories
  for (const [parentId, childCats] of Object.entries(childCategoriesMap)) {
    const parentCategoryId = categoryMap.get(parentId);
    if (!parentCategoryId) continue;

    for (const childCat of childCats) {
      const catData = categories.find(c => c.id === childCat.id);
      const category = await prisma.category.upsert({
        where: { name: childCat.name },
        update: {
          icon: childCat.icon,
          questions: catData?.questions as any || null,
          isActive: true,
          parentId: parentCategoryId,
        },
        create: {
          name: childCat.name,
          icon: childCat.icon,
          questions: catData?.questions as any || null,
          isActive: true,
          parentId: parentCategoryId,
        },
      });
      categoryMap.set(childCat.id, category.id);
      console.log(`  ✅ Created child category: ${childCat.name} (${category.id}) under ${parentCategories.find(p => p.id === parentId)?.name}`);
    }
  }

  // Create Provider Users
  console.log('👤 Creating users...');
  const provider1 = await prisma.user.upsert({
    where: { phoneNumber: '+905551234567' },
    update: {},
    create: {
      phoneNumber: '+905551234567',
      name: 'Ahmet Yılmaz',
      email: 'ahmet@example.com',
      userType: 'PROVIDER',
      bio: 'Elektrik işlerinde 10 yıllık tecrübeli elektrikçi',
      location: 'İstanbul, Türkiye',
      rating: 4.5,
      ratingCount: 24,
      profileImage: 'https://i.pravatar.cc/150?img=12',
      companyName: 'Yılmaz Elektrik',
      address: 'Kadıköy, İstanbul',
      responseTime: '1-2 saat',
      memberSince: '2020',
      completedJobs: 347,
    },
  });

  // Link provider1 to categories
  const cateringCategoryId = categoryMap.get('catering');
  const pilavCategoryId = categoryMap.get('pilav');
  if (cateringCategoryId && pilavCategoryId) {
    await prisma.userCategory.upsert({
      where: {
        userId_categoryId: {
          userId: provider1.id,
          categoryId: cateringCategoryId,
        },
      },
      update: {},
      create: {
        userId: provider1.id,
        categoryId: cateringCategoryId,
      },
    });
    await prisma.userCategory.upsert({
      where: {
        userId_categoryId: {
          userId: provider1.id,
          categoryId: pilavCategoryId,
        },
      },
      update: {},
      create: {
        userId: provider1.id,
        categoryId: pilavCategoryId,
      },
    });
  }

  const provider2 = await prisma.user.upsert({
    where: { phoneNumber: '+905551234568' },
    update: {},
    create: {
      phoneNumber: '+905551234568',
      name: 'Mehmet Demir',
      email: 'mehmet@example.com',
      userType: 'PROVIDER',
      bio: 'Profesyonel tesisatçı, 7/24 hizmet',
      location: 'Ankara, Türkiye',
      rating: 4.8,
      ratingCount: 45,
      profileImage: 'https://i.pravatar.cc/150?img=13',
      companyName: 'Demir Catering',
      address: 'Çankaya, Ankara',
      responseTime: '2-3 saat',
      memberSince: '2019',
      completedJobs: 289,
    },
  });

  // Link provider2 to categories
  const helvaCategoryId = categoryMap.get('helva');
  const hayirYemekCategoryIdForProvider = categoryMap.get('hayir_yemek');
  if (pilavCategoryId && hayirYemekCategoryIdForProvider && helvaCategoryId) {
    await prisma.userCategory.upsert({
      where: {
        userId_categoryId: {
          userId: provider2.id,
          categoryId: pilavCategoryId,
        },
      },
      update: {},
      create: {
        userId: provider2.id,
        categoryId: pilavCategoryId,
      },
    });
    await prisma.userCategory.upsert({
      where: {
        userId_categoryId: {
          userId: provider2.id,
          categoryId: hayirYemekCategoryIdForProvider,
        },
      },
      update: {},
      create: {
        userId: provider2.id,
        categoryId: hayirYemekCategoryIdForProvider,
      },
    });
    await prisma.userCategory.upsert({
      where: {
        userId_categoryId: {
          userId: provider2.id,
          categoryId: helvaCategoryId,
        },
      },
      update: {},
      create: {
        userId: provider2.id,
        categoryId: helvaCategoryId,
      },
    });
  }

  const provider3 = await prisma.user.upsert({
    where: { phoneNumber: '+905551234569' },
    update: {},
    create: {
      phoneNumber: '+905551234569',
      name: 'Ali Kaya',
      email: 'ali@example.com',
      userType: 'PROVIDER',
      bio: 'Lokma ve helva ustası, geleneksel lezzet',
      location: 'İzmir, Türkiye',
      rating: 4.9,
      ratingCount: 289,
      profileImage: 'https://i.pravatar.cc/150?img=14',
      companyName: 'İzmir Lokma Evi',
      address: 'Konak, İzmir',
      responseTime: '1-2 saat',
      memberSince: '2020',
      completedJobs: 347,
    },
  });

  // Link provider3 to categories
  const lokmaCategoryId = categoryMap.get('lokma');
  const asureCategoryId = categoryMap.get('asure');
  if (lokmaCategoryId && helvaCategoryId && asureCategoryId) {
    await prisma.userCategory.upsert({
      where: {
        userId_categoryId: {
          userId: provider3.id,
          categoryId: lokmaCategoryId,
        },
      },
      update: {},
      create: {
        userId: provider3.id,
        categoryId: lokmaCategoryId,
      },
    });
    await prisma.userCategory.upsert({
      where: {
        userId_categoryId: {
          userId: provider3.id,
          categoryId: helvaCategoryId,
        },
      },
      update: {},
      create: {
        userId: provider3.id,
        categoryId: helvaCategoryId,
      },
    });
    await prisma.userCategory.upsert({
      where: {
        userId_categoryId: {
          userId: provider3.id,
          categoryId: asureCategoryId,
        },
      },
      update: {},
      create: {
        userId: provider3.id,
        categoryId: asureCategoryId,
      },
    });
  }

  // Create Receiver Users
  const receiver1 = await prisma.user.upsert({
    where: { phoneNumber: '+905559876543' },
    update: {},
    create: {
      phoneNumber: '+905559876543',
      name: 'Ayşe Şahin',
      email: 'ayse@example.com',
      userType: 'RECEIVER',
      location: 'İstanbul, Türkiye',
      profileImage: 'https://i.pravatar.cc/150?img=5',
    },
  });

  const receiver2 = await prisma.user.upsert({
    where: { phoneNumber: '+905559876544' },
    update: {},
    create: {
      phoneNumber: '+905559876544',
      name: 'Fatma Çelik',
      email: 'fatma@example.com',
      userType: 'RECEIVER',
      location: 'Ankara, Türkiye',
      profileImage: 'https://i.pravatar.cc/150?img=6',
    },
  });

  console.log('✅ Users created');

  // Create Demands
  console.log('📋 Creating demands...');
  const demand1 = await prisma.demand.create({
    data: {
      userId: receiver1.id,
      categoryId: lokmaCategoryId!,
      title: 'Mevlit için Lokma Döktürme',
      description: 'Rahmetli annemizin ruhu için 500 kişilik lokma dağıtımı yapılacak. Cami avlusunda ikram edilecek.',
      location: 'Kadıköy, İstanbul',
      latitude: 40.9877,
      longitude: 29.0341,
      budget: 7500,
      images: [],
      status: 'ACTIVE',
      peopleCount: 500,
      eventDate: new Date('2025-10-20'),
      eventTime: '14:00',
      isUrgent: false,
      deadline: '3 gün',
      address: 'Kadıköy Camii, Kadıköy Meydanı, İstanbul',
      questionResponses: {
        portion_count: 500,
        lokma_type: 'izmir',
        serving_style: ['disposable', 'table'],
        oil_preference: 'butter',
        special_requests: 'Taze yağ kullanımı şart',
      },
    },
  });

  const demand2 = await prisma.demand.create({
    data: {
      userId: receiver1.id,
      categoryId: pilavCategoryId!,
      title: 'Açılış Organizasyonu – Pilav & Helva',
      description: 'Yeni iş yerimizin açılışı için toplu yemek organizasyonu. 800 kişilik pilav ve helva ikramı.',
      location: 'Karşıyaka, İzmir',
      latitude: 38.4606,
      longitude: 27.1478,
      budget: 12000,
      images: [],
      status: 'ACTIVE',
      peopleCount: 800,
      eventDate: new Date('2025-10-25'),
      eventTime: '18:00',
      isUrgent: false,
      deadline: '1 hafta',
      address: 'İş Merkezi, Karşıyaka, İzmir',
      questionResponses: {
        portion_count: 800,
        pilav_type: 'vermicelli',
        with_chicken: true,
        chicken_type: 'mixed',
        side_dishes: ['salad', 'ayran', 'bread'],
        special_requests: 'Helal sertifikalı',
      },
    },
  });

  const demand3 = await prisma.demand.create({
    data: {
      userId: receiver2.id,
      categoryId: asureCategoryId!,
      title: 'Aşure Günü İkramı',
      description: 'Aşure günü için 300 kişilik aşure ikramı yapılacak. Geleneksel tarif tercih ediyoruz.',
      location: 'Bornova, İzmir',
      latitude: 38.4637,
      longitude: 27.2136,
      budget: 9000,
      images: [],
      status: 'ACTIVE',
      peopleCount: 300,
      eventDate: new Date('2025-10-30'),
      eventTime: '15:00',
      isUrgent: true,
      deadline: '2 gün',
      address: 'Bornova Belediyesi, Bornova, İzmir',
      questionResponses: {
        portion_count: 300,
        recipe_type: 'traditional',
        ingredients: ['chickpea', 'bean', 'apricot', 'fig', 'walnut'],
        container_type: 'plastic',
        decoration: true,
        special_requests: 'Geleneksel tarif',
      },
    },
  });

  console.log('✅ Demands created');

  // Create Offers
  console.log('💼 Creating offers...');
  const offer1 = await prisma.offer.create({
    data: {
      demandId: demand1.id,
      providerId: provider3.id,
      message: 'Geleneksel İzmir lokması yapıyoruz. 500 kişilik organizasyon için hazırız. Taze yağ ve kaliteli malzeme garantisi.',
      price: 7500,
      estimatedTime: '24 saat',
      status: 'PENDING',
    },
  });

  const offer2 = await prisma.offer.create({
    data: {
      demandId: demand2.id,
      providerId: provider2.id,
      message: 'Toplu yemek organizasyonunda 15 yıllık tecrübemiz var. 800 kişilik pilav ve helva ikramını rahatlıkla karşılayabiliriz.',
      price: 11500,
      estimatedTime: '1 hafta',
      status: 'PENDING',
    },
  });

  const offer3 = await prisma.offer.create({
    data: {
      demandId: demand3.id,
      providerId: provider3.id,
      message: 'Aşure günü için 300 kişilik geleneksel aşure yapabiliriz. Acil teslimat imkanımız var.',
      price: 8500,
      estimatedTime: '2 gün',
      status: 'PENDING',
    },
  });

  console.log('✅ Offers created');

  // Create Reviews
  console.log('⭐ Creating reviews...');
  await prisma.review.create({
    data: {
      reviewerId: receiver1.id,
      reviewedUserId: provider1.id,
      rating: 5,
      comment: 'Çok profesyonel ve hızlı çalışıyor. Kesinlikle tavsiye ederim.',
    },
  });

  await prisma.review.create({
    data: {
      reviewerId: receiver2.id,
      reviewedUserId: provider2.id,
      rating: 4,
      comment: 'İyi iş çıkardı, işini biliyor.',
    },
  });

  console.log('✅ Reviews created');

  // Create Notifications
  console.log('🔔 Creating notifications...');
  await prisma.notification.create({
    data: {
      userId: receiver1.id,
      title: 'Yeni Teklif',
      message: `${provider1.name} talebinize teklif verdi`,
      type: 'NEW_OFFER',
      data: {
        offerId: offer1.id,
        demandId: demand1.id,
      },
    },
  });

  await prisma.notification.create({
    data: {
      userId: receiver1.id,
      title: 'Yeni Teklif',
      message: `${provider2.name} talebinize teklif verdi`,
      type: 'NEW_OFFER',
      data: {
        offerId: offer2.id,
        demandId: demand2.id,
      },
    },
  });

  console.log('✅ Notifications created');

  // Create Charity Activities
  console.log('❤️ Creating charity activities...');

  // İstanbul'da hayır aktiviteleri
  const hayirYemekCategoryId = categoryMap.get('hayir_yemek');
  await prisma.charityActivity.create({
    data: {
      providerId: provider1.id,
      categoryId: hayirYemekCategoryId!,
      title: 'İhtiyaç Sahiplerine Sıcak Yemek Dağıtımı',
      description: 'Her gün 200 kişilik sıcak yemek dağıtımı yapıyoruz. İhtiyaç sahiplerine ücretsiz yemek servisi.',
      latitude: 41.0082,
      longitude: 28.9784,
      address: 'Kadıköy Meydanı, Kadıköy, İstanbul',
      estimatedEndTime: new Date('2025-12-31T18:00:00'),
    },
  });

  await prisma.charityActivity.create({
    data: {
      providerId: provider2.id,
      categoryId: pilavCategoryId!,
      title: 'Cuma Günü Pilav Dağıtımı',
      description: 'Her Cuma günü cami önünde 500 kişilik pilav dağıtımı. Helal ve taze malzeme ile hazırlanıyor.',
      latitude: 41.0123,
      longitude: 28.9856,
      address: 'Üsküdar Camii, Üsküdar, İstanbul',
      estimatedEndTime: new Date('2025-12-31T14:00:00'),
    },
  });

  await prisma.charityActivity.create({
    data: {
      providerId: provider3.id,
      categoryId: lokmaCategoryId!,
      title: 'Mevlit Lokması Dağıtımı',
      description: 'Rahmetli vatandaşlarımızın ruhu için lokma döküyoruz. Her hafta 300 kişilik lokma ikramı.',
      latitude: 41.0056,
      longitude: 28.9723,
      address: 'Beşiktaş Meydanı, Beşiktaş, İstanbul',
      estimatedEndTime: new Date('2025-12-31T16:00:00'),
    },
  });

  // Ankara'da hayır aktiviteleri
  await prisma.charityActivity.create({
    data: {
      providerId: provider2.id,
      categoryId: helvaCategoryId!,
      title: 'Haftalık Helva Dağıtımı',
      description: 'Her hafta sonu 400 kişilik helva dağıtımı. Geleneksel tarif ile hazırlanıyor.',
      latitude: 39.9334,
      longitude: 32.8597,
      address: 'Kızılay Meydanı, Çankaya, Ankara',
      estimatedEndTime: new Date('2025-12-31T15:00:00'),
    },
  });

  await prisma.charityActivity.create({
    data: {
      providerId: provider1.id,
      categoryId: hayirYemekCategoryId!,
      title: 'Günlük Yemek Servisi',
      description: 'Her gün öğle yemeği servisi. İhtiyaç sahiplerine sıcak yemek ikramı.',
      latitude: 39.9208,
      longitude: 32.8541,
      address: 'Ulus Meydanı, Altındağ, Ankara',
      estimatedEndTime: new Date('2025-12-31T13:00:00'),
    },
  });

  // İzmir Buca'da hayır aktiviteleri
  await prisma.charityActivity.create({
    data: {
      providerId: provider3.id,
      categoryId: asureCategoryId!,
      title: 'Aşure Günü Özel Dağıtım',
      description: 'Aşure günü için 600 kişilik aşure hazırlıyoruz. Geleneksel tarif ile.',
      latitude: 38.3950,
      longitude: 27.1700,
      address: 'Buca Belediyesi Önü, Buca Merkez, İzmir',
      estimatedEndTime: new Date('2025-12-31T17:00:00'),
    },
  });

  await prisma.charityActivity.create({
    data: {
      providerId: provider1.id,
      categoryId: pilavCategoryId!,
      title: 'Hafta Sonu Pilav İkramı',
      description: 'Her hafta sonu 350 kişilik pilav ikramı. Cami avlusunda dağıtım yapılıyor.',
      latitude: 38.4100,
      longitude: 27.1850,
      address: 'Şirinyer Camii, Şirinyer, Buca, İzmir',
      estimatedEndTime: new Date('2025-12-31T14:30:00'),
    },
  });

  await prisma.charityActivity.create({
    data: {
      providerId: provider2.id,
      categoryId: lokmaCategoryId!,
      title: 'Cuma Günü Lokma Dağıtımı',
      description: 'Her Cuma günü 400 kişilik lokma döküyoruz. Taze yağ ve kaliteli malzeme kullanıyoruz.',
      latitude: 38.4000,
      longitude: 27.1600,
      address: 'Kaynaklar Mahallesi, Buca, İzmir',
      estimatedEndTime: new Date('2025-12-31T15:00:00'),
    },
  });

  await prisma.charityActivity.create({
    data: {
      providerId: provider1.id,
      categoryId: helvaCategoryId!,
      title: 'Günlük Helva İkramı',
      description: 'Her gün 200 kişilik helva ikramı. İhtiyaç sahiplerine ücretsiz dağıtım.',
      latitude: 38.3850,
      longitude: 27.1750,
      address: 'Hasanağa Mahallesi, Buca, İzmir',
      estimatedEndTime: new Date('2025-12-31T16:00:00'),
    },
  });

  await prisma.charityActivity.create({
    data: {
      providerId: provider3.id,
      categoryId: hayirYemekCategoryId!,
      title: 'Öğle Yemeği Servisi',
      description: 'Her gün öğle saatlerinde 300 kişilik sıcak yemek servisi. İhtiyaç sahiplerine ücretsiz.',
      latitude: 38.4050,
      longitude: 27.1550,
      address: 'Kozağaç Mahallesi, Buca, İzmir',
      estimatedEndTime: new Date('2025-12-31T13:00:00'),
    },
  });

  await prisma.charityActivity.create({
    data: {
      providerId: provider2.id,
      categoryId: pilavCategoryId!,
      title: 'Haftalık Pilav Dağıtımı',
      description: 'Her hafta 500 kişilik pilav dağıtımı. Helal ve taze malzeme ile hazırlanıyor.',
      latitude: 38.3900,
      longitude: 27.1800,
      address: 'Buca Kültür Merkezi Önü, Buca, İzmir',
      estimatedEndTime: new Date('2025-12-31T14:00:00'),
    },
  });

  // Bursa'da hayır aktiviteleri
  await prisma.charityActivity.create({
    data: {
      providerId: provider2.id,
      categoryId: lokmaCategoryId!,
      title: 'Cuma Lokması',
      description: 'Her Cuma günü 250 kişilik lokma döküyoruz. Taze ve kaliteli malzeme kullanıyoruz.',
      latitude: 40.1826,
      longitude: 29.0665,
      address: 'Osmangazi Camii, Osmangazi, Bursa',
      estimatedEndTime: new Date('2025-12-31T15:30:00'),
    },
  });

  await prisma.charityActivity.create({
    data: {
      providerId: provider3.id,
      categoryId: helvaCategoryId!,
      title: 'Günlük Helva İkramı',
      description: 'Her gün 150 kişilik helva ikramı. İhtiyaç sahiplerine ücretsiz dağıtım.',
      latitude: 40.1885,
      longitude: 29.0610,
      address: 'Nilüfer Belediyesi Önü, Nilüfer, Bursa',
      estimatedEndTime: new Date('2025-12-31T16:00:00'),
    },
  });

  console.log('✅ Charity activities created');

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
