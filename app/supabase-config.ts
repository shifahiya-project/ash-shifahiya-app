// Connection details for the Supabase project that stores progress across
// devices. Both values are meant to be public: the anon key only grants what
// the row-level security policies in supabase/schema.sql allow, which is
// access to the signed-in learner's own row and nothing else.
//
// Copy them from the Supabase dashboard: Project Settings → API →
// "Project URL" and "anon public". Leave them empty to run the course purely
// locally — the sign-in panel then stays hidden and nothing is sent anywhere.
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

export const isSyncConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
