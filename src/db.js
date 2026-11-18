const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const security = require('./security');
const config = require('./config');

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const dataDir = isVercel ? path.join('/tmp', 'data') : path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'store.json');

let memoryStore = null;

function createInitialData() {
  const adminHash = config.adminPasswordHash || security.hashPassword('Admin@2026!');
  return {
    admin: {
      username: config.adminUsername,
      passwordHash: adminHash
    },
    campaigns: [
      {
        id: 'cmp_gaza_emergency',
        title: 'ساند أهل غزة — إغاثة وإيواء طارئ',
        summary: 'توفير المساعدات الإغاثية العاجلة: وجبات ساخنة، طرود غذائية، مخيمات إيواء مجهزة ومياه نقية.',
        description: 'استجابة إنسانية عاجلة للتخفيف من معاناة أهالينا في قطاع غزة، تشمل تأمين الخيام المقاومة للعوامل الجوية، السلال الغذائية، وتأمين المواد الحيوية للمتضررين في مخيمات الإيواء.',
        targetAmount: 50000000,
        raisedAmount: 35620000,
        donorsCount: 48210,
        currency: 'EGP',
        category: 'إغاثة عاجلة',
        status: 'active',
        image: 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=800&q=80',
        createdAt: '2026-10-01T10:00:00.000Z'
      },
      {
        id: 'cmp_gaza_winter',
        title: 'ساهم في حملة الشتاء وكن دفء لغيرك في غزة',
        summary: 'توفير بطانيات شتوية، وألحفة ثقيلة، وملابس دافئة لحماية أطفال وأسر غزة من البرد القارس.',
        description: 'حملة دفء متكاملة تهدف لتوزيع 100,000 بطانية ولحاف شتوي وكسوة أطفال كاملة تقي أهالينا برد الشتاء القارس داخل خيام النزوح ومراكز الإيواء المؤقتة.',
        targetAmount: 10000000,
        raisedAmount: 6840000,
        donorsCount: 14350,
        currency: 'EGP',
        category: 'كسوة وإيواء',
        status: 'active',
        image: 'https://images.unsplash.com/photo-1542810634-71277d95dcbb?auto=format&fit=crop&w=800&q=80',
        createdAt: '2026-10-05T10:00:00.000Z'
      },
      {
        id: 'cmp_gaza_water',
        title: 'إنشاء محطات تحلية وتوفير مياه الشرب النقية',
        summary: 'تشغيل محطات تحلية متنقلة وتوزيع مئات الآلاف من لترات المياه الصالحة للشرب يومياً.',
        description: 'مشروع سقيا الماء الاستراتيجي في غزة لإنشاء وتشغيل وحدات تحلية مياه متنقلة تعمل بالطاقة البديلة، وتوزيع المياه النقية عبر صهاريج مخصصة تصل لمخيمات النزوح الأكثر احتياجاً.',
        targetAmount: 15000000,
        raisedAmount: 11200000,
        donorsCount: 19800,
        currency: 'EGP',
        category: 'سقيا الماء',
        status: 'active',
        image: 'https://images.unsplash.com/photo-1559827291-72ee739d0d9a?auto=format&fit=crop&w=800&q=80',
        createdAt: '2026-10-12T10:00:00.000Z'
      },
      {
        id: 'cmp_gaza_medical',
        title: 'تجهيز المستشفيات الميدانية والعمليات الجراحية الطارئة',
        summary: 'توفير المستلزمات الطبية العاجلة، والأدوية المزمنة، والمعدات التشغيلية لغرف العمليات.',
        description: 'دعم المنظومة الصحية في غزة عبر توفير الأدوية الحيوية، وأكياس الدم، والمستهلكات الجراحية للمستشفيات الميدانية، ودعم الطواقم الطبية في إنقاذ حياة المصابين والأطفال.',
        targetAmount: 25000000,
        raisedAmount: 18450000,
        donorsCount: 27600,
        currency: 'EGP',
        category: 'رعاية صحية',
        status: 'active',
        image: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
        createdAt: '2026-10-15T10:00:00.000Z'
      },
      {
        id: 'cmp_gaza_orphans',
        title: 'كفالة أيتام غزة والرعاية الشاملة',
        summary: 'برنامج كفالة شهرية متكامل يضمن الرعاية الغذائية والصحية والمعيشية للأيتام وأسرهم.',
        description: 'كفالة شاملة تسعى لاحتضان أيتام غزة وتوفير المسكن الآمن، الغذاء الصحي، الرعاية الطبية، والمتابعة التعليمية والنفسية المستمرة لضمان نشأة كريمة ومستقبل آمن.',
        targetAmount: 20000000,
        raisedAmount: 14800000,
        donorsCount: 22400,
        currency: 'EGP',
        category: 'كفالة أيتام',
        status: 'active',
        image: 'https://images.unsplash.com/photo-1509099836639-18ba1795216d?auto=format&fit=crop&w=800&q=80',
        createdAt: '2026-10-20T10:00:00.000Z'
      },
      {
        id: 'cmp_gaza_food',
        title: 'قوافل الإطعام والمخابز الخيرية المستمرة',
        summary: 'تشغيل المخابز وتوفير الدقيق وتوزيع آلاف الوجبات والخبز الساخن يومياً على الأسر.',
        description: 'مشروع المخابز الميدانية المستمرة في وسط وجنوب قطاع غزة، لتوفير الخبز الطازج يومياً بالمجان للأسر النازحة والأطفال وتوزيع الوجبات الغذائية المتكاملة.',
        targetAmount: 12000000,
        raisedAmount: 8950000,
        donorsCount: 16100,
        currency: 'EGP',
        category: 'إطعام',
        status: 'active',
        image: 'https://images.unsplash.com/photo-1593113646773-028c64a8f1b8?auto=format&fit=crop&w=800&q=80',
        createdAt: '2026-10-25T10:00:00.000Z'
      }
    ],
    products: [
      {
        id: 'prod_blanket',
        title: 'بطانية شتوية عازلة',
        amount: 470,
        currency: 'EGP',
        category: 'كسوة ودفء',
        image: 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=600&q=80',
        description: 'بطانية صوفية ثقيلة عازلة للبرودة الشديدة للأسر النازحة'
      },
      {
        id: 'prod_duvet',
        title: 'لحاف مميز شتوي',
        amount: 750,
        currency: 'EGP',
        category: 'كسوة ودفء',
        image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80',
        description: 'لحاف حراري كبير عالي الجودة للتدفئة في الخيام'
      },
      {
        id: 'prod_clothing_card',
        title: 'كارت ملابس شتوية للأطفال',
        amount: 1000,
        currency: 'EGP',
        category: 'كسوة أطفال',
        image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=600&q=80',
        description: 'قسيمة كسوة شتوية متكاملة لطفل تشمل جاكت وحذاء وملابس صوفية'
      },
      {
        id: 'prod_food_box',
        title: 'كرتونة مواد غذائية أساسية',
        amount: 500,
        currency: 'EGP',
        category: 'إطعام',
        image: 'https://images.unsplash.com/photo-1593113646773-028c64a8f1b8?auto=format&fit=crop&w=600&q=80',
        description: 'سلة غذائية متكاملة تكفي أسرة لمدة أسبوعين من المواد الأساسية'
      },
      {
        id: 'prod_hot_meal',
        title: 'وجبة ساخنة لإطعام صائم أو نازح',
        amount: 100,
        currency: 'EGP',
        category: 'إطعام',
        image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=600&q=80',
        description: 'وجبة غداء ساخنة متكاملة البروتين يتم طهيها يومياً بالمطابخ الميدانية'
      },
      {
        id: 'prod_water_share',
        title: 'سهم توفير مياه شرب نقية (1,000 لتر)',
        amount: 250,
        currency: 'EGP',
        category: 'سقيا الماء',
        image: 'https://images.unsplash.com/photo-1527613426441-4da17471b66d?auto=format&fit=crop&w=800&q=80',
        description: 'نقل وتوزيع 1,000 لتر من المياه المحلاة النقية لمخيمات الإيواء'
      }
    ],
    transactions: [
      {
        id: 'tx_demo_001',
        receiptToken: security.generateReceiptToken(),
        campaignId: 'cmp_water_wells',
        campaignTitle: 'حفر آبار المياه النقية',
        amount: 250,
        currency: 'USD',
        frequency: 'once',
        gateway: 'stripe',
        gatewayRef: 'ch_live_9812736451',
        donorName: 'عبدالله السالم',
        donorEmail: 'donor1@example.com',
        anonymous: false,
        status: 'completed',
        createdAt: '2026-11-17T14:22:00.000Z',
        completedAt: '2026-11-17T14:22:30.000Z'
      },
      {
        id: 'tx_demo_002',
        receiptToken: security.generateReceiptToken(),
        campaignId: 'cmp_orphan_care',
        campaignTitle: 'كفالة ورعاية الأيتام',
        amount: 100,
        currency: 'USD',
        frequency: 'monthly',
        gateway: 'paypal',
        gatewayRef: 'PP-88392014X',
        donorName: 'فاعل خير',
        donorEmail: '',
        anonymous: true,
        status: 'completed',
        createdAt: '2026-11-18T08:15:00.000Z',
        completedAt: '2026-11-18T08:15:22.000Z'
      }
    ],
    messages: []
  };
}

function ensureDb() {
  if (memoryStore) {
    return;
  }
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(dbFile)) {
      const initial = createInitialData();
      fs.writeFileSync(dbFile, JSON.stringify(initial, null, 2), 'utf8');
      memoryStore = initial;
    } else {
      const raw = fs.readFileSync(dbFile, 'utf8');
      memoryStore = JSON.parse(raw);
    }
  } catch (err) {
    if (!memoryStore) {
      memoryStore = createInitialData();
    }
  }
}

function readDb() {
  ensureDb();
  try {
    if (fs.existsSync(dbFile)) {
      const raw = fs.readFileSync(dbFile, 'utf8');
      memoryStore = JSON.parse(raw);
    }
  } catch (err) {}
  return memoryStore;
}

function writeDb(data) {
  memoryStore = data;
  try {
    ensureDb();
    const suffix = crypto.randomBytes(6).toString('hex');
    const tmpFile = `${dbFile}.${process.pid}.${suffix}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, dbFile);
  } catch (err) {
    // In read-only serverless environment, in-memory store acts as fallback
  }
}

module.exports = {
  readDb,
  writeDb
};
