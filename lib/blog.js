const { getSupabaseClient } = require("./supabase");

async function getPublishedPosts() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

module.exports = {
  getPublishedPosts,
};
