// Kategori ve dinamik soru kalıpları

export interface QuestionOption {
  label: string;
  value: string;
}

export interface CategoryQuestion {
  id: string;
  question: string;
  type: 'text' | 'number' | 'select' | 'multiselect' | 'date' | 'boolean';
  required: boolean;
  options?: QuestionOption[]; // select ve multiselect için
  placeholder?: string;
  unit?: string; // number alanları için (örn: "kişi", "kg", "₺")
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  questions: CategoryQuestion[];
}

export const categories: Category[] = [
  {
    id: 'lokma',
    name: 'Lokma',
    icon: '🍩',
    questions: [
      {
        id: 'portion_count',
        question: 'Kaç porsiyon lokma gerekiyor?',
        type: 'number',
        required: true,
        placeholder: 'Örn: 500',
        unit: 'porsiyon',
      },
      {
        id: 'lokma_type',
        question: 'Lokma türü tercihiniz nedir?',
        type: 'select',
        required: true,
        options: [
          { label: 'Geleneksel İzmir Lokması', value: 'izmir' },
          { label: 'İstanbul Lokması', value: 'istanbul' },
          { label: 'Şerbetli Lokma', value: 'serbetli' },
          { label: 'Kuru Lokma', value: 'kuru' },
        ],
      },
      {
        id: 'serving_style',
        question: 'Servis şekli nasıl olmalı?',
        type: 'multiselect',
        required: true,
        options: [
          { label: 'Tek kullanımlık ambalaj', value: 'disposable' },
          { label: 'Masa servisi', value: 'table' },
          { label: 'Tabak ile dağıtım', value: 'plate' },
          { label: 'Paket servis', value: 'package' },
        ],
      },
      {
        id: 'oil_preference',
        question: 'Yağ tercihiniz var mı?',
        type: 'select',
        required: false,
        options: [
          { label: 'Tereyağı', value: 'butter' },
          { label: 'Sade yağ', value: 'plain_oil' },
          { label: 'Karışık', value: 'mixed' },
          { label: 'Farketmez', value: 'any' },
        ],
      },
      {
        id: 'special_requests',
        question: 'Özel talepleriniz var mı?',
        type: 'text',
        required: false,
        placeholder: 'Örn: Şeker oranı düşük olsun, glutensiz...',
      },
    ],
  },
  {
    id: 'pilav',
    name: 'Pilav',
    icon: '🍚',
    questions: [
      {
        id: 'portion_count',
        question: 'Kaç porsiyon pilav gerekiyor?',
        type: 'number',
        required: true,
        placeholder: 'Örn: 300',
        unit: 'porsiyon',
      },
      {
        id: 'pilav_type',
        question: 'Pilav türü?',
        type: 'select',
        required: true,
        options: [
          { label: 'Sade Pilav', value: 'plain' },
          { label: 'Nohutlu Pilav', value: 'chickpea' },
          { label: 'Şehriyeli Pilav', value: 'vermicelli' },
          { label: 'Tereyağlı Pilav', value: 'butter' },
          { label: 'Bulgur Pilavı', value: 'bulgur' },
        ],
      },
      {
        id: 'with_chicken',
        question: 'Tavuklu olacak mı?',
        type: 'boolean',
        required: true,
      },
      {
        id: 'chicken_type',
        question: 'Tavuk nasıl olmalı?',
        type: 'select',
        required: false,
        options: [
          { label: 'Parça tavuk', value: 'pieces' },
          { label: 'But', value: 'drumstick' },
          { label: 'Göğüs', value: 'breast' },
          { label: 'Karışık', value: 'mixed' },
        ],
      },
      {
        id: 'side_dishes',
        question: 'Yanında ne olsun?',
        type: 'multiselect',
        required: false,
        options: [
          { label: 'Salata', value: 'salad' },
          { label: 'Cacık', value: 'tzatziki' },
          { label: 'Turşu', value: 'pickle' },
          { label: 'Ayran', value: 'ayran' },
          { label: 'Ekmek', value: 'bread' },
        ],
      },
      {
        id: 'special_requests',
        question: 'Özel talepleriniz?',
        type: 'text',
        required: false,
        placeholder: 'Örn: Az tuzlu, vejeteryan seçenek...',
      },
    ],
  },
  {
    id: 'helva',
    name: 'Helva',
    icon: '🧈',
    questions: [
      {
        id: 'portion_count',
        question: 'Kaç porsiyon helva gerekiyor?',
        type: 'number',
        required: true,
        placeholder: 'Örn: 200',
        unit: 'porsiyon',
      },
      {
        id: 'helva_type',
        question: 'Helva türü?',
        type: 'select',
        required: true,
        options: [
          { label: 'Un Helvası', value: 'flour' },
          { label: 'İrmik Helvası', value: 'semolina' },
          { label: 'Tahin Helvası', value: 'tahini' },
          { label: 'Bal Kabaği Helvası', value: 'pumpkin' },
        ],
      },
      {
        id: 'with_nuts',
        question: 'İçinde fındık/fıstık olsun mu?',
        type: 'boolean',
        required: true,
      },
      {
        id: 'nut_type',
        question: 'Hangi kuru yemiş?',
        type: 'multiselect',
        required: false,
        options: [
          { label: 'Fındık', value: 'hazelnut' },
          { label: 'Fıstık', value: 'pistachio' },
          { label: 'Ceviz', value: 'walnut' },
          { label: 'Badem', value: 'almond' },
        ],
      },
      {
        id: 'serving_style',
        question: 'Servis şekli?',
        type: 'select',
        required: true,
        options: [
          { label: 'Tek kullanımlık kap', value: 'disposable' },
          { label: 'Porselen tabak', value: 'plate' },
          { label: 'Paket', value: 'package' },
        ],
      },
      {
        id: 'special_requests',
        question: 'Özel talepleriniz?',
        type: 'text',
        required: false,
        placeholder: 'Örn: Az şekerli, vegan...',
      },
    ],
  },
  {
    id: 'asure',
    name: 'Aşure',
    icon: '🥣',
    questions: [
      {
        id: 'portion_count',
        question: 'Kaç porsiyon aşure gerekiyor?',
        type: 'number',
        required: true,
        placeholder: 'Örn: 400',
        unit: 'porsiyon',
      },
      {
        id: 'recipe_type',
        question: 'Aşure tarifi?',
        type: 'select',
        required: true,
        options: [
          { label: 'Geleneksel', value: 'traditional' },
          { label: 'Özel (15+ malzeme)', value: 'special' },
          { label: 'Sade (Temel malzemeler)', value: 'plain' },
        ],
      },
      {
        id: 'ingredients',
        question: 'İçinde mutlaka olmasını istediğiniz malzemeler?',
        type: 'multiselect',
        required: false,
        options: [
          { label: 'Nohut', value: 'chickpea' },
          { label: 'Kuru fasulye', value: 'bean' },
          { label: 'Kuru kayısı', value: 'apricot' },
          { label: 'Kuru incir', value: 'fig' },
          { label: 'Üzüm', value: 'grape' },
          { label: 'Fındık', value: 'hazelnut' },
          { label: 'Ceviz', value: 'walnut' },
          { label: 'Nar', value: 'pomegranate' },
        ],
      },
      {
        id: 'container_type',
        question: 'Kap tercihi?',
        type: 'select',
        required: true,
        options: [
          { label: 'Plastik kap (tek kullanımlık)', value: 'plastic' },
          { label: 'Cam kavanoz', value: 'glass' },
          { label: 'Kaseler', value: 'bowl' },
        ],
      },
      {
        id: 'decoration',
        question: 'Üzeri süsleme istiyor musunuz?',
        type: 'boolean',
        required: false,
      },
      {
        id: 'special_requests',
        question: 'Özel talepleriniz?',
        type: 'text',
        required: false,
        placeholder: 'Örn: Şekersiz, allerji...',
      },
    ],
  },
  {
    id: 'yemek',
    name: 'Yemek',
    icon: '🍲',
    questions: [
      {
        id: 'portion_count',
        question: 'Kaç porsiyon yemek gerekiyor?',
        type: 'number',
        required: true,
        placeholder: 'Örn: 150',
        unit: 'porsiyon',
      },
      {
        id: 'menu_type',
        question: 'Menü türü?',
        type: 'select',
        required: true,
        options: [
          { label: 'Tek çeşit ana yemek', value: 'single' },
          { label: '2 çeşit ana yemek', value: 'double' },
          { label: 'Full menü (çorba + ana + tatlı)', value: 'full' },
          { label: 'Açık büfe', value: 'buffet' },
        ],
      },
      {
        id: 'food_preferences',
        question: 'Yemek tercihleri?',
        type: 'multiselect',
        required: true,
        options: [
          { label: 'Etli yemekler', value: 'meat' },
          { label: 'Tavuklu yemekler', value: 'chicken' },
          { label: 'Balıklı yemekler', value: 'fish' },
          { label: 'Vejeteryan', value: 'vegetarian' },
          { label: 'Vegan', value: 'vegan' },
        ],
      },
      {
        id: 'side_options',
        question: 'Yanında ne olsun?',
        type: 'multiselect',
        required: false,
        options: [
          { label: 'Pilav', value: 'rice' },
          { label: 'Makarna', value: 'pasta' },
          { label: 'Salata', value: 'salad' },
          { label: 'Cacık', value: 'tzatziki' },
          { label: 'Ekmek', value: 'bread' },
          { label: 'İçecek', value: 'drink' },
        ],
      },
      {
        id: 'serving_type',
        question: 'Servis şekli?',
        type: 'select',
        required: true,
        options: [
          { label: 'Tabak servis (garsonlu)', value: 'plated' },
          { label: 'Self servis (açık büfe)', value: 'buffet' },
          { label: 'Paket', value: 'takeout' },
          { label: 'Tepsi', value: 'tray' },
        ],
      },
      {
        id: 'special_requests',
        question: 'Özel talepleriniz?',
        type: 'text',
        required: false,
        placeholder: 'Örn: Helal sertifikalı, allerji bilgisi...',
      },
    ],
  },
];

export const getCategoryById = (id: string): Category | undefined => {
  return categories.find((cat) => cat.id === id);
};

export const getCategoriesByIds = (ids: string[]): Category[] => {
  return categories.filter((cat) => ids.includes(cat.id));
};

