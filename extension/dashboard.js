// AI Listing Pro — Dashboard Logic
// 3-Step Workflow: Upload → Generate → Apply to Meesho
// Subscription-only model: Users must subscribe to use tools.

(async function () {
  'use strict';

  // ── State ──
  let currentUser = null;
  let userProfile = null;
  let activeSubscription = null;  // Current active subscription object or null
  let analysisHistory = [];
  let currentListingImage = null;
  let lastGeneratedListing = null;
  let activePaymentPlanId = null;
  let activePaymentTab = 'subscription'; // subscription only
  let currentPaymentContext = null;
  let paymentVerificationInFlight = false;

  // ── Subscription Access Check ──
  function hasActiveSubscription() {
    return activeSubscription && new Date(activeSubscription.end_date) > new Date();
  }

  function canUseTool() {
    return hasActiveSubscription();
  }

  function getAccessLabel() {
    if (hasActiveSubscription()) return 'Unlimited';
    return 'Subscribe';
  }

  // ── DOM References ──
  const DOM = {
    // Sidebar
    sidebarCredits: document.getElementById('sidebar-credits'),
    sidebarCreditsCount: document.getElementById('sidebar-credits-count'),
    sidebarName: document.getElementById('sidebar-name'),
    sidebarEmail: document.getElementById('sidebar-email'),
    sidebarAvatar: document.getElementById('sidebar-avatar'),
    // Top bar
    topBarTitle: document.getElementById('top-bar-title'),
    meeshoContext: document.getElementById('meesho-context'),
    // Buttons
    btnRefresh: document.getElementById('btn-refresh'),
    btnBuyCredits: document.getElementById('btn-buy-credits'),
    btnLoginRedirect: document.getElementById('btn-login-redirect'),
    paymentDrawer: document.getElementById('payment-drawer'),
    paymentDrawerBackdrop: document.getElementById('payment-drawer-backdrop'),
    paymentDrawerClose: document.getElementById('payment-drawer-close'),
    paymentDrawerTitle: document.getElementById('payment-drawer-title'),
    paymentDrawerSubtitle: document.getElementById('payment-drawer-subtitle'),
    paymentPhoneInput: document.getElementById('payment-phone-input'),
    paymentPlanList: document.getElementById('payment-plan-list'),
    paymentPlansView: document.getElementById('payment-plans-view'),
    paymentStatus: document.getElementById('payment-status'),
    // Login overlay
    loginOverlay: document.getElementById('login-overlay'),
    // History
    historyContent: document.getElementById('history-content'),
    // Listing tool
    btnRunListing: document.getElementById('btn-run-listing'),
    resultListing: document.getElementById('result-listing'),
    listingImage: document.getElementById('listing-image'),
    listingHints: document.getElementById('listing-hints'),
    listingAudience: document.getElementById('listing-audience'),
    listingPriceGoal: document.getElementById('listing-price-goal'),
    listingTone: document.getElementById('listing-tone'),
    // Image preview
    uploadZone: document.getElementById('upload-zone'),
    imagePreviewBar: document.getElementById('image-preview-bar'),
    listingPreviewImage: document.getElementById('listing-preview-image'),
    previewFileName: document.getElementById('preview-file-name'),
    previewMeta: document.getElementById('preview-meta'),
    btnRemoveImage: document.getElementById('btn-remove-image'),
    // Workflow steps
    step1Indicator: document.getElementById('step-1-indicator'),
    step2Indicator: document.getElementById('step-2-indicator'),
    step3Indicator: document.getElementById('step-3-indicator'),
    step1Panel: document.getElementById('step-1-panel'),
    step2Panel: document.getElementById('step-2-panel'),
    step3Panel: document.getElementById('step-3-panel'),
    // Keyword tool
    btnRunKeywords: document.getElementById('btn-run-keywords'),
    resultKeywords: document.getElementById('result-keywords'),
    // Shipping tool
    resultShipping: document.getElementById('result-shipping'),
    shipCreditsBadge: document.getElementById('ship-credits-badge'),
    shipHeaderCreditsCount: document.getElementById('ship-header-credits-count'),
    shipBuyCreditsBtn: document.getElementById('ship-buy-credits-btn'),
    shipUserAvatar: document.getElementById('ship-user-avatar'),
    shipUserName: document.getElementById('ship-user-name'),
    shipPromoCode: document.getElementById('ship-promo-code'),
    shipApplyPromoBtn: document.getElementById('ship-apply-promo-btn'),
    shipCategorySearch: document.getElementById('ship-category-search'),
    shipCategorySection: document.getElementById('ship-category-section'),
    shipCategorySelect: document.getElementById('ship-category-select'),
    shipCategoryClear: document.getElementById('ship-category-clear'),
    shipCategoryDropdown: document.getElementById('ship-category-dropdown'),
    shipSelectedCategory: document.getElementById('ship-selected-category'),
    shipSelectedCategoryName: document.getElementById('ship-selected-category-name'),
    shipUploadArea: document.getElementById('ship-upload-area'),
    shipImageInput: document.getElementById('ship-image-input'),
    shipPreviewBox: document.getElementById('ship-preview-box'),
    shipPreviewImg: document.getElementById('ship-preview-img'),
    shipSettingsRow: document.getElementById('ship-settings-row'),
    shipTargetShipping: document.getElementById('ship-target-shipping'),
    shipMaxAttempts: document.getElementById('ship-max-attempts'),
    shipProcessingArea: document.getElementById('ship-processing-area'),
    shipResetBtn: document.getElementById('ship-reset-btn'),
    shipCurrentStatus: document.getElementById('ship-current-status'),
    // Profit tool
    btnRunProfit: document.getElementById('btn-run-profit'),
    resultProfit: document.getElementById('result-profit'),
    // Bulk tool
    btnRunBulk: document.getElementById('btn-run-bulk'),
    resultBulk: document.getElementById('result-bulk'),
  };

  // ── Page Title Map ──
  const PAGE_TITLES = {
    listing: 'AI Listing Generator',
    keywords: 'Keyword Generator',
    shipping: 'Shipping Optimizer',
    profit: 'Shipping & Profit Calculator',
    bulk: 'Bulk Listing Generator',
    history: 'History',
  };

  const SUBSCRIPTION_PLAN_ORDER = ['trial', 'monthly', 'quarterly', 'half_yearly', 'yearly'];

  const MEESHO_CATEGORY_HIERARCHY = [
    { mainCategory: 'Women Clothing', subcategories: ['Kurtis', 'Kurta Sets', 'Sarees', 'Dresses', 'Tops & Tunics', 'T-Shirts', 'Shirts', 'Jeans', 'Jeggings', 'Leggings', 'Palazzo Pants', 'Ethnic Sets', 'Skirts', 'Nightwear', 'Innerwear', 'Maternity Wear', 'Ethnic Bottomwear', 'Dupattas', 'Ethnic Jackets', 'Blouses', 'Lehenga Choli', 'Gowns'] },
    { mainCategory: 'Men Clothing', subcategories: ['T-Shirts', 'Shirts', 'Casual Shirts', 'Formal Shirts', 'Jeans', 'Trousers', 'Ethnic Wear', 'Kurtas', 'Sherwanis', 'Jackets', 'Blazers', 'Hoodies', 'Sweatshirts', 'Track Pants', 'Shorts', 'Innerwear', 'Nightwear'] },
    { mainCategory: 'Kids Clothing', subcategories: ['Baby Rompers', 'Baby Sets', 'Baby Dresses', 'Boys T-Shirts', 'Boys Shirts', 'Boys Jeans', 'Boys Ethnic Wear', 'Boys Shorts', 'Girls Dresses', 'Girls Tops', 'Girls Skirts', 'Girls Ethnic Wear', 'Kids Nightwear', 'Kids Innerwear'] },
    { mainCategory: 'Footwear', subcategories: ['Women Sandals', 'Women Heels', 'Women Flats', 'Women Sneakers', 'Women Slippers', 'Men Casual Shoes', 'Men Formal Shoes', 'Men Sports Shoes', 'Men Sandals', 'Men Slippers', 'Kids Shoes', 'Kids Sandals'] },
    { mainCategory: 'Fashion Accessories', subcategories: ['Handbags', 'Sling Bags', 'Tote Bags', 'Backpacks', 'Wallets', 'Belts', 'Caps', 'Hats', 'Sunglasses', 'Watches', 'Hair Accessories', 'Scarves', 'Stoles'] },
    { mainCategory: 'Jewellery', subcategories: ['Necklaces', 'Earrings', 'Bangles', 'Bracelets', 'Rings', 'Anklets', 'Jewellery Sets', 'Nose Pins', 'Mangalsutra', 'Maang Tikka', 'Bridal Jewellery'] },
    { mainCategory: 'Beauty & Personal Care', subcategories: ['Face Makeup', 'Lip Makeup', 'Eye Makeup', 'Foundations', 'Lipsticks', 'Eyeliners', 'Mascaras', 'Blush', 'Highlighters', 'Face Wash', 'Face Cream', 'Face Serum', 'Face Masks', 'Sunscreen', 'Shampoo', 'Conditioner', 'Hair Oil', 'Hair Serum', 'Hair Color', 'Deodorants', 'Perfumes', 'Body Lotion'] },
    { mainCategory: 'Home & Kitchen', subcategories: ['Cookware', 'Nonstick Cookware', 'Pressure Cookers', 'Frying Pans', 'Kitchen Tools', 'Kitchen Storage', 'Lunch Boxes', 'Water Bottles', 'Dinner Sets', 'Glassware', 'Kitchen Organizers', 'Bedsheets', 'Cushion Covers', 'Curtains', 'Blankets', 'Pillows', 'Carpets', 'Wall Decor', 'Photo Frames', 'Showpieces', 'Lamps', 'LED Lights'] },
    { mainCategory: 'Electronics & Accessories', subcategories: ['Mobile Covers', 'Phone Cases', 'Screen Guards', 'Chargers', 'USB Cables', 'Earphones', 'Bluetooth Headphones', 'Smart Watches', 'Power Banks', 'Mobile Holders', 'Laptop Accessories', 'Computer Accessories', 'USB Drives'] },
    { mainCategory: 'Toys & Games', subcategories: ['Soft Toys', 'Educational Toys', 'Puzzle Games', 'Building Blocks', 'Remote Control Toys', 'Dolls', 'Board Games', 'Outdoor Toys'] },
    { mainCategory: 'Sports & Fitness', subcategories: ['Yoga Mats', 'Dumbbells', 'Resistance Bands', 'Skipping Ropes', 'Gym Gloves', 'Fitness Trackers', 'Sports Bottles'] },
    { mainCategory: 'Stationery & Office', subcategories: ['Notebooks', 'Diaries', 'Pens', 'Pencils', 'Art Supplies', 'Office Files', 'Desk Organizers'] },
    { mainCategory: 'Automotive Accessories', subcategories: ['Car Phone Holders', 'Car Chargers', 'Car Seat Covers', 'Car Cleaning Tools', 'Bike Covers', 'Bike Accessories'] },
    { mainCategory: 'Pet Supplies', subcategories: ['Pet Toys', 'Pet Beds', 'Pet Feeding Bowls', 'Pet Grooming Tools'] },
    { mainCategory: 'Books', subcategories: ['Educational Books', 'Children Books', 'Coloring Books', 'Activity Books'] },
  ];

  const CATEGORY_MATCH_OVERRIDES = {
    'Women Clothing > Kurtis': ['kurti', 'kurta', 'anarkali'],
    'Women Clothing > Kurta Sets': ['kurta set', 'kurti set', 'ethnic set'],
    'Women Clothing > Sarees': ['saree', 'sari'],
    'Women Clothing > Dresses': ['dress', 'maxi', 'midi'],
    'Women Clothing > Tops & Tunics': ['top', 'tunic', 'crop top', 'camisole'],
    'Women Clothing > T-Shirts': ['tshirt', 't-shirt', 'tee'],
    'Women Clothing > Shirts': ['women shirt', 'ladies shirt'],
    'Women Clothing > Jeans': ['jeans', 'denim'],
    'Women Clothing > Palazzo Pants': ['palazzo', 'palazzo pant'],
    'Women Clothing > Dupattas': ['dupatta', 'chunri', 'stole'],
    'Women Clothing > Lehenga Choli': ['lehenga', 'choli', 'ghagra'],
    'Men Clothing > T-Shirts': ['tshirt', 't-shirt', 'tee', 'polo'],
    'Men Clothing > Casual Shirts': ['casual shirt'],
    'Men Clothing > Formal Shirts': ['formal shirt'],
    'Men Clothing > Kurtas': ['kurta'],
    'Kids Clothing > Baby Rompers': ['romper', 'onesie'],
    'Kids Clothing > Baby Sets': ['baby set', 'infant set'],
    'Kids Clothing > Baby Dresses': ['baby dress'],
    'Kids Clothing > Girls Dresses': ['girls dress', 'frock'],
    'Kids Clothing > Girls Tops': ['girls top'],
    'Kids Clothing > Girls Skirts': ['girls skirt'],
    'Footwear > Women Sandals': ['women sandal', 'ladies sandal'],
    'Footwear > Women Heels': ['heel', 'heels', 'pump'],
    'Footwear > Women Flats': ['flat', 'bellies'],
    'Footwear > Women Sneakers': ['sneaker'],
    'Footwear > Men Casual Shoes': ['casual shoes', 'loafer'],
    'Footwear > Men Formal Shoes': ['formal shoes', 'oxford'],
    'Footwear > Men Sports Shoes': ['sports shoes', 'running shoes'],
    'Fashion Accessories > Handbags': ['handbag', 'purse'],
    'Fashion Accessories > Tote Bags': ['tote'],
    'Fashion Accessories > Backpacks': ['backpack', 'rucksack'],
    'Fashion Accessories > Wallets': ['wallet'],
    'Jewellery > Jewellery Sets': ['jewellery set', 'jewelry set'],
    'Jewellery > Earrings': ['earring'],
    'Jewellery > Bangles': ['bangle'],
    'Jewellery > Necklaces': ['necklace', 'chain'],
    'Jewellery > Maang Tikka': ['maang tikka', 'mang tikka'],
    'Jewellery > Bridal Jewellery': ['bridal jewellery', 'bridal jewelry'],
    'Beauty & Personal Care > Face Makeup': ['makeup kit', 'compact', 'concealer'],
    'Beauty & Personal Care > Lip Makeup': ['lip makeup'],
    'Beauty & Personal Care > Eye Makeup': ['eye makeup', 'kajal'],
    'Beauty & Personal Care > Foundations': ['foundation'],
    'Beauty & Personal Care > Lipsticks': ['lipstick'],
    'Beauty & Personal Care > Eyeliners': ['eyeliner'],
    'Beauty & Personal Care > Mascaras': ['mascara'],
    'Beauty & Personal Care > Face Wash': ['facewash', 'face wash'],
    'Beauty & Personal Care > Face Cream': ['face cream', 'moisturizer'],
    'Beauty & Personal Care > Face Serum': ['serum', 'face serum'],
    'Beauty & Personal Care > Face Masks': ['face mask', 'sheet mask'],
    'Beauty & Personal Care > Hair Oil': ['hair oil'],
    'Beauty & Personal Care > Hair Serum': ['hair serum'],
    'Beauty & Personal Care > Hair Color': ['hair color', 'hair colour'],
    'Home & Kitchen > Pressure Cookers': ['pressure cooker'],
    'Home & Kitchen > Frying Pans': ['frying pan', 'fry pan'],
    'Home & Kitchen > Lunch Boxes': ['lunch box', 'tiffin'],
    'Home & Kitchen > Water Bottles': ['water bottle', 'bottle', 'flask', 'sipper', 'tumbler'],
    'Home & Kitchen > Bedsheets': ['bedsheet', 'bed sheet'],
    'Home & Kitchen > Cushion Covers': ['cushion cover'],
    'Home & Kitchen > LED Lights': ['led light', 'fairy light'],
    'Electronics & Accessories > Mobile Covers': ['mobile cover', 'back cover'],
    'Electronics & Accessories > Phone Cases': ['phone case', 'case cover'],
    'Electronics & Accessories > Screen Guards': ['screen guard', 'tempered glass'],
    'Electronics & Accessories > USB Cables': ['usb cable', 'charging cable'],
    'Electronics & Accessories > Earphones': ['earphone'],
    'Electronics & Accessories > Bluetooth Headphones': ['bluetooth headphone', 'wireless headphone'],
    'Electronics & Accessories > Smart Watches': ['smartwatch', 'smart watch'],
    'Electronics & Accessories > Power Banks': ['power bank'],
    'Electronics & Accessories > Mobile Holders': ['mobile holder', 'phone holder'],
    'Toys & Games > Soft Toys': ['soft toy', 'teddy'],
    'Toys & Games > Educational Toys': ['educational toy', 'learning toy'],
    'Toys & Games > Puzzle Games': ['puzzle'],
    'Toys & Games > Building Blocks': ['building block', 'blocks'],
    'Toys & Games > Remote Control Toys': ['remote control toy', 'rc car'],
    'Sports & Fitness > Yoga Mats': ['yoga mat'],
    'Sports & Fitness > Resistance Bands': ['resistance band'],
    'Sports & Fitness > Skipping Ropes': ['skipping rope', 'jump rope'],
    'Sports & Fitness > Gym Gloves': ['gym glove'],
    'Sports & Fitness > Sports Bottles': ['sports bottle', 'gym bottle'],
    'Stationery & Office > Notebooks': ['notebook'],
    'Stationery & Office > Diaries': ['diary', 'journal'],
    'Stationery & Office > Pens': ['pen'],
    'Stationery & Office > Pencils': ['pencil'],
    'Automotive Accessories > Car Phone Holders': ['car phone holder', 'car mobile holder'],
    'Automotive Accessories > Car Chargers': ['car charger'],
    'Automotive Accessories > Car Seat Covers': ['car seat cover'],
    'Automotive Accessories > Bike Covers': ['bike cover'],
    'Pet Supplies > Pet Toys': ['pet toy', 'dog toy', 'cat toy'],
    'Pet Supplies > Pet Beds': ['pet bed'],
    'Pet Supplies > Pet Feeding Bowls': ['pet bowl', 'feeding bowl'],
    'Books > Educational Books': ['educational book', 'textbook'],
    'Books > Children Books': ['children book', 'kids book'],
    'Books > Coloring Books': ['coloring book', 'colouring book'],
    'Books > Activity Books': ['activity book'],
  };

  const MEESHO_CATEGORY_ENTRIES = MEESHO_CATEGORY_HIERARCHY.flatMap(({ mainCategory, subcategories }) => (
    subcategories.map((subcategory) => {
      const category = `${mainCategory} > ${subcategory}`;
      return {
        key: normalizeText(category).replace(/\s+/g, '-'),
        title: singularizeLabel(subcategory),
        category,
        mainCategory,
        subcategory,
        audience: inferCategoryAudience(mainCategory, subcategory),
        patterns: buildCategoryPatterns(mainCategory, subcategory),
        tags: buildDefaultCategoryTags(mainCategory, subcategory),
      };
    })
  ));

  const MATERIAL_PATTERNS = [
    { key: 'rayon', label: 'Rayon', patterns: ['rayon'] },
    { key: 'cotton', label: 'Cotton', patterns: ['cotton'] },
    { key: 'silk', label: 'Silk', patterns: ['silk'] },
    { key: 'georgette', label: 'Georgette', patterns: ['georgette'] },
    { key: 'crepe', label: 'Crepe', patterns: ['crepe'] },
    { key: 'polyester', label: 'Polyester', patterns: ['polyester'] },
    { key: 'stainless steel', label: 'Stainless Steel', patterns: ['steel', 'stainless'] },
    { key: 'plastic', label: 'Plastic', patterns: ['plastic'] },
  ];

  const STYLE_PATTERNS = [
    { key: 'printed', label: 'Printed', patterns: ['printed', 'print', 'floral'] },
    { key: 'solid', label: 'Solid', patterns: ['solid', 'plain'] },
    { key: 'embroidered', label: 'Embroidered', patterns: ['embroidered', 'embroidery'] },
    { key: 'oversized', label: 'Oversized', patterns: ['oversized'] },
    { key: 'festive', label: 'Festive', patterns: ['festive', 'party', 'wedding'] },
    { key: 'leakproof', label: 'Leakproof', patterns: ['leakproof', 'leak proof'] },
    { key: 'premium', label: 'Premium', patterns: ['premium', 'luxury'] },
  ];

  const COLOR_PALETTE = [
    { name: 'Red', rgb: [214, 58, 65] },
    { name: 'Maroon', rgb: [116, 28, 47] },
    { name: 'Pink', rgb: [228, 124, 162] },
    { name: 'Orange', rgb: [233, 126, 48] },
    { name: 'Yellow', rgb: [225, 189, 67] },
    { name: 'Green', rgb: [73, 153, 95] },
    { name: 'Blue', rgb: [61, 112, 196] },
    { name: 'Navy Blue', rgb: [41, 65, 120] },
    { name: 'Purple', rgb: [124, 76, 180] },
    { name: 'Black', rgb: [45, 48, 56] },
    { name: 'White', rgb: [230, 230, 228] },
    { name: 'Grey', rgb: [145, 149, 155] },
    { name: 'Brown', rgb: [128, 92, 56] },
    { name: 'Beige', rgb: [205, 186, 153] },
  ];

  const PROFIT_CATEGORY_RULES = {
    women_ethnic: { label: 'Women Ethnic Wear', commissionRate: 18, baseShipping: 42, baseWeight: 500, weightStep: 500, shippingIncrement: 9, gstDefault: 5 },
    fashion: { label: 'Fashion & Apparel', commissionRate: 17, baseShipping: 40, baseWeight: 500, weightStep: 500, shippingIncrement: 8, gstDefault: 5 },
    beauty: { label: 'Beauty & Personal Care', commissionRate: 16, baseShipping: 39, baseWeight: 500, weightStep: 500, shippingIncrement: 8, gstDefault: 12 },
    home: { label: 'Home & Kitchen', commissionRate: 20, baseShipping: 49, baseWeight: 1000, weightStep: 500, shippingIncrement: 12, gstDefault: 12 },
    electronics: { label: 'Electronics & Accessories', commissionRate: 15, baseShipping: 55, baseWeight: 500, weightStep: 500, shippingIncrement: 14, gstDefault: 18 },
    jewelry: { label: 'Jewelry & Accessories', commissionRate: 22, baseShipping: 38, baseWeight: 250, weightStep: 250, shippingIncrement: 6, gstDefault: 3 },
    other: { label: 'Other', commissionRate: 18, baseShipping: 45, baseWeight: 500, weightStep: 500, shippingIncrement: 10, gstDefault: 12 },
  };

  const SHIPPING_CATEGORY_OPTIONS = [
    { id: 'kurti', name: 'Kurti', parentName: 'Women Ethnic Wear', weightHint: 340, baseCost: 61 },
    { id: 'saree', name: 'Saree', parentName: 'Women Ethnic Wear', weightHint: 520, baseCost: 68 },
    { id: 'dress', name: 'Dress', parentName: 'Women Western Wear', weightHint: 390, baseCost: 57 },
    { id: 'tshirt', name: 'T-Shirt', parentName: 'Fashion & Apparel', weightHint: 240, baseCost: 48 },
    { id: 'shirt', name: 'Shirt', parentName: 'Fashion & Apparel', weightHint: 280, baseCost: 51 },
    { id: 'bag', name: 'Bag', parentName: 'Bags & Luggage', weightHint: 460, baseCost: 63 },
    { id: 'bedsheet', name: 'Bedsheet', parentName: 'Home & Kitchen', weightHint: 780, baseCost: 72 },
    { id: 'bottle', name: 'Bottle', parentName: 'Home & Kitchen', weightHint: 610, baseCost: 66 },
    { id: 'jewelry', name: 'Jewellery Set', parentName: 'Jewelry & Accessories', weightHint: 160, baseCost: 44 },
  ];

  // ══════════════════════════════════════
  //  SUPABASE SESSION RESTORE
  // ══════════════════════════════════════
  async function initSession() {
    const sbClient = window.supabaseClient;
    if (!sbClient) {
      showLogin();
      return false;
    }

    try {
      const stored = await chrome.storage.local.get(['sbSession']);
      const session = stored.sbSession;
      if (session && session.access_token) {
        await sbClient.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }
    } catch (e) {
      console.error('[DASHBOARD] Session restore error:', e);
    }

    const { data: { user }, error } = await sbClient.auth.getUser();
    if (error || !user) {
      showLogin();
      return false;
    }

    currentUser = user;

    const { data: profile, error: profileErr } = await sbClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      showLogin();
      return false;
    }

    userProfile = profile;

    // Fetch active subscription
    const { data: subs } = await sbClient
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('end_date', { ascending: false })
      .limit(1);

    if (subs && subs.length > 0 && new Date(subs[0].end_date) > new Date()) {
      activeSubscription = subs[0];
    } else {
      activeSubscription = null;
    }

    updateUI();
    return true;
  }

  async function bgFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'PROXY_FETCH', payload: { url, options } },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!response || !response.success) {
            reject(new Error(response?.error || 'Background fetch failed'));
            return;
          }

          resolve({
            ok: response.ok,
            status: response.status,
            json: async () => (typeof response.body === 'object' ? response.body : JSON.parse(response.body)),
            text: async () => (typeof response.body === 'string' ? response.body : JSON.stringify(response.body)),
          });
        }
      );
    });
  }

  async function getAccessToken() {
    const sbClient = window.supabaseClient;
    if (!sbClient) return null;

    try {
      const { data } = await sbClient.auth.getSession();
      return data?.session?.access_token || null;
    } catch (_) {
      return null;
    }
  }

  function showLogin() {
    DOM.loginOverlay.classList.remove('hidden');
  }

  // ══════════════════════════════════════
  //  UI UPDATE
  // ══════════════════════════════════════
  function updateUI() {
    if (!userProfile || !currentUser) return;

    const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'User';
    const email = currentUser.email || '—';
    const initial = name.charAt(0).toUpperCase();

    // Sidebar subscription display
    if (hasActiveSubscription()) {
      DOM.sidebarCreditsCount.textContent = '∞';
      DOM.sidebarCredits.querySelector('.credits-label').textContent = `${activeSubscription.plan_name || activeSubscription.plan || 'Pro'} — ${formatSubscriptionExpiry(activeSubscription.end_date)}`;
      DOM.sidebarCredits.classList.remove('low');
      DOM.sidebarCredits.classList.add('subscribed');
      // Update nav badges
      document.querySelectorAll('.nav-badge').forEach(b => {
        if (b.textContent.includes('cr')) b.textContent = '∞';
      });
      // Update button labels
      if (DOM.btnBuyCredits) DOM.btnBuyCredits.innerHTML = '⚡ Pro';
    } else {
      DOM.sidebarCreditsCount.textContent = '—';
      DOM.sidebarCredits.querySelector('.credits-label').textContent = 'No active plan';
      DOM.sidebarCredits.classList.remove('subscribed');
      DOM.sidebarCredits.classList.remove('low');
      document.querySelectorAll('.nav-badge').forEach(b => {
        if (b.textContent === '∞') b.textContent = '—';
      });
      if (DOM.btnBuyCredits) DOM.btnBuyCredits.innerHTML = '⚡ Subscribe';
    }

    DOM.sidebarName.textContent = name;
    DOM.sidebarEmail.textContent = email;
    DOM.sidebarAvatar.textContent = initial;

    if (DOM.shipHeaderCreditsCount) DOM.shipHeaderCreditsCount.textContent = hasActiveSubscription() ? '∞' : '—';
    if (DOM.shipUserName) DOM.shipUserName.textContent = name;
    if (DOM.shipUserAvatar) DOM.shipUserAvatar.textContent = initial;
    if (DOM.shipCreditsBadge) {
      DOM.shipCreditsBadge.classList.toggle('low', !hasActiveSubscription());
    }

    // Update generate button labels
    updateToolButtonLabels();
  }

  function formatSubscriptionExpiry(endDate) {
    const d = new Date(endDate);
    const now = new Date();
    const daysLeft = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return 'Expired';
    if (daysLeft === 1) return '1 day left';
    if (daysLeft <= 7) return `${daysLeft} days left`;
    return `till ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  }

  function updateToolButtonLabels() {
    const label = hasActiveSubscription() ? 'Unlimited' : 'Subscribe';
    const bulkLabel = hasActiveSubscription() ? 'Unlimited' : 'Subscribe';
    if (DOM.btnRunListing && !DOM.btnRunListing.disabled) {
      DOM.btnRunListing.innerHTML = `<span class="btn-icon">🧠</span> Generate Listing — ${label}`;
    }
    if (DOM.btnRunKeywords && !DOM.btnRunKeywords.disabled) {
      DOM.btnRunKeywords.innerHTML = `<span class="btn-icon">🔍</span> Generate Keywords — ${label}`;
    }
    if (DOM.btnRunBulk && !DOM.btnRunBulk.disabled) {
      DOM.btnRunBulk.innerHTML = `<span class="btn-icon">⚡</span> Generate Bulk — ${bulkLabel}`;
    }
  }

  // ══════════════════════════════════════
  //  SIDEBAR NAVIGATION
  // ══════════════════════════════════════
  function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    const pages = document.querySelectorAll('.page-panel');

    navItems.forEach((item) => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;

        navItems.forEach((n) => n.classList.remove('active'));
        item.classList.add('active');

        pages.forEach((p) => p.classList.remove('active'));
        const target = document.getElementById('page-' + page);
        if (target) target.classList.add('active');

        DOM.topBarTitle.textContent = PAGE_TITLES[page] || 'Dashboard';
        closePaymentDrawer();
      });
    });
  }

  function getPhoneSeed() {
    const candidates = [
      userProfile?.phone,
      currentUser?.phone,
      currentUser?.user_metadata?.phone,
      currentUser?.user_metadata?.phone_number,
    ];

    const match = candidates
      .map((value) => String(value || '').replace(/\D/g, ''))
      .find((value) => value.length === 10);

    return match || '';
  }

  function getSubscriptionPlans() {
    return SUBSCRIPTION_PLAN_ORDER
      .map((planId) => CONFIG.SUBSCRIPTION_PLANS?.[planId])
      .filter(Boolean);
  }

  function setPaymentStatus(message, type = 'info') {
    if (!DOM.paymentStatus) return;
    DOM.paymentStatus.textContent = message;
    DOM.paymentStatus.className = `payment-status ${type}`;
  }

  function renderPaymentPlans() {
    if (!DOM.paymentPlanList) return;

    // Subscription plans only
    const subPlans = getSubscriptionPlans();

    const subHtml = subPlans.map((plan) => {
      const isActive = plan.id === activePaymentPlanId;
      const isHighlight = Boolean(plan.badge);
      return `<button class="payment-plan-card ${isActive ? 'active' : ''} ${isHighlight ? 'highlight' : ''}" type="button" data-payment-plan="${escapeHtml(plan.id)}" data-plan-type="subscription">
        <span class="payment-plan-copy">
          <strong>${escapeHtml(plan.name)}</strong>
          <small>${escapeHtml(plan.label)}</small>
        </span>
        <span class="payment-plan-price">
          ${plan.badge ? `<span class="payment-plan-badge">${escapeHtml(plan.badge)}</span>` : ''}
          <strong>₹${escapeHtml(String(plan.price))}</strong>
          <small>All tools unlimited</small>
        </span>
      </button>`;
    }).join('');

    DOM.paymentPlanList.innerHTML = `
      <div class="payment-tab-content" id="tab-subscription">
        <div class="payment-section-head">
          <span class="payment-section-title">🔓 Unlimited Access Plans</span>
          <span class="payment-section-note">All tools unlimited during plan period</span>
        </div>
        <div class="payment-plan-grid">${subHtml}</div>
      </div>
    `;

    // Subscription plan click events
    DOM.paymentPlanList.querySelectorAll('[data-plan-type="subscription"]').forEach((button) => {
      button.addEventListener('click', async () => {
        activePaymentPlanId = button.dataset.paymentPlan;
        renderPaymentPlans();
        await startEmbeddedPayment(button.dataset.paymentPlan);
      });
    });
  }

  function openPaymentDrawer() {
    if (!currentUser) {
      showToast('Please sign in first.', 'error');
      showLogin();
      return;
    }

    if (DOM.paymentPhoneInput && !DOM.paymentPhoneInput.value.trim()) {
      DOM.paymentPhoneInput.value = getPhoneSeed();
    }

    if (!activePaymentPlanId) {
      activePaymentPlanId = 'yearly';
    }

    renderPaymentPlans();
    setPaymentStatus('Pick a plan to start checkout.', 'info');
    DOM.paymentDrawer?.classList.add('open');
    DOM.paymentDrawer?.setAttribute('aria-hidden', 'false');
  }

  function closePaymentDrawer() {
    DOM.paymentDrawer?.classList.remove('open');
    DOM.paymentDrawer?.setAttribute('aria-hidden', 'true');
  }

  async function startEmbeddedPayment(planId) {
    const plan = CONFIG.SUBSCRIPTION_PLANS?.[planId];
    if (!plan) return;

    const phone = DOM.paymentPhoneInput?.value?.replace(/\D/g, '') || '';
    if (phone.length !== 10) {
      setPaymentStatus('Enter a valid 10-digit WhatsApp number before continuing.', 'error');
      DOM.paymentPhoneInput?.focus();
      return;
    }

    const token = await getAccessToken();
    if (!token || !currentUser) {
      setPaymentStatus('Session expired. Refresh and try again.', 'error');
      return;
    }

    try {
      setPaymentStatus(`Creating ${plan.name} order...`, 'info');

      console.log("CHECKOUT DATA", {
        user_id: currentUser.id,
        plan: plan.id,
        duration_days: plan.duration_days,
        amount: plan.price
      });

      const response = await bgFetch(CONFIG.CREATE_ORDER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: CONFIG.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: plan.price,
          plan_id: plan.id,
          user_id: currentUser.id,
          phone,
          duration_days: plan.duration_days,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const order = await response.json();

      // Store payment context for verification after checkout completes
      currentPaymentContext = {
        orderId: order.id,
        amount: order.amount,
        phone,
        plan,
        started: true,
      };

      // Persist context so it survives iframe reload after checkout
      try {
        sessionStorage.setItem('paymentContext', JSON.stringify(currentPaymentContext));
      } catch (_) {}

      // Tell parent popup to navigate the iframe to checkout page
      // This eliminates the triple-iframe nesting problem
      const checkoutUrl = CONFIG.CHECKOUT_URL
        + '?order_id=' + encodeURIComponent(order.id)
        + '&amount=' + encodeURIComponent(order.amount)
        + '&key=' + encodeURIComponent(CONFIG.RAZORPAY_KEY_ID)
        + '&phone=' + encodeURIComponent(phone)
        + '&plan=' + encodeURIComponent(plan.id)
        + '&user_id=' + encodeURIComponent(currentUser.id)
        + '&plan_id=' + encodeURIComponent(plan.id)
        + '&duration_days=' + encodeURIComponent(plan.duration_days || '');

      window.parent.postMessage({
        type: 'OPEN_CHECKOUT',
        url: checkoutUrl,
      }, '*');

      setPaymentStatus(`Redirecting to secure checkout...`, 'info');
    } catch (error) {
      console.error('[DASHBOARD_PAYMENT] start error:', error);
      setPaymentStatus(`Could not start checkout: ${error.message}`, 'error');
    }
  }

  // startCreditPackPayment removed - subscription-only model

  async function verifyEmbeddedPayment(paymentData) {
    if (!currentPaymentContext || paymentVerificationInFlight || !currentUser) return;

    paymentVerificationInFlight = true;
    setPaymentStatus('Verifying payment with server...', 'info');

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Missing session token');

      const response = await bgFetch(CONFIG.VERIFY_PAYMENT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: CONFIG.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          razorpay_order_id: currentPaymentContext.orderId,
          razorpay_payment_id: paymentData.razorpay_payment_id,
          razorpay_signature: paymentData.razorpay_signature,
          user_id: currentUser.id,
          plan_type: currentPaymentContext.plan.id,
          amount: currentPaymentContext.plan.price,
          duration_days: currentPaymentContext.plan.duration_days,
          phone: currentPaymentContext.phone,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = await response.json();

      const expiryText = result.end_date
        ? ` Plan active till ${new Date(result.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`
        : '';
      setPaymentStatus(`Payment verified successfully!${expiryText}`, 'success');
      showToast('Payment successful! Subscription activated.', 'success');
      await initSession();
      currentPaymentContext = null;
      try { sessionStorage.removeItem('paymentContext'); } catch (_) {}

      setTimeout(() => {
        closePaymentDrawer();
      }, 1400);
    } catch (error) {
      console.error('[DASHBOARD_PAYMENT] verify error:', error);
      setPaymentStatus(`Payment received but verification failed: ${error.message}`, 'error');
      showToast('Verification failed. Please contact support if amount was deducted.', 'error');
    } finally {
      paymentVerificationInFlight = false;
    }
  }

  function handleCheckoutMessage(event) {
    if (!event.data?.type) return;

    // Restore payment context from sessionStorage if needed (after iframe reload)
    if (!currentPaymentContext) {
      try {
        const stored = sessionStorage.getItem('paymentContext');
        if (stored) currentPaymentContext = JSON.parse(stored);
      } catch (_) {}
    }

    // Accept messages from parent popup (checkout result forwarded)
    if (event.data.type === 'PAYMENT_CANCELLED') {
      setPaymentStatus('Payment cancelled. You can choose another plan.', 'info');
      try { sessionStorage.removeItem('paymentContext'); } catch (_) {}
      return;
    }

    if (event.data.type === 'PAYMENT_SUCCESS') {
      verifyEmbeddedPayment(event.data.data || {});
    }
  }

  // ══════════════════════════════════════
  //  ACCESS CHECK (subscription-only)
  // ══════════════════════════════════════
  async function deductCredits(amount = 1) {
    // Subscribers get unlimited access
    if (hasActiveSubscription()) {
      return true;
    }

    // No subscription = no access
    showToast('Please subscribe for unlimited access to all tools.', 'error');
    openPaymentDrawer();
    return false;
  }

  // ══════════════════════════════════════
  //  IMAGE UPLOAD (STEP 1)
  // ══════════════════════════════════════
  function setupImageUpload() {
    if (!DOM.listingImage) return;

    // Drag & drop support
    DOM.uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      DOM.uploadZone.classList.add('drag-over');
    });

    DOM.uploadZone.addEventListener('dragleave', () => {
      DOM.uploadZone.classList.remove('drag-over');
    });

    DOM.uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      DOM.uploadZone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleImageFile(files[0]);
      }
    });

    DOM.listingImage.addEventListener('change', (event) => {
      const [file] = event.target.files || [];
      if (file) handleImageFile(file);
    });

    DOM.btnRemoveImage.addEventListener('click', () => {
      currentListingImage = null;
      DOM.listingImage.value = '';
      // Go back to Step 1 (Upload)
      setWorkflowStep(1);
    });
  }

  async function handleImageFile(file) {
    try {
      currentListingImage = await createImageProfile(file);
      DOM.listingPreviewImage.src = currentListingImage.dataUrl;
      DOM.previewFileName.textContent = file.name;
      DOM.previewMeta.textContent = `${currentListingImage.colorName} tone · ${currentListingImage.orientation} · ${currentListingImage.width}×${currentListingImage.height}`;
      // Auto-advance to Step 2 (Configure & Generate)
      setWorkflowStep(2);
    } catch (error) {
      currentListingImage = null;
      showToast('Could not read this image. Try a different file.', 'error');
    }
  }

  // ══════════════════════════════════════
  //  WORKFLOW STEP MANAGEMENT
  // ══════════════════════════════════════
  function setWorkflowStep(step) {
    const steps = [DOM.step1Indicator, DOM.step2Indicator, DOM.step3Indicator];
    const connectors = document.querySelectorAll('.workflow-connector');

    steps.forEach((s, i) => {
      s.classList.remove('active', 'completed');
      if (i + 1 < step) s.classList.add('completed');
      if (i + 1 === step) s.classList.add('active');
    });

    connectors.forEach((c, i) => {
      c.classList.toggle('active', i + 1 < step);
    });

    // Show/hide step panels (3 distinct panels)
    DOM.step1Panel.classList.toggle('active', step === 1);
    DOM.step2Panel.classList.toggle('active', step === 2);
    DOM.step3Panel.classList.toggle('active', step === 3);
  }

  // ══════════════════════════════════════
  //  READ MEESHO PAGE DATA
  // ══════════════════════════════════════
  async function readMeeshoPageData() {
    try {
      const tabs = await chrome.tabs.query({ url: '*://*.meesho.com/*' });
      const tab = tabs.find(t => t.url && t.url.includes('supplier.meesho.com'));
      if (!tab) return null;
      
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_DATA' });
      if (response?.success && response.data) return response.data;
    } catch (e) {
      console.warn('[DASHBOARD] Could not read Meesho page data:', e.message);
    }
    return null;
  }

  async function autoPopulateFromMeesho() {
    const pageData = await readMeeshoPageData();
    if (!pageData) return;

    if (pageData.productName && !DOM.listingHints.value.trim()) {
      DOM.listingHints.value = pageData.productName;
      DOM.meeshoContext.textContent = 'Meesho Supplier Panel · Auto-detected product';
    }
    if (pageData.price && !DOM.listingPriceGoal.value) {
      DOM.listingPriceGoal.value = pageData.price;
    }
  }

  // ══════════════════════════════════════
  //  AI LISTING GENERATOR (MAIN TOOL)
  // ══════════════════════════════════════
  DOM.btnRunListing.addEventListener('click', async () => {
    const hints = DOM.listingHints.value.trim();
    const audience = DOM.listingAudience.value;
    const priceGoal = parseFloat(DOM.listingPriceGoal.value) || 0;
    const tone = DOM.listingTone.value;

    if (!hints && !currentListingImage) {
      showToast('Please upload an image or enter product details.', 'error');
      return;
    }

    DOM.btnRunListing.disabled = true;
    DOM.btnRunListing.innerHTML = '<span class="btn-icon">⏳</span> Analyzing image...';

    const success = await deductCredits(1);
    if (!success) {
      DOM.btnRunListing.disabled = false;
      DOM.btnRunListing.innerHTML = '<span class="btn-icon">🧠</span> Generate Listing';
      return;
    }

    let listing = null;

    // If image is uploaded, use AI Vision to analyze the product
    if (currentListingImage && currentListingImage.dataUrl) {
      try {
        DOM.btnRunListing.innerHTML = '<span class="btn-icon">🔍</span> AI analyzing product image...';
        const visionResult = await callVisionAPI({
          image: currentListingImage.dataUrl,
          hints,
          audience,
          priceGoal,
          tone,
        });

        if (visionResult) {
          listing = {
            title: visionResult.title || '',
            description: visionResult.description || '',
            category: visionResult.category || '',
            mainCategory: (visionResult.category || '').split('>')[0]?.trim() || '',
            subcategory: (visionResult.category || '').split('>')[1]?.trim() || '',
            keywords: visionResult.keywords || [],
            tags: visionResult.tags || [],
            audience: visionResult.audience || audience,
            color: visionResult.color || currentListingImage.colorName,
            material: visionResult.material || 'Premium',
            style: 'Classic',
            priceGoal,
          };
        }
      } catch (err) {
        console.warn('[DASHBOARD] Vision API failed, falling back to local:', err.message);
        showToast('AI Vision failed, using local analysis. Check console for details.', 'warning');
      }
    }

    // Fallback to local heuristic generation if vision API fails or no image
    if (!listing) {
      await simulateDelay(800);
      listing = generateListingDraft({
        rawInput: hints,
        audienceOverride: audience,
        priceGoal,
        tone,
        imageProfile: currentListingImage,
      });
    }

    lastGeneratedListing = listing;

    // Move to Step 3 (Results + Apply)
    setWorkflowStep(3);

    DOM.resultListing.innerHTML = renderListingResult(listing);

    // Wire up result action buttons
    setupResultActions(listing);

    addHistoryEntry('AI Listing Generator', listing.title, 'Included in subscription');

    DOM.btnRunListing.disabled = false;
    DOM.btnRunListing.innerHTML = '<span class="btn-icon">🧠</span> Generate Listing';
    showToast('Listing generated! Review and apply to Meesho.', 'success');
  });

  // Call Vision API to analyze product image (direct fetch, not proxied)
  async function callVisionAPI({ image, hints, audience, priceGoal, tone }) {
    const url = CONFIG.ANALYZE_IMAGE_URL;
    if (!url) throw new Error('ANALYZE_IMAGE_URL not configured');

    // Compress image to reduce payload size
    const compressedImage = await compressImageForAPI(image);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: compressedImage, hints, audience, priceGoal, tone }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[VISION] API response error:', response.status, errBody);
      throw new Error(`Vision API error ${response.status}`);
    }

    const result = await response.json();
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Vision API returned no data');
    }
    return result.data;
  }

  function renderListingResult(listing) {
    return `<div class="listing-result-container">
  <div class="listing-result-header">
    <h3>✅ AI Generated Listing</h3>
    <span class="listing-result-badge">Ready to Apply</span>
  </div>

  <!-- PROMINENT APPLY BUTTON AT TOP -->
  <div style="padding: 0 20px; margin-bottom: 4px;">
    <button class="btn-autofill" id="btn-autofill-meesho" style="width:100%;padding:14px 20px;font-size:15px;font-weight:700;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 15px rgba(124,58,237,0.4);transition:all 0.2s ease;">
      🚀 Apply to Meesho Page — Auto Fill All Fields
    </button>
    <div id="autofill-status" style="margin-top:8px;"></div>
  </div>

  <div class="listing-result-body">
    <div class="result-field">
      <div class="result-field-label">Title</div>
      <div class="result-field-value" id="result-title-value">
        ${escapeHtml(listing.title)}
        <button class="copy-btn" data-copy="title" title="Copy title">📋</button>
      </div>
    </div>
    <div class="result-field">
      <div class="result-field-label">Category</div>
      <div class="result-field-value">
        ${escapeHtml(listing.category)}
        <button class="copy-btn" data-copy="category" title="Copy category">📋</button>
      </div>
    </div>
    <div class="result-field">
      <div class="result-field-label">Description</div>
      <div class="result-field-value description">
        ${escapeHtml(listing.description)}
        <button class="copy-btn" data-copy="description" title="Copy description">📋</button>
      </div>
    </div>
    <div class="result-field">
      <div class="result-field-label">Keywords</div>
      <div class="chip-row">${listing.keywords.map(k => `<span class="result-chip" data-keyword="${escapeHtml(k)}">${escapeHtml(k)}</span>`).join('')}</div>
    </div>
    <div class="result-field">
      <div class="result-field-label">Tags</div>
      <div class="chip-row">${listing.tags.map(t => `<span class="result-chip tag">${escapeHtml(t)}</span>`).join('')}</div>
    </div>
    <div class="result-actions">
      <button class="btn-copy-all" id="btn-copy-all">
        📋 Copy All
      </button>
      <button class="btn-generate-new" id="btn-generate-new">
        🔄 Generate New
      </button>
    </div>
  </div>
</div>`;
  }

  function setupResultActions(listing) {
    // Copy individual fields
    document.querySelectorAll('.copy-btn[data-copy]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const field = btn.dataset.copy;
        let text = '';
        if (field === 'title') text = listing.title;
        else if (field === 'category') text = listing.category;
        else if (field === 'description') text = listing.description;

        copyToClipboard(text);
        btn.classList.add('copied');
        btn.textContent = '✅';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.textContent = '📋';
        }, 2000);
      });
    });

    // Copy individual keywords on click
    document.querySelectorAll('.result-chip[data-keyword]').forEach((chip) => {
      chip.addEventListener('click', () => {
        copyToClipboard(chip.dataset.keyword);
        showToast(`Copied: ${chip.dataset.keyword}`, 'success');
      });
    });

    // Copy All
    const btnCopyAll = document.getElementById('btn-copy-all');
    if (btnCopyAll) {
      btnCopyAll.addEventListener('click', () => {
        const allText = `Title: ${listing.title}\n\nCategory: ${listing.category}\n\nDescription: ${listing.description}\n\nKeywords: ${listing.keywords.join(', ')}\n\nTags: ${listing.tags.join(', ')}`;
        copyToClipboard(allText);
        btnCopyAll.textContent = '✅ Copied!';
        setTimeout(() => { btnCopyAll.textContent = '📋 Copy All'; }, 2000);
        showToast('All listing data copied to clipboard!', 'success');
      });
    }

    // Generate New
    const btnNew = document.getElementById('btn-generate-new');
    if (btnNew) {
      btnNew.addEventListener('click', () => {
        currentListingImage = null;
        DOM.listingImage.value = '';
        lastGeneratedListing = null;
        setWorkflowStep(1);
      });
    }

    // Auto Fill Meesho
    const btnAutoFill = document.getElementById('btn-autofill-meesho');
    if (btnAutoFill) {
      btnAutoFill.addEventListener('click', async () => {
        btnAutoFill.disabled = true;
        btnAutoFill.textContent = '⏳ Sending to Meesho...';

        setWorkflowStep(3);

        try {
          // Find the Meesho supplier tab across ALL windows
          const tabs = await chrome.tabs.query({ url: '*://*.meesho.com/*' });
          const meeshoTab = tabs.find(t => t.url && t.url.includes('supplier.meesho.com'));

          if (!meeshoTab) {
            showAutoFillStatus('error', 'Meesho Supplier Panel tab nahi mila. Pehle supplier.meesho.com kholo, phir Auto Fill karo.');
            btnAutoFill.disabled = false;
            btnAutoFill.textContent = '🚀 Auto Fill Meesho Listing';
            return;
          }

          // Ensure content script is injected (handles case where tab was opened before extension)
          try {
            await chrome.scripting.executeScript({
              target: { tabId: meeshoTab.id },
              files: ['config.js', 'settings.js', 'supabase.js', 'supabaseClient.js', 'authManager.js', 'meeshoApi.js', 'ui.js', 'content.js'],
            });
          } catch (injectErr) {
            // Script may already be loaded — that's OK
            console.log('[DASHBOARD] Content script inject (may already exist):', injectErr.message);
          }

          // Small delay to let injected script initialize
          await new Promise(r => setTimeout(r, 300));

          const autoFillData = {
            title: listing.title,
            description: listing.description,
            keywords: listing.keywords,
            tags: listing.tags,
            category: listing.category,
          };

          // Try sendMessage first — if content script listener is active
          let response;
          try {
            response = await chrome.tabs.sendMessage(meeshoTab.id, {
              action: 'AUTO_FILL_LISTING',
              data: autoFillData,
            });
          } catch (msgErr) {
            console.warn('[DASHBOARD] sendMessage failed, using executeScript fallback:', msgErr.message);
            // Fallback: directly execute auto-fill logic in the tab
            await chrome.scripting.executeScript({
              target: { tabId: meeshoTab.id },
              func: (data) => {
                const setFieldValue = (element, value) => {
                  if (!element) return false;
                  const isTextarea = element.tagName === 'TEXTAREA';
                  const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
                  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                  if (nativeSetter) nativeSetter.call(element, value);
                  else element.value = value;
                  element.focus();
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                  element.dispatchEvent(new Event('blur', { bubbles: true }));
                  return true;
                };

                const findField = (labelTexts, tagFilter = 'input,textarea') => {
                  for (const label of document.querySelectorAll('label, span, div, p, h3, h4, h5, h6')) {
                    const text = (label.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
                    for (const lt of labelTexts) {
                      if (text === lt || (text.includes(lt) && text.length < lt.length + 20)) {
                        for (const c of [label.parentElement, label.closest('div[class]'), label.parentElement?.parentElement, label.closest('div[class]')?.parentElement].filter(Boolean)) {
                          const field = c.querySelector(tagFilter);
                          if (field && field.offsetParent !== null) return field;
                        }
                      }
                    }
                  }
                  return null;
                };

                // Fill title
                if (data.title) {
                  const titleEl = document.querySelector('input[name="product_name"], input[name="productName"], input[name="title"], input[placeholder*="Product" i], input[placeholder*="product name" i]')
                    || findField(['product name', 'title'], 'input[type="text"], input:not([type])');
                  if (titleEl) setFieldValue(titleEl, data.title);
                }

                // Fill description
                if (data.description) {
                  const descEl = document.querySelector('textarea[name="description"], textarea[placeholder*="description" i]')
                    || findField(['description', 'product description'], 'textarea');
                  if (descEl) setFieldValue(descEl, data.description);
                }

                console.log('🚀 Auto-fill executed via scripting fallback');
              },
              args: [autoFillData],
            });
            response = { success: true };
          }

          showAutoFillStatus('success', 'Listing data sent to Meesho! Check your listing page — title, description and keywords have been filled automatically.');
          showToast('Auto Fill complete! Check your Meesho listing page.', 'success');
        } catch (err) {
          console.error('[DASHBOARD] Auto-fill error:', err);
          showAutoFillStatus('error', `Could not auto-fill: ${err.message}. Make sure Meesho catalog page open hai aur form visible hai.`);
        }

        btnAutoFill.disabled = false;
        btnAutoFill.textContent = '🚀 Auto Fill Meesho Listing';
      });
    }
  }

  function showAutoFillStatus(type, message) {
    const container = document.getElementById('autofill-status');
    if (!container) return;
    const icon = type === 'success' ? '✅' : '⚠️';
    container.innerHTML = `<div class="autofill-status ${type === 'error' ? 'error' : ''}">
      <span class="status-icon">${icon}</span>
      <span class="status-text">${escapeHtml(message)}</span>
    </div>`;
  }

  // ══════════════════════════════════════
  //  KEYWORD GENERATOR
  // ══════════════════════════════════════
  DOM.btnRunKeywords.addEventListener('click', async () => {
    const product = document.getElementById('kw-product').value.trim();
    const category = document.getElementById('kw-category').value;
    const count = parseInt(document.getElementById('kw-count').value) || 10;

    if (!product) {
      showToast('Please enter a product name or description.', 'error');
      return;
    }

    DOM.btnRunKeywords.disabled = true;
    DOM.btnRunKeywords.innerHTML = '<span class="btn-icon">⏳</span> Generating keywords...';

    const success = await deductCredits(1);
    if (!success) {
      DOM.btnRunKeywords.disabled = false;
      DOM.btnRunKeywords.innerHTML = '<span class="btn-icon">🔍</span> Generate Keywords';
      return;
    }

    await simulateDelay(1200);

    const keywords = generateKeywords(product, category, count);

    let html = `<h4>🔍 Generated Keywords</h4>
<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">
  Click any keyword to copy it. Use these in your Meesho listing title and description.
</div>
<div class="chip-row" style="margin-bottom:16px;">
  ${keywords.map(k => `<span class="result-chip kw-copy" data-kw="${escapeHtml(k)}">${escapeHtml(k)}</span>`).join('')}
</div>
<button class="btn-copy-all" id="btn-copy-keywords">📋 Copy All Keywords</button>`;

    DOM.resultKeywords.innerHTML = html;
    DOM.resultKeywords.classList.add('active');

    // Copy events
    document.querySelectorAll('.kw-copy').forEach((chip) => {
      chip.addEventListener('click', () => {
        copyToClipboard(chip.dataset.kw);
        showToast(`Copied: ${chip.dataset.kw}`, 'success');
      });
    });

    const btnCopy = document.getElementById('btn-copy-keywords');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        copyToClipboard(keywords.join(', '));
        btnCopy.textContent = '✅ Copied!';
        setTimeout(() => { btnCopy.textContent = '📋 Copy All Keywords'; }, 2000);
        showToast('All keywords copied!', 'success');
      });
    }

    addHistoryEntry('Keyword Generator', product, 'Included in subscription');

    DOM.btnRunKeywords.disabled = false;
    DOM.btnRunKeywords.innerHTML = '<span class="btn-icon">🔍</span> Generate Keywords';
    showToast('Keywords generated successfully.', 'success');
  });

  function generateKeywords(product, category, count) {
    const tokens = tokenize(product);
    const productPattern = findProductPattern(tokens);
    const material = pickPattern(tokens, MATERIAL_PATTERNS, '');
    const style = pickPattern(tokens, STYLE_PATTERNS, '');
    const color = tokens.find(t => COLOR_PALETTE.some(c => c.name.toLowerCase().split(' ')[0] === t)) || '';
    const productName = productPattern?.title || titleCase(tokens.slice(0, 2).join(' '));

    const base = [
      productName.toLowerCase(),
      `${productName.toLowerCase()} online`,
      `buy ${productName.toLowerCase()}`,
      `${productName.toLowerCase()} for ${(productPattern?.audience || 'all').toLowerCase()}`,
      `${productName.toLowerCase()} meesho`,
      `best ${productName.toLowerCase()}`,
      `cheap ${productName.toLowerCase()}`,
      `${productName.toLowerCase()} under 500`,
    ];

    if (material) {
      base.push(`${material.toLowerCase()} ${productName.toLowerCase()}`);
      base.push(`${material.toLowerCase()} ${productName.toLowerCase()} online`);
    }
    if (style) {
      base.push(`${style.toLowerCase()} ${productName.toLowerCase()}`);
    }
    if (color) {
      base.push(`${color} ${productName.toLowerCase()}`);
    }
    if (productPattern?.tags) {
      base.push(...productPattern.tags);
    }

    const categoryKeywords = {
      women_ethnic: ['ethnic wear', 'traditional wear', 'indian wear'],
      fashion: ['fashion', 'trending fashion', 'latest fashion'],
      beauty: ['beauty products', 'skincare', 'cosmetics'],
      home: ['home decor', 'kitchen essentials', 'home furnishing'],
      electronics: ['gadgets', 'tech accessories', 'electronics online'],
      jewelry: ['fashion jewelry', 'artificial jewelry', 'imitation jewelry'],
    };

    if (category !== 'auto' && categoryKeywords[category]) {
      base.push(...categoryKeywords[category]);
    }

    return buildKeywordSet(base).slice(0, count);
  }

  // ══════════════════════════════════════
  //  SHIPPING OPTIMIZER (SUPPLIER-STYLE)
  // ══════════════════════════════════════
  function setupShippingOptimizer() {
    if (!DOM.shipUploadArea || !DOM.shipImageInput) return;

    DOM.shipBuyCreditsBtn?.addEventListener('click', () => {
      DOM.btnBuyCredits?.click();
    });

    DOM.shipApplyPromoBtn?.addEventListener('click', () => {
      const code = DOM.shipPromoCode?.value.trim() || '';
      if (!code) {
        showToast('Enter a promo code.', 'error');
        return;
      }

      showToast(`Promo preview ready for ${code}.`, 'success');
      if (DOM.shipPromoCode) DOM.shipPromoCode.value = '';
    });

    DOM.shipCategorySearch?.addEventListener('focus', () => {
      renderShippingCategoryDropdown(SHIPPING_CATEGORY_OPTIONS);
      DOM.shipCategoryDropdown?.classList.remove('hidden');
    });

    DOM.shipCategorySearch?.addEventListener('input', () => {
      const query = DOM.shipCategorySearch.value.trim().toLowerCase();
      DOM.shipCategoryClear?.classList.toggle('visible', Boolean(query));

      const filtered = !query
        ? SHIPPING_CATEGORY_OPTIONS
        : SHIPPING_CATEGORY_OPTIONS.filter((option) => {
            const haystack = `${option.name} ${option.parentName}`.toLowerCase();
            return haystack.includes(query);
          });

      renderShippingCategoryDropdown(filtered);
      DOM.shipCategoryDropdown?.classList.remove('hidden');
    });

    DOM.shipCategoryClear?.addEventListener('click', () => {
      clearShippingCategorySelection();
      DOM.shipCategorySearch?.focus();
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.shipping-category-search')) {
        DOM.shipCategoryDropdown?.classList.add('hidden');
      }
    });

    DOM.shipUploadArea.addEventListener('click', () => DOM.shipImageInput?.click());

    DOM.shipUploadArea.addEventListener('dragover', (event) => {
      event.preventDefault();
      DOM.shipUploadArea.classList.add('dragover');
    });

    DOM.shipUploadArea.addEventListener('dragleave', () => {
      DOM.shipUploadArea.classList.remove('dragover');
    });

    DOM.shipUploadArea.addEventListener('drop', async (event) => {
      event.preventDefault();
      DOM.shipUploadArea.classList.remove('dragover');
      const [file] = event.dataTransfer?.files || [];
      if (!file) return;
      await handleShippingFile(file);
    });

    DOM.shipImageInput.addEventListener('change', async (event) => {
      const [file] = event.target.files || [];
      if (!file) return;
      await handleShippingFile(file);
    });

    DOM.shipResetBtn?.addEventListener('click', () => {
      resetShippingPanel();
    });
  }

  function renderShippingCategoryDropdown(items) {
    if (!DOM.shipCategoryDropdown) return;

    if (!items.length) {
      DOM.shipCategoryDropdown.innerHTML = '<div class="shipping-dropdown-item"><div class="shipping-dropdown-name">No matching categories</div></div>';
      return;
    }

    DOM.shipCategoryDropdown.innerHTML = items.map((item) => `
      <div class="shipping-dropdown-item" data-ship-category="${escapeHtml(item.id)}">
        <div class="shipping-dropdown-parent">${escapeHtml(item.parentName)}</div>
        <div class="shipping-dropdown-name">${escapeHtml(item.name)}</div>
      </div>
    `).join('');

    DOM.shipCategoryDropdown.querySelectorAll('[data-ship-category]').forEach((option) => {
      option.addEventListener('click', () => {
        selectShippingCategory(option.getAttribute('data-ship-category'));
      });
    });
  }

  function selectShippingCategory(categoryId) {
    const category = SHIPPING_CATEGORY_OPTIONS.find((option) => option.id === categoryId);
    if (!category) return;

    if (DOM.shipCategorySelect) DOM.shipCategorySelect.value = category.id;
    if (DOM.shipCategorySearch) DOM.shipCategorySearch.value = category.name;
    if (DOM.shipCategoryClear) DOM.shipCategoryClear.classList.add('visible');
    if (DOM.shipSelectedCategory) DOM.shipSelectedCategory.classList.remove('hidden');
    if (DOM.shipSelectedCategoryName) {
      DOM.shipSelectedCategoryName.innerHTML = `${escapeHtml(category.parentName)} <span style="color:#64748b;">›</span> ${escapeHtml(category.name)}`;
    }
    DOM.shipCategoryDropdown?.classList.add('hidden');
  }

  function clearShippingCategorySelection() {
    if (DOM.shipCategorySearch) DOM.shipCategorySearch.value = '';
    if (DOM.shipCategorySelect) DOM.shipCategorySelect.value = '';
    DOM.shipCategoryClear?.classList.remove('visible');
    DOM.shipSelectedCategory?.classList.add('hidden');
    if (DOM.shipSelectedCategoryName) DOM.shipSelectedCategoryName.textContent = '';
  }

  async function handleShippingFile(file) {
    const categoryId = DOM.shipCategorySelect?.value;
    if (!categoryId) {
      showToast('Select a category before uploading.', 'error');
      if (DOM.shipImageInput) DOM.shipImageInput.value = '';
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    if (DOM.shipPreviewImg) DOM.shipPreviewImg.src = dataUrl;
    DOM.shipUploadArea?.classList.add('hidden');
    DOM.shipPreviewBox?.classList.remove('hidden');
    DOM.shipSettingsRow?.classList.add('hidden');
    DOM.shipCategorySection?.classList.add('hidden');

    await runShippingAnalysis(file, categoryId);
  }

  async function runShippingAnalysis(file, categoryId) {
    const category = SHIPPING_CATEGORY_OPTIONS.find((option) => option.id === categoryId);
    const target = parseInt(DOM.shipTargetShipping?.value || '80', 10);
    const maxAttempts = parseInt(DOM.shipMaxAttempts?.value || '100', 10);
    const checkpoints = [12, 28, 47, 66, 84, 100];

    DOM.resultShipping?.classList.add('hidden');
    DOM.shipProcessingArea?.classList.remove('hidden');
    if (DOM.shipCurrentStatus) DOM.shipCurrentStatus.textContent = 'Analyzing...';

    for (const progress of checkpoints) {
      renderShippingProcessing(progress, target, maxAttempts, category?.name || 'Selected Category');
      await simulateDelay(170);
    }

    const seed = (file.size || 0) + file.name.length + target + maxAttempts + (category?.baseCost || 50);
    const currentCost = Math.max(category?.baseCost || 48, target + 6 + (seed % 15));
    const optimizedCost = Math.max(24, Math.min(currentCost - 3, target - 2 + (seed % 6)));
    const savings = Math.max(1, currentCost - optimizedCost);
    const savingsPercent = Math.max(6, Math.round((savings / currentCost) * 100));
    const attemptsUsed = Math.min(maxAttempts, 18 + (seed % 23));
    const estWeight = Math.max(120, (category?.weightHint || 240) + (seed % 90));
    const zone = ['North India', 'South India', 'West India', 'East India', 'Metro Cluster'][seed % 5];
    const summary = {
      productName: file.name.replace(/\.[^.]+$/, ''),
      categoryName: category?.name || 'Selected Category',
      parentName: category?.parentName || 'General',
      currentCost,
      optimizedCost,
      savings,
      savingsPercent,
      attemptsUsed,
      maxAttempts,
      target,
      estWeight,
      zone,
      recommendations: [
        'Use lighter inner packaging to reduce volumetric weight.',
        'Test warehouse routing for your top delivery zones first.',
        'Keep product image framing tight to avoid oversized packaging assumptions.',
      ],
    };

    renderShippingResults(summary);
    DOM.shipProcessingArea?.classList.add('hidden');
    DOM.resultShipping?.classList.remove('hidden');
    if (DOM.shipCurrentStatus) DOM.shipCurrentStatus.textContent = `₹${summary.currentCost}`;

    addHistoryEntry('Shipping Optimizer', `${summary.categoryName} · ${summary.productName}`, 'Free');
    showToast('Shipping analysis complete!', 'success');
  }

  function renderShippingProcessing(progress, target, maxAttempts, categoryName) {
    if (!DOM.shipProcessingArea) return;

    const attemptCount = Math.max(1, Math.round((progress / 100) * maxAttempts));
    DOM.shipProcessingArea.innerHTML = `
      <div class="shipping-processing-card">
        <div class="shipping-processing-icon">🎯</div>
        <div class="shipping-processing-title">Finding Best Shipping</div>
        <div class="shipping-processing-subtitle">Scanning supplier-style combinations for ${escapeHtml(categoryName)}</div>
        <div class="shipping-progress-bar">
          <div class="shipping-progress-fill" style="width: ${progress}%;"></div>
        </div>
        <div class="shipping-processing-meta">
          <div class="shipping-meta-pill">
            <span class="shipping-meta-label">Target</span>
            <span class="shipping-meta-value">≤ ₹${target}</span>
          </div>
          <div class="shipping-meta-pill">
            <span class="shipping-meta-label">Attempts</span>
            <span class="shipping-meta-value">${attemptCount} / ${maxAttempts}</span>
          </div>
          <div class="shipping-meta-pill">
            <span class="shipping-meta-label">Status</span>
            <span class="shipping-meta-value">Running</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderShippingResults(result) {
    if (!DOM.resultShipping) return;

    DOM.resultShipping.innerHTML = `
      <div class="shipping-result-card">
        <div class="shipping-result-title">✅ Optimization Complete</div>
        <div class="shipping-result-subtitle">Supplier-panel style summary for ${escapeHtml(result.productName)}</div>

        <div class="shipping-result-grid">
          <div class="shipping-result-metric">
            <span class="shipping-result-label">Category</span>
            <span class="shipping-result-value">${escapeHtml(result.categoryName)}</span>
          </div>
          <div class="shipping-result-metric">
            <span class="shipping-result-label">Delivery Zone</span>
            <span class="shipping-result-value">${escapeHtml(result.zone)}</span>
          </div>
          <div class="shipping-result-metric">
            <span class="shipping-result-label">Estimated Weight</span>
            <span class="shipping-result-value">${result.estWeight} g</span>
          </div>
          <div class="shipping-result-metric">
            <span class="shipping-result-label">Attempts Used</span>
            <span class="shipping-result-value">${result.attemptsUsed} / ${result.maxAttempts}</span>
          </div>
          <div class="shipping-result-metric">
            <span class="shipping-result-label">Current Shipping</span>
            <span class="shipping-result-value">₹${result.currentCost}</span>
          </div>
          <div class="shipping-result-metric">
            <span class="shipping-result-label">Optimized Cost</span>
            <span class="shipping-result-value optimized">₹${result.optimizedCost}</span>
          </div>
        </div>

        <div class="shipping-result-highlight">
          <div class="shipping-highlight-amount">₹${result.savings} saved</div>
          <div class="shipping-highlight-copy">${result.savingsPercent}% lower shipping against current supplier estimate</div>
        </div>

        <div class="shipping-result-actions">
          <button class="shipping-result-btn primary" type="button" id="ship-copy-summary-btn">Copy Summary</button>
          <button class="shipping-result-btn secondary" type="button" id="ship-analyze-new-btn">Analyze Another</button>
        </div>

        <div class="shipping-result-recommendations">
          ${result.recommendations.map((item) => `<div class="shipping-recommendation-item">${escapeHtml(item)}</div>`).join('')}
        </div>
      </div>
    `;

    document.getElementById('ship-copy-summary-btn')?.addEventListener('click', () => {
      copyToClipboard([
        `Category: ${result.parentName} > ${result.categoryName}`,
        `Current Shipping: ₹${result.currentCost}`,
        `Optimized Cost: ₹${result.optimizedCost}`,
        `Savings: ₹${result.savings} (${result.savingsPercent}%)`,
        `Target: ≤ ₹${result.target}`,
      ].join('\n'));
      showToast('Shipping summary copied.', 'success');
    });

    document.getElementById('ship-analyze-new-btn')?.addEventListener('click', () => {
      resetShippingPanel();
    });
  }

  function resetShippingPanel() {
    if (DOM.shipImageInput) DOM.shipImageInput.value = '';
    DOM.shipUploadArea?.classList.remove('hidden');
    DOM.shipPreviewBox?.classList.add('hidden');
    DOM.shipSettingsRow?.classList.remove('hidden');
    DOM.shipCategorySection?.classList.remove('hidden');
    DOM.shipProcessingArea?.classList.add('hidden');
    DOM.resultShipping?.classList.add('hidden');
    if (DOM.resultShipping) DOM.resultShipping.innerHTML = '';
    if (DOM.shipPreviewImg) DOM.shipPreviewImg.removeAttribute('src');
    if (DOM.shipCurrentStatus) DOM.shipCurrentStatus.textContent = 'Ready to analyze';
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read image file.'));
      reader.readAsDataURL(file);
    });
  }

  // ══════════════════════════════════════
  //  PROFIT CALCULATOR (FREE)
  // ══════════════════════════════════════
  DOM.btnRunProfit.addEventListener('click', async () => {
    const selling = parseFloat(document.getElementById('profit-selling').value) || 0;
    const cost = parseFloat(document.getElementById('profit-cost').value) || 0;
    const weight = parseFloat(document.getElementById('profit-weight').value) || 0;
    const categoryKey = document.getElementById('profit-category').value;
    const packaging = parseFloat(document.getElementById('profit-packaging').value) || 0;
    const commissionOverride = parseFloat(document.getElementById('profit-commission-override').value);
    const gst = parseFloat(document.getElementById('profit-gst').value) || 5;
    const targetMargin = parseFloat(document.getElementById('profit-target-margin').value) || 18;

    if (!selling || !cost || !weight) {
      showToast('Please enter selling price, product cost and weight.', 'error');
      return;
    }

    DOM.btnRunProfit.disabled = true;
    DOM.btnRunProfit.innerHTML = '<span class="btn-icon">⏳</span> Calculating...';

    await simulateDelay(800);

    const rule = PROFIT_CATEGORY_RULES[categoryKey] || PROFIT_CATEGORY_RULES.other;
    const commissionRate = Number.isFinite(commissionOverride) ? commissionOverride : rule.commissionRate;
    const shipping = estimateShipping(weight, rule);
    const commissionAmt = (selling * commissionRate / 100);
    const gstAmt = (selling * gst / 100);
    const totalDeductions = commissionAmt + gstAmt + shipping + packaging;
    const netProfit = selling - cost - totalDeductions;
    const margin = selling > 0 ? (netProfit / selling) * 100 : 0;
    const breakEven = calculateBreakEven(cost + shipping + packaging, commissionRate, gst);
    const recommended = calculateRecommendedPrice(cost + shipping + packaging, commissionRate, gst, targetMargin);
    const extraSlabs = Math.max(0, Math.ceil(Math.max(0, weight - rule.baseWeight) / rule.weightStep));
    const profitStatus = netProfit > 0 ? '✅ Profitable' : '❌ Loss';
    const recommendation = netProfit < 0
      ? `Increase price to at least ${formatCurrency(Math.ceil(breakEven))} to avoid losses.`
      : `At ${formatCurrency(selling)}, the product leaves ${margin.toFixed(1)}% margin after estimated platform costs.`;

    const result = `<div class="insight-grid">
  <div class="insight-card emphasis">
    <span class="insight-label">Net Profit</span>
    <strong>${formatCurrency(netProfit)} ${profitStatus}</strong>
    <small>${margin.toFixed(1)}% margin on selling price</small>
  </div>
  <div class="insight-card">
    <span class="insight-label">Estimated Shipping</span>
    <strong>${formatCurrency(shipping)}</strong>
    <small>${rule.label} · ${weight}g · ${extraSlabs} extra slab${extraSlabs === 1 ? '' : 's'}</small>
  </div>
  <div class="insight-card">
    <span class="insight-label">Commission + GST</span>
    <strong>${formatCurrency(commissionAmt + gstAmt)}</strong>
    <small>${commissionRate}% commission · ${gst}% GST</small>
  </div>
</div>
<div class="result-section-card">
  <div class="section-title">Meesho Profit Breakdown</div>
  <div class="result-metric-row"><span>Selling Price</span><strong>${formatCurrency(selling)}</strong></div>
  <div class="result-metric-row"><span>Product Cost</span><strong>-${formatCurrency(cost)}</strong></div>
  <div class="result-metric-row"><span>Shipping Estimate</span><strong>-${formatCurrency(shipping)}</strong></div>
  <div class="result-metric-row"><span>Commission (${commissionRate}%)</span><strong>-${formatCurrency(commissionAmt)}</strong></div>
  <div class="result-metric-row"><span>GST (${gst}%)</span><strong>-${formatCurrency(gstAmt)}</strong></div>
  <div class="result-metric-row"><span>Packaging / Handling</span><strong>-${formatCurrency(packaging)}</strong></div>
  <div class="result-metric-row total"><span>Net Profit</span><strong>${formatCurrency(netProfit)}</strong></div>
</div>
<div class="result-section-card">
  <div class="section-title">Pricing Guidance</div>
  <div class="result-metric-row"><span>Break-even Price</span><strong>${formatCurrency(Math.ceil(breakEven))}</strong></div>
  <div class="result-metric-row"><span>Target Margin Goal</span><strong>${targetMargin}%</strong></div>
  <div class="result-metric-row"><span>Recommended Selling Price</span><strong>${recommended ? formatCurrency(Math.ceil(recommended)) : 'Not available'}</strong></div>
  <p class="result-note">${escapeHtml(recommendation)}</p>
</div>`;

    DOM.resultProfit.innerHTML = result;
    DOM.resultProfit.classList.add('active');
    addHistoryEntry('Shipping & Profit Calc', `${formatCurrency(selling)} · ${rule.label}`, 'Free');

    DOM.btnRunProfit.disabled = false;
    DOM.btnRunProfit.innerHTML = '<span class="btn-icon">📊</span> Calculate Profit — Free';
    showToast('Profit analysis complete!', 'success');
  });

  // ══════════════════════════════════════
  //  BULK LISTING GENERATOR
  // ══════════════════════════════════════
  DOM.btnRunBulk.addEventListener('click', async () => {
    const productsRaw = document.getElementById('bulk-products').value.trim();
    const focus = document.getElementById('bulk-focus').value;

    if (!productsRaw) {
      showToast('Please paste at least one product seed.', 'error');
      return;
    }

    const products = productsRaw.split('\n').map((p) => p.trim()).filter(Boolean);
    if (products.length === 0) {
      showToast('No valid product seeds found.', 'error');
      return;
    }

    const batchSize = products.length;

    DOM.btnRunBulk.disabled = true;
    DOM.btnRunBulk.innerHTML = `<span class="btn-icon">⏳</span> Generating ${products.length} listings...`;

    const success = await deductCredits(batchSize);
    if (!success) {
      DOM.btnRunBulk.disabled = false;
      DOM.btnRunBulk.innerHTML = '<span class="btn-icon">⚡</span> Generate Bulk Listings';
      return;
    }

    await simulateDelay(2000 + products.length * 300);

    let resultHTML = `<h4>⚡ Bulk Listing Results</h4>
<div class="result-section-card">
  <div class="result-metric-row"><span>Products Processed</span><strong>${products.length}</strong></div>
  <div class="result-metric-row"><span>Output Focus</span><strong>${escapeHtml(focus.charAt(0).toUpperCase() + focus.slice(1))}</strong></div>
  <div class="result-metric-row"><span>Access</span><strong>Included in subscription</strong></div>
</div>`;

    const bulkListings = [];

    products.forEach((product, i) => {
      const listing = generateListingDraft({
        rawInput: product,
        audienceOverride: 'auto',
        priceGoal: 0,
        tone: focus === 'catalog' ? 'balanced' : focus,
        imageProfile: null,
      });

      bulkListings.push(listing);

      resultHTML += `<div class="bulk-result-card">
  <div class="bulk-result-head">
    <span class="bulk-index">${i + 1}</span>
    <div style="flex:1">
      <strong>${escapeHtml(listing.title)}</strong>
      <div class="bulk-source">Source: ${escapeHtml(product)}</div>
    </div>
    <button class="btn-copy-all" data-bulk-copy="${i}" style="font-size:11px;padding:4px 10px;" title="Copy this listing">📋</button>
    <button class="btn-autofill" data-bulk-apply="${i}" style="font-size:11px;padding:4px 10px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;border-radius:6px;cursor:pointer;" title="Apply to Meesho">🚀 Apply</button>
  </div>
  <div class="bulk-meta-grid">
    <div><span>Category</span><strong>${escapeHtml(listing.category)}</strong></div>
    <div><span>Tags</span><strong>${escapeHtml(listing.tags.slice(0, 3).join(', '))}</strong></div>
  </div>
  <div style="font-size:11px;color:var(--text-secondary);margin:6px 0;">📝 ${escapeHtml(listing.description.substring(0, 120))}...</div>
  <div class="chip-row">${renderChipList(listing.keywords)}</div>
</div>`;
    });

    DOM.resultBulk.innerHTML = resultHTML;
    DOM.resultBulk.classList.add('active');

    // Wire up bulk copy/apply buttons
    document.querySelectorAll('[data-bulk-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.bulkCopy);
        const l = bulkListings[idx];
        if (!l) return;
        const text = `Title: ${l.title}\nDescription: ${l.description}\nKeywords: ${l.keywords.join(', ')}\nTags: ${l.tags.join(', ')}`;
        copyToClipboard(text);
        btn.textContent = '✅';
        setTimeout(() => { btn.textContent = '📋'; }, 2000);
        showToast('Listing copied!', 'success');
      });
    });

    document.querySelectorAll('[data-bulk-apply]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.bulkApply);
        const l = bulkListings[idx];
        if (!l) return;
        btn.disabled = true;
        btn.textContent = '⏳';
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.url && tab.url.includes('meesho.com')) {
            await chrome.tabs.sendMessage(tab.id, {
              action: 'AUTO_FILL_LISTING',
              data: { title: l.title, description: l.description, keywords: l.keywords, tags: l.tags, category: l.category },
            });
            showToast('Applied to Meesho page!', 'success');
          } else {
            showToast('Open a Meesho listing page first.', 'error');
          }
        } catch (e) {
          showToast('Could not apply. Check Meesho tab.', 'error');
        }
        btn.disabled = false;
        btn.textContent = '🚀 Apply';
      });
    });

    addHistoryEntry('Bulk Listing Generator', `${products.length} products`, 'Included in subscription');

    DOM.btnRunBulk.disabled = false;
    DOM.btnRunBulk.innerHTML = '<span class="btn-icon">⚡</span> Generate Bulk Listings';
    showToast(`Bulk generation complete for ${products.length} products.`, 'success');
  });

  // ══════════════════════════════════════
  //  HISTORY
  // ══════════════════════════════════════
  function addHistoryEntry(tool, detail, cost) {
    const entry = { tool, detail, cost, time: new Date().toLocaleString() };
    analysisHistory.unshift(entry);
    chrome.storage.local.set({ dashboardHistory: analysisHistory.slice(0, 50) });
    renderHistory();
  }

  function renderHistory() {
    if (analysisHistory.length === 0) return;

    let html = `<table class="dash-table">
      <thead><tr>
        <th>Tool</th><th>Detail</th><th>Cost</th><th>Time</th>
      </tr></thead><tbody>`;

    analysisHistory.forEach((entry) => {
      html += `<tr>
        <td><strong>${escapeHtml(entry.tool)}</strong></td>
        <td>${escapeHtml(entry.detail)}</td>
        <td><span class="status-badge ${entry.cost === 'Free' ? 'success' : 'pending'}">${escapeHtml(entry.cost)}</span></td>
        <td>${escapeHtml(entry.time)}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    DOM.historyContent.innerHTML = html;
  }

  async function loadHistory() {
    try {
      const stored = await chrome.storage.local.get(['dashboardHistory']);
      if (stored.dashboardHistory && Array.isArray(stored.dashboardHistory)) {
        analysisHistory = stored.dashboardHistory;
        renderHistory();
      }
    } catch (e) {
      console.warn('[DASHBOARD] Could not load history:', e);
    }
  }

  // ══════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `dash-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  function simulateDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function formatCurrency(value) {
    return `₹${Number(value || 0).toFixed(2)}`;
  }

  function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function tokenize(value) {
    return normalizeText(value).split(/\s+/).filter(Boolean);
  }

  function titleCase(value) {
    return String(value || '')
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  function matchesPattern(tokens, patterns) {
    return patterns.some((pattern) => {
      const normalized = normalizeText(pattern);
      if (!normalized) return false;
      if (normalized.includes(' ')) {
        return tokens.join(' ').includes(normalized);
      }
      return tokens.includes(normalized);
    });
  }

  function pickPattern(tokens, patterns, fallback = '') {
    const match = patterns.find((entry) => matchesPattern(tokens, entry.patterns));
    return match ? match.label : fallback;
  }

  function singularizeLabel(label) {
    const singularMap = {
      'Kurtis': 'Kurti',
      'Sarees': 'Saree',
      'Dresses': 'Dress',
      'Tops & Tunics': 'Top',
      'T-Shirts': 'T-Shirt',
      'Shirts': 'Shirt',
      'Kurta Sets': 'Kurta Set',
      'Ethnic Sets': 'Ethnic Set',
      'Palazzo Pants': 'Palazzo Pant',
      'Dupattas': 'Dupatta',
      'Blouses': 'Blouse',
      'Gowns': 'Gown',
      'Baby Rompers': 'Baby Romper',
      'Baby Sets': 'Baby Set',
      'Baby Dresses': 'Baby Dress',
      'Girls Dresses': 'Girls Dress',
      'Girls Tops': 'Girls Top',
      'Girls Skirts': 'Girls Skirt',
      'Women Sandals': 'Women Sandal',
      'Women Heels': 'Women Heel',
      'Women Flats': 'Women Flat',
      'Women Sneakers': 'Women Sneaker',
      'Women Slippers': 'Women Slipper',
      'Men Casual Shoes': 'Men Casual Shoe',
      'Men Formal Shoes': 'Men Formal Shoe',
      'Men Sports Shoes': 'Men Sports Shoe',
      'Men Sandals': 'Men Sandal',
      'Men Slippers': 'Men Slipper',
      'Kids Shoes': 'Kids Shoe',
      'Kids Sandals': 'Kids Sandal',
      'Handbags': 'Handbag',
      'Sling Bags': 'Sling Bag',
      'Tote Bags': 'Tote Bag',
      'Backpacks': 'Backpack',
      'Wallets': 'Wallet',
      'Belts': 'Belt',
      'Caps': 'Cap',
      'Hats': 'Hat',
      'Necklaces': 'Necklace',
      'Earrings': 'Earring',
      'Bangles': 'Bangle',
      'Bracelets': 'Bracelet',
      'Rings': 'Ring',
      'Anklets': 'Anklet',
      'Jewellery Sets': 'Jewellery Set',
      'Nose Pins': 'Nose Pin',
      'Foundations': 'Foundation',
      'Lipsticks': 'Lipstick',
      'Eyeliners': 'Eyeliner',
      'Mascaras': 'Mascara',
      'Face Masks': 'Face Mask',
      'Pressure Cookers': 'Pressure Cooker',
      'Frying Pans': 'Frying Pan',
      'Lunch Boxes': 'Lunch Box',
      'Water Bottles': 'Water Bottle',
      'Bedsheets': 'Bedsheet',
      'Cushion Covers': 'Cushion Cover',
      'Curtains': 'Curtain',
      'Blankets': 'Blanket',
      'Pillows': 'Pillow',
      'Carpets': 'Carpet',
      'LED Lights': 'LED Light',
      'Mobile Covers': 'Mobile Cover',
      'Phone Cases': 'Phone Case',
      'Screen Guards': 'Screen Guard',
      'Chargers': 'Charger',
      'USB Cables': 'USB Cable',
      'Smart Watches': 'Smart Watch',
      'Power Banks': 'Power Bank',
      'Mobile Holders': 'Mobile Holder',
      'USB Drives': 'USB Drive',
      'Soft Toys': 'Soft Toy',
      'Educational Toys': 'Educational Toy',
      'Puzzle Games': 'Puzzle Game',
      'Building Blocks': 'Building Block',
      'Remote Control Toys': 'Remote Control Toy',
      'Board Games': 'Board Game',
      'Outdoor Toys': 'Outdoor Toy',
      'Yoga Mats': 'Yoga Mat',
      'Dumbbells': 'Dumbbell',
      'Resistance Bands': 'Resistance Band',
      'Skipping Ropes': 'Skipping Rope',
      'Gym Gloves': 'Gym Glove',
      'Fitness Trackers': 'Fitness Tracker',
      'Sports Bottles': 'Sports Bottle',
      'Notebooks': 'Notebook',
      'Diaries': 'Diary',
      'Pens': 'Pen',
      'Pencils': 'Pencil',
      'Office Files': 'Office File',
      'Desk Organizers': 'Desk Organizer',
      'Car Phone Holders': 'Car Phone Holder',
      'Car Chargers': 'Car Charger',
      'Car Seat Covers': 'Car Seat Cover',
      'Car Cleaning Tools': 'Car Cleaning Tool',
      'Bike Covers': 'Bike Cover',
      'Bike Accessories': 'Bike Accessory',
      'Pet Toys': 'Pet Toy',
      'Pet Beds': 'Pet Bed',
      'Pet Feeding Bowls': 'Pet Feeding Bowl',
      'Pet Grooming Tools': 'Pet Grooming Tool',
      'Educational Books': 'Educational Book',
      'Children Books': 'Children Book',
      'Coloring Books': 'Coloring Book',
      'Activity Books': 'Activity Book',
    };
    return singularMap[label] || label;
  }

  function inferCategoryAudience(mainCategory, subcategory) {
    if (mainCategory === 'Women Clothing' || subcategory.startsWith('Women ')) return 'Women';
    if (mainCategory === 'Men Clothing' || subcategory.startsWith('Men ')) return 'Men';
    if (mainCategory === 'Kids Clothing' || subcategory.startsWith('Kids ') || subcategory.startsWith('Baby ') || subcategory.startsWith('Boys ') || subcategory.startsWith('Girls ')) return 'Kids';
    return 'General';
  }

  function buildCategoryPatterns(mainCategory, subcategory) {
    const category = `${mainCategory} > ${subcategory}`;
    const basePatterns = [
      normalizeText(subcategory),
      ...normalizeText(subcategory).split(/\s+/).filter(Boolean),
      ...normalizeText(singularizeLabel(subcategory)).split(/\s+/).filter(Boolean),
    ];
    return Array.from(new Set([...basePatterns, ...(CATEGORY_MATCH_OVERRIDES[category] || []).map((pattern) => normalizeText(pattern))])).filter(Boolean);
  }

  function buildDefaultCategoryTags(mainCategory, subcategory) {
    return buildKeywordSet([
      normalizeText(singularizeLabel(subcategory)),
      normalizeText(subcategory),
      normalizeText(mainCategory),
    ]).slice(0, 3);
  }

  function scoreCategoryMatch(tokens, fullText, entry, audience) {
    let score = 0;

    entry.patterns.forEach((pattern) => {
      if (!pattern) return;
      if (pattern.includes(' ')) {
        if (fullText.includes(pattern)) score += Math.max(4, pattern.split(' ').length * 2);
      } else if (tokens.includes(pattern)) {
        score += 3;
      }
    });

    const subcategoryTokens = normalizeText(entry.subcategory).split(/\s+/).filter(Boolean);
    const matchedSubcategoryTokens = subcategoryTokens.filter((token) => tokens.includes(token));
    score += matchedSubcategoryTokens.length * 2;
    if (subcategoryTokens.length > 1 && matchedSubcategoryTokens.length === subcategoryTokens.length) {
      score += 3;
    }

    if (audience && audience !== 'General') {
      if (entry.audience === audience) {
        score += 3;
      } else if (entry.audience !== 'General') {
        score -= 2;
      }
    }

    return score;
  }

  function getFallbackCategory(tokens, audience) {
    const fallbackOrder = [
      { when: () => audience === 'Women', category: 'Women Clothing > Tops & Tunics' },
      { when: () => audience === 'Men', category: 'Men Clothing > T-Shirts' },
      { when: () => audience === 'Kids', category: 'Kids Clothing > Baby Sets' },
      { when: () => tokens.includes('bottle') || tokens.includes('flask') || tokens.includes('sipper'), category: 'Home & Kitchen > Water Bottles' },
      { when: () => tokens.includes('bedsheet') || (tokens.includes('bed') && tokens.includes('sheet')), category: 'Home & Kitchen > Bedsheets' },
      { when: () => tokens.includes('bag') || tokens.includes('backpack') || tokens.includes('wallet'), category: 'Fashion Accessories > Backpacks' },
      { when: () => tokens.includes('lipstick') || tokens.includes('serum') || tokens.includes('shampoo'), category: 'Beauty & Personal Care > Face Serum' },
      { when: () => tokens.includes('cover') || tokens.includes('charger') || tokens.includes('earphone'), category: 'Electronics & Accessories > Mobile Covers' },
      { when: () => tokens.includes('toy') || tokens.includes('doll') || tokens.includes('puzzle'), category: 'Toys & Games > Educational Toys' },
      { when: () => tokens.includes('notebook') || tokens.includes('diary') || tokens.includes('pen'), category: 'Stationery & Office > Notebooks' },
      { when: () => tokens.includes('book') || tokens.includes('coloring') || tokens.includes('activity'), category: 'Books > Educational Books' },
    ];

    const selected = fallbackOrder.find((entry) => entry.when());
    return MEESHO_CATEGORY_ENTRIES.find((entry) => entry.category === (selected?.category || 'Home & Kitchen > Kitchen Tools'));
  }

  function findProductPattern(tokens, audience) {
    const fullText = tokens.join(' ');
    let bestMatch = null;

    MEESHO_CATEGORY_ENTRIES.forEach((entry) => {
      const score = scoreCategoryMatch(tokens, fullText, entry, audience);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { entry, score };
      }
    });

    if (bestMatch && bestMatch.score > 0) {
      return bestMatch.entry;
    }

    return getFallbackCategory(tokens, audience);
  }

  function detectAudience(tokens, explicitAudience, productPattern) {
    if (explicitAudience && explicitAudience !== 'auto') return explicitAudience;
    if (tokens.includes('women') || tokens.includes('girl') || tokens.includes('ladies')) return 'Women';
    if (tokens.includes('men') || tokens.includes('male') || tokens.includes('boys')) return 'Men';
    if (tokens.includes('kids') || tokens.includes('kid') || tokens.includes('baby')) return 'Kids';
    if (productPattern?.audience && productPattern.audience !== 'General') return productPattern.audience;
    return 'General';
  }

  function detectColor(tokens, imageProfile) {
    const tokenColor = COLOR_PALETTE.find((entry) => tokens.includes(entry.name.toLowerCase().split(' ')[0]));
    return tokenColor?.name || imageProfile?.colorName || 'Multi Color';
  }

  function buildKeywordSet(parts) {
    return Array.from(new Set(parts.filter(Boolean).map((part) => part.trim()).filter(Boolean)));
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    });
  }

  function generateListingDraft({ rawInput, audienceOverride, priceGoal, tone, imageProfile }) {
    const fileSeed = imageProfile?.fileName ? imageProfile.fileName.replace(/\.[^.]+$/, '') : '';
    const tokens = tokenize(`${rawInput} ${fileSeed}`);
    const inferredAudience = detectAudience(tokens, audienceOverride, null);
    const productPattern = findProductPattern(tokens, inferredAudience) || getFallbackCategory(tokens, inferredAudience);
    const audience = detectAudience(tokens, audienceOverride, productPattern);
    const material = pickPattern(tokens, MATERIAL_PATTERNS, productPattern.category === 'Home & Kitchen > Water Bottles' ? 'Stainless Steel' : 'Premium');
    const style = pickPattern(tokens, STYLE_PATTERNS, tone === 'premium' ? 'Premium' : tone === 'seo' ? 'Trending' : 'Classic');
    const color = detectColor(tokens, imageProfile);
    const titleParts = [audience !== 'General' ? audience : '', material, style, color, productPattern.title]
      .filter(Boolean)
      .map((part) => titleCase(part));
    const title = Array.from(new Set(titleParts)).join(' ').replace(/\s+/g, ' ').trim();
    const priceText = priceGoal > 0 ? `Ideal for the ${formatCurrency(priceGoal)} price band.` : 'Designed for strong search visibility and quick marketplace approval.';
    const description = [
      `${title} is crafted for Meesho ${productPattern.subcategory.toLowerCase()} listings and built to perform well on mobile-first product pages.`,
      `Highlights: ${color.toLowerCase()} look, ${material.toLowerCase()} material, ${style.toLowerCase()} styling, and a seller-friendly title structure.`,
      priceText,
    ].join(' ');
    const keywords = buildKeywordSet([
      `${color.toLowerCase()} ${productPattern.title.toLowerCase()}`,
      `${audience.toLowerCase()} ${productPattern.title.toLowerCase()}`,
      `${material.toLowerCase()} ${productPattern.title.toLowerCase()}`,
      `${style.toLowerCase()} ${productPattern.title.toLowerCase()}`,
      ...productPattern.tags,
    ]).slice(0, 6);
    const tags = buildKeywordSet([
      color,
      material,
      style,
      productPattern.title,
      audience,
      tone === 'conversion' ? 'High CTR' : '',
    ]).slice(0, 5);

    return {
      title,
      description,
      category: productPattern.category,
      mainCategory: productPattern.mainCategory,
      subcategory: productPattern.subcategory,
      keywords,
      tags,
      audience,
      color,
      material,
      style,
      priceGoal,
    };
  }

  function renderChipList(items) {
    return items.map((item) => `<span class="result-chip">${escapeHtml(item)}</span>`).join('');
  }

  function estimateShipping(weight, rule) {
    const effectiveWeight = Math.max(weight || rule.baseWeight, rule.baseWeight);
    const extraWeight = Math.max(0, effectiveWeight - rule.baseWeight);
    const slabs = Math.ceil(extraWeight / rule.weightStep);
    return rule.baseShipping + (slabs * rule.shippingIncrement);
  }

  function calculateBreakEven(fixedCost, commissionRate, gstRate) {
    const totalRate = (commissionRate + gstRate) / 100;
    if (totalRate >= 0.95) return fixedCost;
    return fixedCost / (1 - totalRate);
  }

  function calculateRecommendedPrice(fixedCost, commissionRate, gstRate, targetMarginRate) {
    const totalRate = (commissionRate + gstRate + targetMarginRate) / 100;
    if (totalRate >= 0.95) return null;
    return fixedCost / (1 - totalRate);
  }

  function nearestColorName(r, g, b) {
    let best = COLOR_PALETTE[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    COLOR_PALETTE.forEach((entry) => {
      const distance = Math.sqrt(((entry.rgb[0] - r) ** 2) + ((entry.rgb[1] - g) ** 2) + ((entry.rgb[2] - b) ** 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entry;
      }
    });
    return best.name;
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  async function createImageProfile(file) {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);
    const sample = getAverageImageColor(image);
    const colorName = nearestColorName(sample.r, sample.g, sample.b);
    return {
      fileName: file.name,
      dataUrl,
      width: image.width,
      height: image.height,
      orientation: image.width > image.height ? 'landscape' : image.height > image.width ? 'portrait' : 'square',
      colorName,
      colorHex: rgbToHex(sample.r, sample.g, sample.b),
    };
  }

  // Compress image to max 1024px for API calls (keeps payload small)
  function compressImageForAPI(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          const ratio = Math.min(MAX / w, MAX / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Image compression failed'));
      img.src = dataUrl;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image load failed'));
      image.src = src;
    });
  }

  function getAverageImageColor(image) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const sampleSize = 24;
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    context.drawImage(image, 0, 0, sampleSize, sampleSize);
    const { data } = context.getImageData(0, 0, sampleSize, sampleSize);

    let red = 0, green = 0, blue = 0, pixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3];
      if (alpha < 40) continue;
      red += data[index];
      green += data[index + 1];
      blue += data[index + 2];
      pixels += 1;
    }

    if (!pixels) return { r: 200, g: 200, b: 200 };
    return { r: Math.round(red / pixels), g: Math.round(green / pixels), b: Math.round(blue / pixels) };
  }

  // ══════════════════════════════════════
  //  TOP BAR ACTIONS
  // ══════════════════════════════════════
  DOM.btnRefresh.addEventListener('click', async () => {
    DOM.btnRefresh.disabled = true;
    DOM.btnRefresh.textContent = '⏳ Refreshing...';

    await initSession();

    DOM.btnRefresh.disabled = false;
    DOM.btnRefresh.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
    showToast('Data refreshed!', 'success');
  });

  DOM.btnBuyCredits.addEventListener('click', () => {
    openPaymentDrawer();
  });

  if (DOM.btnLoginRedirect) {
    DOM.btnLoginRedirect.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_POPUP' });
    });
  }

  // ══════════════════════════════════════
  //  HASH NAVIGATION (from popup quick-tools)
  // ══════════════════════════════════════
  function navigateToHash() {
    const HASH_MAP = {
      listing: 'listing',
      image: 'listing',    // no standalone image page → listing
      shipping: 'shipping',
      profit: 'profit',
      keywords: 'keywords',
      bulk: 'bulk',
      history: 'history',
      billing: 'listing',
      checkout: 'listing',
    };

    const hash = window.location.hash.replace('#', '').toLowerCase();
    if (hash === 'billing' || hash === 'checkout') {
      openPaymentDrawer();
      return;
    }

    const page = HASH_MAP[hash];
    if (page) {
      const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
      if (navItem) navItem.click();
    }
  }

  DOM.paymentDrawerClose?.addEventListener('click', closePaymentDrawer);
  DOM.paymentDrawerBackdrop?.addEventListener('click', closePaymentDrawer);
  DOM.paymentPhoneInput?.addEventListener('input', () => {
    const digits = DOM.paymentPhoneInput.value.replace(/\D/g, '').slice(0, 10);
    DOM.paymentPhoneInput.value = digits;
  });

  window.addEventListener('message', handleCheckoutMessage);

  // ══════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════
  setupNavigation();
  setupImageUpload();
  setupShippingOptimizer();
  await loadHistory();
  await initSession();
  navigateToHash();
  autoPopulateFromMeesho();
})();
