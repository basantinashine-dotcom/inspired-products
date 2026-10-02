import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

export const isConfigured = Boolean(url && key);

// One client for the whole app. It stores the signed-in session in the
// browser and attaches it to every request, which is how the database knows
// whose projects to return.
export const supabase = isConfigured ? createClient(url, key) : null;
