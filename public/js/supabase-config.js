// Supabase Configuration & Realtime Client Helper
// For Static Hosting on Hostinger (Zero Backend Server Required!)

const SUPABASE_CONFIG = {
  // Replace these with your Supabase project credentials from Project Settings -> API
  url: window.SUPABASE_URL || localStorage.getItem('APT_SUPABASE_URL') || localStorage.getItem('WAYGROUND_SUPABASE_URL') || '',
  anonKey: window.SUPABASE_ANON_KEY || localStorage.getItem('APT_SUPABASE_ANON_KEY') || localStorage.getItem('WAYGROUND_SUPABASE_ANON_KEY') || ''
};

class SupabaseManager {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.init();
  }

  init() {
    if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey && window.supabase) {
      try {
        this.client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
          realtime: {
            params: {
              eventsPerSecond: 40
            }
          }
        });
        this.initialized = true;
        console.log('✅ Supabase initialized successfully for static hosting!');
      } catch (e) {
        console.error('Failed to initialize Supabase client:', e);
      }
    }
  }

  saveCredentials(url, anonKey) {
    SUPABASE_CONFIG.url = url.trim();
    SUPABASE_CONFIG.anonKey = anonKey.trim();
    localStorage.setItem('APT_SUPABASE_URL', SUPABASE_CONFIG.url);
    localStorage.setItem('APT_SUPABASE_ANON_KEY', SUPABASE_CONFIG.anonKey);
    this.init();
  }

  isConfigured() {
    return !!(this.client && this.initialized);
  }
}

window.supabaseManager = new SupabaseManager();
