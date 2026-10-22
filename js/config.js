// ── Connect the backend ──────────────────────────────────────────────
// Paste your Supabase project's URL and *publishable/anon* key here.
// (Supabase dashboard → Project Settings → API.) These are safe to publish:
// Row Level Security in the reafrondersbe migrations decides who can write.
// Leave blank to run fully offline from data/seed.json + your browser storage.
export const CONFIG = {
  SUPABASE_URL: 'https://etdxreehedewcctkdvuo.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0ZHhyZWVoZWRld2NjdGtkdnVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzOTkwMDQsImV4cCI6MjEwMTk3NTAwNH0.8ohFQBJzglP2cjsdQW-xQ-g2DPNG0iZiNzRTLQDsVMY',
};

// ── Brand & contact (public — shown on clips, tours and press.html) ─────
export const BRAND = {
  name: 'Futurart by Edward Mundondo',
  email: 'edmundondo@gmail.com',
  instagram: '@edmundondo',
  instagramUrl: 'https://www.instagram.com/edmundondo/',
  site: 'edmundondo.github.io/reafronders',
};
