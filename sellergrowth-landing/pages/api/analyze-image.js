const MEESHO_CATEGORY_HIERARCHY = `
Women Clothing: Kurtis, Kurta Sets, Sarees, Dresses, Tops & Tunics, T-Shirts, Shirts, Jeans, Jeggings, Leggings, Palazzo Pants, Ethnic Sets, Skirts, Nightwear, Innerwear, Maternity Wear, Ethnic Bottomwear, Dupattas, Ethnic Jackets, Blouses, Lehenga Choli, Gowns
Men Clothing: T-Shirts, Shirts, Casual Shirts, Formal Shirts, Jeans, Trousers, Ethnic Wear, Kurtas, Sherwanis, Jackets, Blazers, Hoodies, Sweatshirts, Track Pants, Shorts, Innerwear, Nightwear
Kids Clothing: Baby Rompers, Baby Sets, Baby Dresses, Boys T-Shirts, Boys Shirts, Boys Jeans, Boys Ethnic Wear, Boys Shorts, Girls Dresses, Girls Tops, Girls Skirts, Girls Ethnic Wear, Kids Nightwear, Kids Innerwear
Footwear: Women Sandals, Women Heels, Women Flats, Women Sneakers, Women Slippers, Men Casual Shoes, Men Formal Shoes, Men Sports Shoes, Men Sandals, Men Slippers, Kids Shoes, Kids Sandals
Fashion Accessories: Handbags, Sling Bags, Tote Bags, Backpacks, Wallets, Belts, Caps, Hats, Sunglasses, Watches, Hair Accessories, Scarves, Stoles
Jewellery: Necklaces, Earrings, Bangles, Bracelets, Rings, Anklets, Jewellery Sets, Nose Pins, Mangalsutra, Maang Tikka, Bridal Jewellery
Beauty & Personal Care: Face Makeup, Lip Makeup, Eye Makeup, Foundations, Lipsticks, Eyeliners, Mascaras, Blush, Highlighters, Face Wash, Face Cream, Face Serum, Face Masks, Sunscreen, Shampoo, Conditioner, Hair Oil, Hair Serum, Hair Color, Deodorants, Perfumes, Body Lotion
Home & Kitchen: Cookware, Nonstick Cookware, Pressure Cookers, Frying Pans, Kitchen Tools, Kitchen Storage, Lunch Boxes, Water Bottles, Dinner Sets, Glassware, Kitchen Organizers, Bedsheets, Cushion Covers, Curtains, Blankets, Pillows, Carpets, Wall Decor, Photo Frames, Showpieces, Lamps, LED Lights
Electronics & Accessories: Mobile Covers, Phone Cases, Screen Guards, Chargers, USB Cables, Earphones, Bluetooth Headphones, Smart Watches, Power Banks, Mobile Holders, Laptop Accessories, Computer Accessories, USB Drives
Toys & Games: Soft Toys, Educational Toys, Puzzle Games, Building Blocks, Remote Control Toys, Dolls, Board Games, Outdoor Toys
Sports & Fitness: Yoga Mats, Dumbbells, Resistance Bands, Skipping Ropes, Gym Gloves, Fitness Trackers, Sports Bottles
Stationery & Office: Notebooks, Diaries, Pens, Pencils, Art Supplies, Office Files, Desk Organizers
Automotive Accessories: Car Phone Holders, Car Chargers, Car Seat Covers, Car Cleaning Tools, Bike Covers, Bike Accessories
Pet Supplies: Pet Toys, Pet Beds, Pet Feeding Bowls, Pet Grooming Tools
Books: Educational Books, Children Books, Coloring Books, Activity Books`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch {
      return res.status(400).json({ success: false, error: 'Invalid JSON body' });
    }
  }

  const { image, hints, audience, priceGoal, tone } = body || {};

  if (!image) {
    return res.status(400).json({ success: false, error: 'image (base64 data URL) is required' });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!GROQ_API_KEY) {
    return res.status(500).json({ success: false, error: 'Vision API key not configured' });
  }

  const extraContext = [
    hints ? `Seller hints: ${hints}` : '',
    audience && audience !== 'auto' ? `Target buyer: ${audience}` : '',
    priceGoal ? `Target price: ₹${priceGoal}` : '',
    tone ? `Tone: ${tone}` : '',
  ].filter(Boolean).join('. ');

  const prompt = `You are a Meesho marketplace product listing expert. Analyze this product image carefully and generate a complete, optimized listing.

${extraContext ? `Additional context from seller: ${extraContext}\n` : ''}
Allowed Meesho category hierarchy (pick EXACTLY one "Main Category > Subcategory"):
${MEESHO_CATEGORY_HIERARCHY}

Based ONLY on what you see in the image, generate:
1. "title" — SEO-optimized product title for Meesho (max 150 chars). Include: target audience, material/type, color, product type, and use-case.
2. "category" — Exact category from above in format "Main Category > Subcategory".
3. "description" — 2-3 sentence product description highlighting features visible in the image.
4. "keywords" — Array of 6 search keywords buyers would use to find this product.
5. "tags" — Array of 5 attribute tags (color, material, style, audience, occasion).
6. "color" — Dominant color of the product.
7. "material" — Best guess of the material (fabric, plastic, metal, etc.).
8. "audience" — Target audience (Women, Men, Kids, Home, General).

Respond ONLY with valid JSON: { "title": "...", "category": "...", "description": "...", "keywords": [...], "tags": [...], "color": "...", "material": "...", "audience": "..." }`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image } },
          ],
        }],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[analyze-image] Groq API error:', response.status, errText);
      return res.status(502).json({ success: false, error: 'Vision API request failed' });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';

    let data;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      data = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      data = null;
    }

    if (!data || !data.title) {
      return res.status(502).json({ success: false, error: 'Could not parse vision response', raw: content });
    }

    // Ensure arrays
    if (!Array.isArray(data.keywords)) data.keywords = [];
    if (!Array.isArray(data.tags)) data.tags = [];

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[analyze-image] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to analyze image' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
