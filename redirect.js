document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Redirect Script Started (Version 5)');
    
    let path = window.location.pathname.replace(/^\/|\/$/g, ''); 
    let shortcode = decodeURIComponent(path);
    
    // Agar URL mein # hai, toh usey bhi support karein (Purane links ke liye)
    if (shortcode === '' && window.location.hash) {
        shortcode = decodeURIComponent(window.location.hash.substring(1)); 
    }
    
    console.log('🔍 Extracted Shortcode:', shortcode);

    // Agar invalid link hai, Home page bhej do
    if (shortcode.includes('.html') || shortcode === '' || shortcode === 'redirect') {
        window.location.replace('index.html');
        return;
    }

    redirectToLongUrl(shortcode);
});

async function redirectToLongUrl(shortcode) {
    if (!window.SUPABASE_CONFIG) {
        console.error('❌ Supabase Config Missing!');
        showError('Database connection error. Config missing.');
        return;
    }

    try {
        console.log('🔌 Connecting to Supabase...');
        const supabase = window.supabase.createClient(
            window.SUPABASE_CONFIG.URL,
            window.SUPABASE_CONFIG.ANON_KEY
        );

        const tableName = window.SUPABASE_CONFIG.TABLES?.LINKS || 'links';
        
        // Step 1: Naye links search karein (Bina # ke)
        console.log(`🔎 Searching for: "${shortcode}"`);
        let { data, error } = await supabase.from(tableName).select('*').eq('shortcode', shortcode).single();

        // Step 2: Agar na mile, toh purane links try karein (jinme # laga hai)
        if (error || !data) {
            console.log(`⚠️ Link not found. Trying old format with "#${shortcode}"...`);
            const oldSearch = await supabase.from(tableName).select('*').eq('shortcode', '#' + shortcode).single();
            data = oldSearch.data;
            error = oldSearch.error;
        }

        // Step 3: Agar dono me fail ho jaye toh 404 show karein
        if (error || !data) {
            console.error('❌ Final Database Error - Link Not Found:', error);
            showNotFound(shortcode);
            return;
        }

        console.log('✅ Link Found! Target:', data.longurl);

        if (data.status !== 'active') {
            showError('This link is currently inactive.');
            return;
        }

        if (data.password && data.password !== '') {
            showPasswordForm(shortcode, data.longurl, data.password);
            return;
        }

        // Clicks update karein background mein (bina page roke)
        supabase.from(tableName).update({ 
            clicks: (data.clicks || 0) + 1,
            lastclicked: new Date().toISOString()
        }).eq('shortcode', data.shortcode).then();

        // Final Redirect
        window.location.replace(data.longurl);

    } catch (error) {
        console.error('❌ Unexpected Script Error:', error);
        showError('Something went wrong. Please try again.');
    }
}

function showNotFound(shortcode) {
    const contentBox = document.getElementById('contentBox');
    if(contentBox) {
        contentBox.innerHTML = `
            <i class="fas fa-unlink" style="font-size: 48px; color: #ef4444; margin-bottom: 20px;"></i>
            <h2 style="color: #111827; margin-bottom: 10px;">Link Not Found</h2>
            <p style="color: #6b7280; margin-bottom: 25px;">The link <strong>${shortcode}</strong> doesn't exist.</p>
            <a href="index.html" style="background: #4f46e5; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 500; display: inline-block;">Create New Link</a>
        `;
    }
}

function showError(message) {
    const contentBox = document.getElementById('contentBox');
    if(contentBox) {
        contentBox.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f59e0b; margin-bottom: 20px;"></i>
            <h2 style="color: #111827; margin-bottom: 10px;">Oops! Error</h2>
            <p style="color: #6b7280; margin-bottom: 25px;">${message}</p>
            <a href="index.html" style="background: #4f46e5; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 500; display: inline-block;">Go Home</a>
        `;
    }
}

function showPasswordForm(shortcode, longurl, correctPassword) {
    const contentBox = document.getElementById('contentBox');
    if(contentBox) {
        contentBox.innerHTML = `
            <i class="fas fa-lock" style="font-size: 48px; color: #4f46e5; margin-bottom: 20px;"></i>
            <h2 style="color: #111827; margin-bottom: 10px;">Protected Link</h2>
            <p style="color: #6b7280; margin-bottom: 20px;">Enter password to access this destination.</p>
            <input type="password" id="passwordInput" placeholder="Enter password" style="width: 100%; box-sizing: border-box; padding: 12px 16px; margin-bottom: 15px; border: 1px solid #d1d5db; border-radius: 8px; outline: none; font-family: 'Inter', sans-serif;">
            <button onclick="checkPassword('${longurl}', '${correctPassword}')" style="background: #4f46e5; color: white; border: none; padding: 12px 24px; width: 100%; border-radius: 8px; font-weight: 500; cursor: pointer; font-family: 'Inter', sans-serif;">Unlock Link</button>
        `;
    }
}

window.checkPassword = function(longurl, correctPassword) {
    const entered = document.getElementById('passwordInput').value;
    if (entered === correctPassword) {
        window.location.replace(longurl);
    } else {
        alert('Incorrect password! Try again.');
    }
};
