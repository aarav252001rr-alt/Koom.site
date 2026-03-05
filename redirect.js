// redirect.js - Short URL redirect handler
document.addEventListener('DOMContentLoaded', function() {
    // URL se shortcode nikalna (leading aur trailing slashes hatana)
    let path = window.location.pathname.replace(/^\/|\/$/g, ''); 
    let shortcode = decodeURIComponent(path); // URL encoding fix
    
    // Purane hash (#) wale links ka fallback support
    if (shortcode === '' && window.location.hash) {
        shortcode = decodeURIComponent(window.location.hash.substring(1)); 
    }
    
    // Agar URL me direct koi html file open ho rahi hai toh usko ignore karein
    if (shortcode.includes('.html') || shortcode === '') {
        if (shortcode === '' || shortcode === 'redirect.html') {
            window.location.href = 'index.html';
        }
        return;
    }

    console.log('Searching for Shortcode:', shortcode);
    redirectToLongUrl(shortcode);
});

async function redirectToLongUrl(shortcode) {
    if (!window.SUPABASE_CONFIG) {
        console.error('Supabase configuration missing');
        window.location.href = 'index.html';
        return;
    }

    try {
        const supabase = window.supabase.createClient(
            window.SUPABASE_CONFIG.URL,
            window.SUPABASE_CONFIG.ANON_KEY
        );

        // Dynamic Table Name Check (Sabse badi problem yahi hoti hai)
        const tableName = (window.SUPABASE_CONFIG.TABLES && window.SUPABASE_CONFIG.TABLES.LINKS) 
                          ? window.SUPABASE_CONFIG.TABLES.LINKS 
                          : 'links';

        // 1. Pehle NAYE links search karo (bina # ke)
        let { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('shortcode', shortcode)
            .single();

        // 2. Agar nahi mila, toh PURANE links (# wale) search karo
        if (error || !data) {
            console.log("Clean link not found, trying old format with #...");
            const oldLinkSearch = await supabase
                .from(tableName)
                .select('*')
                .eq('shortcode', '#' + shortcode)
                .single();
            
            data = oldLinkSearch.data;
            error = oldLinkSearch.error;
        }

        // 3. Agar fir bhi nahi mila toh 404 show karo
        if (error || !data) {
            console.error("Database query error or link not found:", error);
            showNotFound(shortcode);
            return;
        }

        if (data.status !== 'active') {
            showError('This link is currently inactive.');
            return;
        }

        if (data.password && data.password !== '') {
            showPasswordForm(shortcode, data.longurl, data.password);
            return;
        }

        // Click count badhao aur redirect karo
        incrementClickCount(shortcode, supabase, tableName);
        window.location.href = data.longurl;

    } catch (error) {
        console.error('Redirect Logic Error:', error);
        showError('Something went wrong while redirecting.');
    }
}

// MODERN UI FOR NOT FOUND (404)
function showNotFound(shortcode) {
    const contentBox = document.getElementById('contentBox');
    if (contentBox) {
        contentBox.innerHTML = `
            <i class="fas fa-unlink" style="font-size: 48px; color: #ef4444; margin-bottom: 20px;"></i>
            <h2 style="color: #111827; margin-bottom: 10px;">Link Not Found</h2>
            <p style="color: #6b7280; margin-bottom: 25px;">The link <strong>${shortcode}</strong> doesn't exist or was deleted.</p>
            <a href="index.html" style="background: #4f46e5; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 500; display: inline-block;">Create New Link</a>
        `;
    }
}

// MODERN UI FOR ERRORS
function showError(message) {
    const contentBox = document.getElementById('contentBox');
    if (contentBox) {
        contentBox.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f59e0b; margin-bottom: 20px;"></i>
            <h2 style="color: #111827; margin-bottom: 10px;">Oops! Error</h2>
            <p style="color: #6b7280; margin-bottom: 25px;">${message}</p>
            <a href="index.html" style="background: #4f46e5; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 500; display: inline-block;">Go Home</a>
        `;
    }
}

// MODERN UI FOR PASSWORD PROTECTION
function showPasswordForm(shortcode, longurl, correctPassword) {
    const contentBox = document.getElementById('contentBox');
    if (contentBox) {
        contentBox.innerHTML = `
            <i class="fas fa-lock" style="font-size: 48px; color: #4f46e5; margin-bottom: 20px;"></i>
            <h2 style="color: #111827; margin-bottom: 10px;">Protected Link</h2>
            <p style="color: #6b7280; margin-bottom: 20px;">Enter password to access this destination.</p>
            <input type="password" id="passwordInput" placeholder="Enter password" style="width: 100%; box-sizing: border-box; padding: 12px 16px; margin-bottom: 15px; border: 1px solid #d1d5db; border-radius: 8px; outline: none; font-family: 'Inter', sans-serif;">
            <button onclick="checkPassword('${shortcode}', '${longurl}', '${correctPassword}')" style="background: #4f46e5; color: white; border: none; padding: 12px 24px; width: 100%; border-radius: 8px; font-weight: 500; cursor: pointer; font-family: 'Inter', sans-serif;">Unlock Link</button>
        `;
    }
}

window.checkPassword = function(shortcode, longurl, correctPassword) {
    const entered = document.getElementById('passwordInput').value;
    if (entered === correctPassword) {
        window.location.href = longurl;
    } else {
        alert('Incorrect password! Try again.');
    }
};

async function incrementClickCount(shortcode, supabase, tableName) {
    try {
        const { data } = await supabase.from(tableName).select('clicks').eq('shortcode', shortcode).single();
        if (data) {
            await supabase.from(tableName).update({ 
                clicks: (data.clicks || 0) + 1,
                lastclicked: new Date().toISOString()
            }).eq('shortcode', shortcode);
        }
    } catch (error) { 
        console.error("Click Tracking Error:", error); 
    }
        }
