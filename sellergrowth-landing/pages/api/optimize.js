import { getSupabaseClient } from "../../lib/supabase";

function buildMockOptimization({ title, keywords, category }) {
  const cleanTitle = String(title).trim();
  const cleanKeywords = String(keywords)
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const cleanCategory = String(category).trim();

  const keywordSuffix = cleanKeywords.length
    ? ` | ${cleanKeywords.slice(0, 3).join(" • ")}`
    : "";
  const optimizedTitle = `${cleanTitle} (${cleanCategory})${keywordSuffix}`.slice(
    0,
    150
  );

  const bullets = [
    `Category-focused: tailored for ${cleanCategory}.`,
    cleanKeywords.length
      ? `Search keywords included: ${cleanKeywords
          .slice(0, 6)
          .join(", ")}.`
      : "Search keywords included for discoverability.",
    "Clear benefits highlighted for faster buyer decisions.",
    "Optimized structure for better readability on mobile.",
    "Consistent tone and formatting across the listing.",
  ];

  const description = [
    `${cleanTitle} is optimized for ${cleanCategory} listings.`,
    cleanKeywords.length
      ? `Includes relevant search keywords such as ${cleanKeywords
          .slice(0, 8)
          .join(", ")}.`
      : "Includes relevant search keywords to improve visibility.",
    "Use the bullet points to communicate key benefits, specs, and what’s included.",
  ].join(" ");

  return { optimizedTitle, bullets, description };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ success: false, error: "Invalid JSON body" });
    }
  }

  const title = body?.title;
  const keywords = body?.keywords;
  const category = body?.category;

  if (
    typeof title !== "string" ||
    typeof keywords !== "string" ||
    typeof category !== "string" ||
    !title.trim() ||
    !category.trim()
  ) {
    return res.status(400).json({
      success: false,
      error: "Body must include { title: string, keywords: string, category: string }",
    });
  }

  const data = buildMockOptimization({ title, keywords, category });

  try {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from("optimization_logs").insert({
        title,
        keywords,
        category,
      });
      if (error) console.error("[optimize] supabase insert failed:", error);
    }
  } catch (err) {
    console.error("[optimize] supabase logging error:", err);
  }

  return res.status(200).json({ success: true, data });
}
