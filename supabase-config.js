// Supabase Configuration
// Replace with your actual Supabase credentials
const SUPABASE_CONFIG = {
    URL: 'https://ijyimxdnphtpbmdbyeox.supabase.co', // Replace with your Supabase URL
    ANON_KEY: 'sb_publishable_6rzU7uTUzZjD5qqzt6BNaw_59gFmIU6', // Replace with your Supabase anon key
    
    // Table names
    TABLES: {
        LINKS: 'links',
        ANALYTICS: 'analytics',
        USERS: 'users'
    }
};

// Make it globally available
window.SUPABASE_CONFIG = SUPABASE_CONFIG;