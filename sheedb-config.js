// SheetDB Configuration
// Replace with your actual SheetDB API URL from https://sheetdb.io
const SHEETDB_CONFIG = {
    API_URL: 'https://sheetdb.io/api/v1/z0uon20l8kavz', // Replace this!
    
    // Sheet names
    SHEETS: {
        LINKS: 'links',
        ANALYTICS: 'analytics',
        USERS: 'users'
    }
};

// Make it globally available
window.SHEETDB_CONFIG = SHEETDB_CONFIG;
