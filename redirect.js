// redirect.js - Short URL redirect handler
document.addEventListener('DOMContentLoaded', function() {
    // Get the shortcode from URL without '#'
    let path = window.location.pathname.replace(/^\/|\/$/g, ''); // Removes leading/trailing slashes
    let shortcode = path; 
    
    // Fallback for old hash links if someone still uses them
    if (shortcode === '' && window.location.hash) {
        shortcode = window.location.hash.substring(1); 
    }
    
    // Agar redirect.html explicitly likha hai URL me, toh use ignore karein
    if (shortcode.includes('redirect.html') || shortcode === '') {
        window.location.href = 'index.html';
        return;
    }

    console.log('Shortcode detected:', shortcode);
    redirectToLongUrl(shortcode);
});

async function redirectToLongUrl(shortcode) {
    if (!window.SUPABASE_CONFIG) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const supabase = window.supabase.createClient(
            window.SUPABASE_CONFIG.URL,
            window.SUPABASE_CONFIG.ANON_KEY
        );

        const { data, error } = await supabase
            .from('links')
            .select('*')
            .eq('shortcode', shortcode)
            .single();

        if (error || !data) {
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

        incrementClickCount(shortcode, supabase);
        window.location.href = data.longurl;

    } catch (error) {
        showError('Something went wrong while redirecting.');
    }
}

// MODERN UI FOR NOT FOUND
function showNotFound(shortcode) {
    document.getElementById('contentBox').innerHTML = `
        <i class="fas fa-unlink" style="font-size: 48px; color: #ef4444; margin-bottom: 20px;"></i>
        <h2 style="color: #111827; margin-bottom: 10px;">Link Not Found</h2>
        <p style="color: #6b7280; margin-bottom: 25px;">The link <strong>${shortcode}</strong> doesn't exist.</p>
        <a href="index.html" style="background: #4f46e5; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 500; display: inline-block;">Create New Link</a>
    `;
}

// MODERN UI FOR ERRORS
function showError(message) {
    document.getElementById('contentBox').innerHTML = `
        <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f59e0b; margin-bottom: 20px;"></i>
        <h2 style="color: #111827; margin-bottom: 10px;">Oops! Error</h2>
        <p style="color: #6b7280; margin-bottom: 25px;">${message}</p>
        <a href="index.html" style="background: #4f46e5; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 500; display: inline-block;">Go Home</a>
    `;
}

// MODERN UI FOR PASSWORD PROTECTION
function showPasswordForm(shortcode, longurl, correctPassword) {
    document.getElementById('contentBox').innerHTML = `
        <i class="fas fa-lock" style="font-size: 48px; color: #4f46e5; margin-bottom: 20px;"></i>
        <h2 style="color: #111827; margin-bottom: 10px;">Protected Link</h2>
        <p style="color: #6b7280; margin-bottom: 20px;">Enter password to access this destination.</p>
        <input type="password" id="passwordInput" placeholder="Enter password" style="width: 100%; box-sizing: border-box; padding: 12px 16px; margin-bottom: 15px; border: 1px solid #d1d5db; border-radius: 8px; outline: none; font-family: 'Inter', sans-serif;">
        <button onclick="checkPassword('${shortcode}', '${longurl}', '${correctPassword}')" style="background: #4f46e5; color: white; border: none; padding: 12px 24px; width: 100%; border-radius: 8px; font-weight: 500; cursor: pointer; font-family: 'Inter', sans-serif;">Unlock Link</button>
    `;
}

window.checkPassword = function(shortcode, longurl, correctPassword) {
    const entered = document.getElementById('passwordInput').value;
    if (entered === correctPassword) {
        window.location.href = longurl;
    } else {
        alert('Incorrect password! Try again.');
    }
};

async function incrementClickCount(shortcode, supabase) {
    try {
        const { data } = await supabase.from('links').select('clicks').eq('shortcode', shortcode).single();
        if (data) {
            await supabase.from('links').update({ 
                clicks: (data.clicks || 0) + 1,
                lastclicked: new Date().toISOString()
            }).eq('shortcode', shortcode);
        }
    } catch (error) { console.error(error); }
}