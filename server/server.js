require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// Groq (OpenAI-compatible) Client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

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

// Optimize Route
app.post("/optimize", async (req, res) => {
  try {
    const { title, keywords, category } = req.body;

    if (!title || !category) {
      return res.status(400).json({ success: false, error: "title and category are required" });
    }

    const keywordList = keywords
      ? String(keywords).split(",").map(k => k.trim()).filter(Boolean).join(", ")
      : "";

    const prompt = `You are a Meesho product listing optimizer. Given a product title, category hint, and keywords, generate:
  1. The single most accurate category from the allowed hierarchy below
  2. An optimized SEO-friendly title (max 150 chars)
  3. 5 bullet points highlighting features and benefits
  4. A short product description (2-3 sentences)

  Allowed Meesho category hierarchy:
  ${MEESHO_CATEGORY_HIERARCHY}

Product Title: ${title}
  Category Hint: ${category}
${keywordList ? `Keywords: ${keywordList}` : ""}

  Rules:
  - Choose exactly one category in the format "Main Category > Subcategory".
  - The category must be selected only from the hierarchy above.
  - Pick the closest match based on the product title and keywords.
  - Do not invent categories or return explanations.

  Respond in JSON format: { "category": "Main Category > Subcategory", "optimizedTitle": "...", "bullets": ["...", ...], "description": "..." }`;

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = completion.choices[0].message.content;

    // Try to parse JSON from the response
    let data;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      data = jsonMatch ? JSON.parse(jsonMatch[0]) : { category, optimizedTitle: content, bullets: [], description: "" };
    } catch {
      data = { category, optimizedTitle: content, bullets: [], description: "" };
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error("Groq Error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
