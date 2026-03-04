// redirect.js - Short URL redirect handler
document.addEventListener('DOMContentLoaded', function() {
    // Get the shortcode from URL
    const path = window.location.pathname; // e.g., "/Gooo" or "/#7QzyXW"
    let shortcode = path.substring(1); // Remove leading "/"
    
    // Handle hash-based shortcodes like "/#7QzyXW"
    if (shortcode === '' && window.location.hash) {
        shortcode = window.location.hash.substring(1); // Remove leading "#"
    }
    
    console.log('Shortcode detected:', shortcode);
    
    if (shortcode && shortcode !== '') {
        redirectToLongUrl(shortcode);
    } else {
        // If no shortcode, redirect to homepage
        window.location.href = 'index.html';
    }
});

async function redirectToLongUrl(shortcode) {
    // Initialize Supabase (same as before)
    if (!window.SUPABASE_CONFIG) {
        console.error('Supabase config missing');
        window.location.href = 'index.html';
        return;
    }

    try {
        const supabase = window.supabase.createClient(
            window.SUPABASE_CONFIG.URL,
            window.SUPABASE_CONFIG.ANON_KEY
        );

        // Find the link with this shortcode
        const { data, error } = await supabase
            .from('links')
            .select('*')
            .eq('shortcode', shortcode)
            .single();

        if (error || !data) {
            console.log('Link not found:', shortcode);
            // Show 404 page
            showNotFound(shortcode);
            return;
        }

        // Check if link is active
        if (data.status !== 'active') {
            showError('This link is inactive');
            return;
        }

        // Check if password protected
        if (data.password && data.password !== '') {
            // Show password form
            showPasswordForm(shortcode, data.longurl, data.password);
            return;
        }

        // Increment click count (background)
        incrementClickCount(shortcode, supabase);

        // Redirect to long URL
        window.location.href = data.longurl;

    } catch (error) {
        console.error('Redirect error:', error);
        showError('Something went wrong');
    }
}

function showNotFound(shortcode) {
    document.body.innerHTML = `
        <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
            <h1 style="color: #f56565;">404 - Link Not Found</h1>
            <p>The short link <strong>${shortcode}</strong> doesn't exist or has been removed.</p>
            <p><a href="index.html" style="color: #667eea;">Create your own short link</a></p>
        </div>
    `;
}

function showError(message) {
    document.body.innerHTML = `
        <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
            <h1 style="color: #f56565;">Error</h1>
            <p>${message}</p>
            <p><a href="index.html" style="color: #667eea;">Go to homepage</a></p>
        </div>
    `;
}

function showPasswordForm(shortcode, longurl, correctPassword) {
    document.body.innerHTML = `
        <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto;">
            <h2 style="color: #667eea;">🔒 Protected Link</h2>
            <p>This link is password protected</p>
            <input type="password" id="passwordInput" placeholder="Enter password" style="padding: 10px; width: 100%; margin: 10px 0; border: 1px solid #e0e0e0; border-radius: 5px;">
            <button onclick="checkPassword('${shortcode}', '${longurl}', '${correctPassword}')" style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Submit</button>
            <p><a href="index.html" style="color: #667eea;">Go back</a></p>
        </div>
    `;
}

// Make password check function global
window.checkPassword = function(shortcode, longurl, correctPassword) {
    const entered = document.getElementById('passwordInput').value;
    if (entered === correctPassword) {
        window.location.href = longurl;
    } else {
        alert('Incorrect password');
    }
};

async function incrementClickCount(shortcode, supabase) {
    try {
        // First get current clicks
        const { data } = await supabase
            .from('links')
            .select('clicks')
            .eq('shortcode', shortcode)
            .single();

        if (data) {
            const currentClicks = data.clicks || 0;
            
            // Update click count
            await supabase
                .from('links')
                .update({ 
                    clicks: currentClicks + 1,
                    lastclicked: new Date().toISOString()
                })
                .eq('shortcode', shortcode);
        }
    } catch (error) {
        console.error('Error incrementing clicks:', error);
    }
                          }
