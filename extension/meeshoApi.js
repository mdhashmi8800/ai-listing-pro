// ============================================================
//  meeshoApi.js — Meesho API Integration
//
//  Provides:
//  ✅ Image upload to Meesho CDN
//  ✅ Duplicate PID detection
//  ✅ Shipping / transfer price fetch
//  ✅ Category tree loading
//  ✅ Smart image variation search (border + badge + noise)
//  ✅ Auto-detection of supplierId, supplierTag, browserId
//
//  Usage:
//    Loaded via content.js (injected into supplier.meesho.com)
//    Also loaded in popup.html for direct calls via scripting API.
//
//  NOTE: All fetch() calls use credentials:'include' so Meesho
//  session cookies are forwarded — this MUST run in the page
//  context (injected script), not an isolated content-script.
// ============================================================

const MeeshoAPI = {
    endpoints: {
        uploadImage: 'https://supplier.meesho.com/catalogingapi/api/singleCatalogUpload/uploadSingleCatalogImages',
        fetchDuplicatePid: 'https://supplier.meesho.com/catalogingapi/api/priceRecommendation/fetchDuplicatePid',
        getTransferPrice: 'https://supplier.meesho.com/catalogingapi/api/singleCatalogUpload/getTransferPrice',
        fetchCategories: 'https://supplier.meesho.com/catalogingapi/api/bulkCatalogUpload/fetchCategoryTreeOld'
    },

    cache: {
        supplierId: null,
        supplierTag: null,
        categoryId: null,
        browserId: null,
        price: 100,
        categories: null
    },

    /** Cache for badge <img> elements so they're only loaded once per session */
    badgeCache: {},

    // ══════════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════════

    init: function () {
        this.detectAllValues();
        console.log('📦 MeeshoAPI initialized');
    },

    // ══════════════════════════════════════════════════════════
    //  AUTO-DETECTION HELPERS
    // ══════════════════════════════════════════════════════════

    detectAllValues: function () {
        this.cache.browserId = this.getCookie('browser_id') || '';
        const urlMatch = window.location.href.match(/\/cataloging\/([^\/]+)/);
        if (urlMatch) this.cache.supplierTag = urlMatch[1];
        this.cache.supplierId = this.detectSupplierId();
        this.cache.price = this.detectPrice();
        console.log('🔍 Detected:', {
            supplierId: this.cache.supplierId,
            supplierTag: this.cache.supplierTag,
            browserId: this.cache.browserId ? 'Yes' : 'No'
        });
    },

    getCookie: function (name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : '';
    },

    detectSupplierId: function () {
        // ── 1. Try Mixpanel cookie
        try {
            const mpCookie = this.getCookie('mp_a66867feba42257f4b46689d52d48f86_mixpanel');
            if (mpCookie) {
                const decoded = JSON.parse(mpCookie);
                if (decoded.Supplier_id) {
                    console.log('✅ Supplier ID from cookie:', decoded.Supplier_id);
                    return decoded.Supplier_id;
                }
            }
        } catch (e) {
            console.warn('Cookie parse error:', e);
        }

        // ── 2. Try localStorage
        try {
            const keys = Object.keys(localStorage);
            for (const key of keys) {
                if (key.includes('supplier') || key.includes('user')) {
                    const val = localStorage.getItem(key);
                    if (val) {
                        const parsed = JSON.parse(val);
                        if (parsed.supplier_id || parsed.supplierId) {
                            const id = parsed.supplier_id || parsed.supplierId;
                            console.log('✅ Supplier ID from localStorage:', id);
                            return id;
                        }
                    }
                }
            }
        } catch (e) { /* silent */ }

        console.warn('⚠️ Supplier ID not found');
        return null;
    },

    detectPrice: function () {
        const inputs = document.querySelectorAll('input');
        for (const inp of inputs) {
            const name = (inp.name || '').toLowerCase();
            if ((name.includes('price') || name === 'mrp') && inp.value && parseInt(inp.value) > 0) {
                return parseInt(inp.value);
            }
        }
        return 100;
    },

    // ══════════════════════════════════════════════════════════
    //  CATEGORY HELPERS
    // ══════════════════════════════════════════════════════════

    setCategory: function (id) {
        this.cache.categoryId = parseInt(id);
        console.log('📁 Category set:', id);
    },

    getCategories: function () {
        return this.cache.categories || [];
    },

    // ══════════════════════════════════════════════════════════
    //  COMMON HEADERS
    // ══════════════════════════════════════════════════════════

    getHeaders: function () {
        return {
            'accept': 'application/json, text/plain, */*',
            'content-type': 'application/json;charset=UTF-8',
            'client-type': 'd-web',
            'client-package-version': '1.0.1',
            'browser-id': this.cache.browserId || '',
            'identifier': this.cache.supplierTag || '',
            'supplier-id': this.cache.supplierId ? String(this.cache.supplierId) : ''
        };
    },

    // ══════════════════════════════════════════════════════════
    //  API CALLS
    // ══════════════════════════════════════════════════════════

    /**
     * Fetch the full sub-sub-category tree from Meesho.
     * Results are cached for the session lifetime.
     * @returns {Promise<Array<{id, name, parentName}>>}
     */
    fetchCategories: async function () {
        if (this.cache.categories) {
            console.log('📂 Using cached categories:', this.cache.categories.length);
            return this.cache.categories;
        }

        console.log('🔄 Fetching categories from API...');

        if (!this.cache.supplierId) {
            console.error('❌ Cannot fetch categories: Supplier ID not found');
            throw new Error('Supplier ID not detected. Please refresh the page.');
        }

        try {
            const resp = await fetch(this.endpoints.fetchCategories, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    bulk_upload_enabled: false,
                    supplier_id: this.cache.supplierId,
                    identifier: this.cache.supplierTag
                }),
                credentials: 'include'
            });

            if (!resp.ok) throw new Error(`API returned ${resp.status}: ${resp.statusText}`);

            const result = await resp.json();
            if (result.items?.length > 0) {
                const subCat = result.items.find(i => i.type === 'sub-sub-category');
                if (subCat?.data) {
                    this.cache.categories = subCat.data.map(c => ({
                        id: parseInt(c.id),
                        name: c.name,
                        parentName: c.parent_name
                    }));
                    console.log('✅ Loaded', this.cache.categories.length, 'categories');
                    return this.cache.categories;
                }
            }

            console.warn('⚠️ No categories found in response');
            return [];
        } catch (e) {
            console.error('❌ Categories fetch error:', e);
            throw e;
        }
    },

    /**
     * Upload an image blob to Meesho CDN.
     * @param {Blob} blob
     * @param {string} [filename]
     * @returns {Promise<string|null>} CDN URL or null on failure
     */
    uploadImage: async function (blob, filename) {
        const formData = new FormData();
        formData.append('file', blob, filename || 'img-' + Date.now() + '.jpg');
        formData.append('data', 'undefined');

        try {
            const resp = await fetch(this.endpoints.uploadImage, {
                method: 'POST',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'browser-id': this.cache.browserId || '',
                    'client-type': 'd-web',
                    'client-package-version': '1.0.1',
                    'identifier': this.cache.supplierTag || '',
                    'supplier-id': this.cache.supplierId ? String(this.cache.supplierId) : ''
                },
                body: formData,
                credentials: 'include'
            });

            if (!resp.ok) return null;
            const result = await resp.json();
            return result.image || null;
        } catch (e) {
            console.error('uploadImage error:', e);
            return null;
        }
    },

    /**
     * Fetch the duplicate PID for an uploaded image URL.
     * @param {string} imageUrl
     * @param {number} [categoryId]
     * @returns {Promise<string|null>}
     */
    fetchDuplicatePid: async function (imageUrl, categoryId) {
        const sscatId = categoryId || this.cache.categoryId || 18044;
        try {
            const resp = await fetch(this.endpoints.fetchDuplicatePid, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    is_old_image_match_enabled: true,
                    sscat_id: sscatId,
                    image_url: imageUrl
                }),
                credentials: 'include'
            });

            if (!resp.ok) return null;
            const result = await resp.json();
            return result.data?.duplicate_pid || null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Get shipping / transfer price for an image URL.
     * Also fetches the duplicate PID internally if an imageUrl is provided.
     * @param {string|null} imageUrl
     * @returns {Promise<{shippingCharges: number, duplicatePid: string|null}|null>}
     */
    getShippingCharges: async function (imageUrl) {
        const sscatId = this.cache.categoryId || 18044;
        let duplicatePid = null;

        if (imageUrl) duplicatePid = await this.fetchDuplicatePid(imageUrl, sscatId);

        try {
            const body = {
                sscat_id: sscatId,
                gst_percentage: 0,
                price: this.cache.price,
                supplier_id: this.cache.supplierId,
                gst_type: 'GSTIN',
                image_url: imageUrl
            };
            if (duplicatePid) body.duplicate_pid = duplicatePid;

            const resp = await fetch(this.endpoints.getTransferPrice, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(body),
                credentials: 'include'
            });

            if (!resp.ok) return null;
            const result = await resp.json();
            return { shippingCharges: result.shipping_charges, duplicatePid };
        } catch (e) {
            return null;
        }
    },

    // ══════════════════════════════════════════════════════════
    //  SMART SEARCH (main entry point for image optimiser)
    // ══════════════════════════════════════════════════════════

    /**
     * Run the smart image-variation search loop.
     *
     * @param {Blob}     originalBlob     Source image blob
     * @param {number}   targetShipping   Stop early if shipping ≤ this value
     * @param {number}   maxAttempts      Max variations to try
     * @param {Function} onProgress       (attempt, max, bestCost) => void
     * @param {Function} onFound          (result) => void — called when target reached
     * @param {Function} shouldStopFn     () => boolean
     * @param {Function} isPausedFn       () => boolean
     * @returns {Promise<{success, results, bestResult, targetReached, attempts}>}
     */
    smartSearch: async function (originalBlob, targetShipping, maxAttempts, onProgress, onFound, shouldStopFn, isPausedFn) {
        this.detectAllValues();
        await this.preloadBadges();

        const results = [];
        let bestResult = null;
        let attempt = 0;

        while (attempt < maxAttempts) {
            // ── Stop / pause checks
            if (shouldStopFn && shouldStopFn()) break;
            if (isPausedFn && isPausedFn()) { await new Promise(r => setTimeout(r, 200)); continue; }

            attempt++;
            if (onProgress) onProgress(attempt, maxAttempts, bestResult?.shippingCost);

            try {
                const variation = await this.generateVariation(originalBlob, attempt);
                if (!variation) continue;

                const imageUrl = await this.uploadImage(variation.blob, `v${attempt}.jpg`);
                if (!imageUrl) continue;

                const priceData = await this.getShippingCharges(imageUrl);
                if (!priceData?.shippingCharges) continue;

                const result = {
                    name: `Var-${attempt}`,
                    dataUrl: variation.dataUrl,
                    meeshoImageUrl: imageUrl,
                    originalBlob: variation.blob,
                    shippingCost: priceData.shippingCharges,
                    duplicatePid: priceData.duplicatePid,
                    isVerified: !!priceData.duplicatePid
                };

                results.push(result);
                if (!bestResult || result.shippingCost < bestResult.shippingCost) bestResult = result;

                // ── Early exit if target reached
                if (priceData.duplicatePid && priceData.shippingCharges <= targetShipping) {
                    if (onFound) onFound(result);
                    break;
                }

                await new Promise(r => setTimeout(r, 30)); // Tiny yield to keep UI responsive
            } catch (e) {
                console.error(`[Attempt ${attempt}]`, e.message);
            }
        }

        results.sort((a, b) => a.shippingCost - b.shippingCost);
        return {
            success: results.length > 0,
            results: results.slice(0, 20),
            bestResult,
            targetReached: bestResult?.shippingCost <= targetShipping,
            attempts: attempt
        };
    },

    // ══════════════════════════════════════════════════════════
    //  IMAGE VARIATION ENGINE
    // ══════════════════════════════════════════════════════════

    /** Preload all 25 badge images concurrently to avoid per-variation delay */
    preloadBadges: async function () {
        const promises = [];
        for (let i = 1; i <= 25; i++) promises.push(this.loadBadge(i));
        await Promise.allSettled(promises);
    },

    /**
     * Generate one canvas-based image variation:
     *  • Adds a solid vibrant-color border (30–200 px)
     *  • Overlays 1–3 random badge images
     *  • Applies a tiny noise pattern to uniqueify pixel data
     *
     * @param {Blob}   originalBlob
     * @param {number} seed  Variation index (drives strategy selection)
     * @returns {Promise<{blob: Blob, dataUrl: string}>}
     */
    generateVariation: async function (originalBlob, seed) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(originalBlob);

            img.onload = async () => {
                try {
                    const w = img.width, h = img.height;

                    // ── Border size strategy (wider = more unique hash)
                    const strategy = seed % 10;
                    let border;
                    switch (strategy) {
                        case 0: border = 30 + Math.floor(Math.random() * 30); break; // 30-60 px
                        case 1: border = 50 + Math.floor(Math.random() * 40); break; // 50-90 px
                        case 2: border = 70 + Math.floor(Math.random() * 50); break; // 70-120 px
                        case 3: border = 90 + Math.floor(Math.random() * 60); break; // 90-150 px
                        case 4: border = 110 + Math.floor(Math.random() * 70); break; // 110-180 px
                        case 5: border = 130 + Math.floor(Math.random() * 71); break; // 130-200 px
                        case 6: border = 40 + Math.floor(Math.random() * 80); break; // 40-120 px
                        case 7: border = 60 + Math.floor(Math.random() * 100); break; // 60-160 px
                        case 8: border = 80 + Math.floor(Math.random() * 120); break; // 80-200 px
                        default: border = 30 + Math.floor(Math.random() * 171); break; // 30-200 px
                    }

                    const finalW = w + border * 2;
                    const finalH = h + border * 2;
                    const canvas = document.createElement('canvas');
                    canvas.width = finalW;
                    canvas.height = finalH;
                    const ctx = canvas.getContext('2d');

                    // ── Vibrant border palette (cool/deep tones only — no warm oranges/yellows)
                    const colors = [
                        // Pure primaries
                        '#FF0000', '#00FF00', '#0000FF', '#FF00FF', '#00FFFF',
                        // Reds & Pinks
                        '#FF1744', '#F50057', '#D50000', '#C62828', '#B71C1C', '#FF5252',
                        '#E91E63', '#EC407A', '#FF4081', '#C51162', '#880E4F',
                        // Greens & Teals
                        '#00E676', '#00C853', '#00BFA5', '#00897B', '#00695C', '#1B5E20',
                        '#2E7D32', '#388E3C', '#43A047', '#4CAF50', '#66BB6A', '#76FF03',
                        '#64DD17', '#69F0AE', '#1DE9B6', '#004D40',
                        // Blues
                        '#2979FF', '#2962FF', '#0091EA', '#0277BD', '#01579B', '#1565C0',
                        '#1976D2', '#1E88E5', '#42A5F5', '#0D47A1', '#304FFE', '#3D5AFE',
                        '#448AFF', '#82B1FF', '#00B8D4', '#0097A7', '#00838F', '#006064',
                        // Purples & Violets
                        '#AA00FF', '#D500F9', '#E040FB', '#7C4DFF', '#651FFF', '#6200EA',
                        '#4A148C', '#6A1B9A', '#7B1FA2', '#8E24AA', '#9C27B0', '#AB47BC',
                        '#BA68C8', '#CE93D8', '#EA80FC',
                        // Magentas
                        '#F50057', '#C51162', '#FF4081', '#E91E63', '#EC407A', '#F06292',
                        '#FF1744', '#FF5252', '#FF80AB', '#F48FB1', '#AD1457', '#880E4F',
                        // Cyans
                        '#00BCD4', '#00ACC1', '#0097A7', '#00838F', '#006064', '#00E5FF',
                        '#18FFFF', '#84FFFF', '#26A69A', '#4DB6AC', '#80CBC4',
                        // Neons
                        '#FF3D00', '#FF6E40', '#AEEA00', '#76FF03', '#00E676', '#1DE9B6',
                        '#00E5FF', '#40C4FF', '#448AFF', '#536DFE', '#7C4DFF', '#E040FB',
                        '#FF4081', '#FF5252',
                        // Indigos
                        '#3F51B5', '#3949AB', '#303F9F', '#283593', '#1A237E', '#5C6BC0',
                        '#7986CB', '#9FA8DA', '#C5CAE9',
                        // Light Blues
                        '#03A9F4', '#039BE5', '#0288D1', '#0277BD', '#01579B', '#29B6F6',
                        '#4FC3F7', '#81D4FA',
                        // Limes (strong)
                        '#CDDC39', '#C0CA33', '#AFB42B', '#9E9D24', '#827717', '#D4E157',
                        // Darks for contrast
                        '#000000', '#212121', '#424242', '#616161'
                    ];

                    const borderColor = colors[Math.floor(Math.random() * colors.length)];

                    // ── Solid fill (single colour, no gradient for maximum uniqueness)
                    ctx.fillStyle = borderColor;
                    ctx.fillRect(0, 0, finalW, finalH);
                    console.log('🎨 Border:', borderColor, border + 'px');

                    // ── Draw original image centred inside the border
                    ctx.drawImage(img, border, border, w, h);

                    // ── Badge overlays
                    const badgeCount = 1 + Math.floor(Math.random() * 3);
                    await this.addBadges(ctx, finalW, finalH, border, badgeCount);

                    // ── Noise layer (tiny pixel perturbation)
                    this.addNoise(ctx, finalW, finalH, seed);

                    // ── Export to JPEG blob
                    const quality = 0.75 + Math.random() * 0.2;
                    canvas.toBlob(blob => {
                        URL.revokeObjectURL(objectUrl);
                        const reader = new FileReader();
                        reader.onload = () => resolve({ blob, dataUrl: reader.result });
                        reader.readAsDataURL(blob);
                    }, 'image/jpeg', quality);

                } catch (e) {
                    URL.revokeObjectURL(objectUrl);
                    reject(e);
                }
            };

            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Image load failed'));
            };

            img.src = objectUrl;
        });
    },

    /**
     * Overlay badge images onto the canvas at random corner positions.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} w       Full canvas width
     * @param {number} h       Full canvas height
     * @param {number} border  Border thickness (badges placed inside the image area)
     * @param {number} count   How many badges to draw
     */
    addBadges: async function (ctx, w, h, border, count) {
        const positions = [
            { x: border + 5, y: border + 5 },
            { x: w - border - 80, y: border + 5 },
            { x: border + 5, y: h - border - 80 },
            { x: w - border - 80, y: h - border - 80 }
        ].sort(() => Math.random() - 0.5);

        for (let i = 0; i < count && i < positions.length; i++) {
            const num = 1 + Math.floor(Math.random() * 25);
            const size = 40 + Math.floor(Math.random() * 60);
            try {
                const badge = await this.loadBadge(num);
                if (badge) ctx.drawImage(badge, positions[i].x, positions[i].y, size, size);
            } catch (e) { /* skip missing badge */ }
        }
    },

    /**
     * Perturb a small number of pixels to make each variation's file hash unique.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} w
     * @param {number} h
     * @param {number} seed
     */
    addNoise: function (ctx, w, h, seed) {
        const data = ctx.getImageData(0, 0, w, h);
        const d = data.data;
        for (let i = 0; i < 50; i++) {
            const px = Math.floor(Math.random() * (d.length / 4)) * 4;
            d[px] = (d[px] + seed + i) % 256;
        }
        ctx.putImageData(data, 0, 0);
    },

    /**
     * Load a badge image (from the extension's Badge folder) and cache it.
     * @param {number} num  Badge number 1–25
     * @returns {Promise<HTMLImageElement|null>}
     */
    loadBadge: async function (num) {
        if (this.badgeCache[num]) return this.badgeCache[num];
        return new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => { this.badgeCache[num] = img; resolve(img); };
            img.onerror = () => resolve(null);
            // chrome.runtime.getURL works in both content-scripts and in popup context
            img.src = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
                ? chrome.runtime.getURL('Badge/badge' + num + '.png')
                : '/Badge/badge' + num + '.png';
        });
    },

    // ══════════════════════════════════════════════════════════
    //  STATUS CHECK
    // ══════════════════════════════════════════════════════════

    /**
     * Returns true if the supplier ID has been detected (API calls will succeed).
     */
    isReady: function () {
        this.detectAllValues();
        return this.cache.supplierId !== null;
    }
};

// ── Initialize on load
MeeshoAPI.init();

// ── Expose globally so popup.js / content.js can both reach it
window.MeeshoAPI = MeeshoAPI;
