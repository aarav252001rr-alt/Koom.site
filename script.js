// Global variables - SIRF EK BAAR DECLARE KAREN
if (typeof window.globalSupabase === 'undefined') {
    window.globalSupabase = null;
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded');
    
    // Initialize Supabase
    initSupabase();
    
    // Add event listeners
    const shortenBtn = document.getElementById('shortenBtn');
    if (shortenBtn) {
        shortenBtn.addEventListener('click', shortenUrl);
    }
    
    const generateQrBtn = document.getElementById('generateQrBtn');
    if (generateQrBtn) {
        generateQrBtn.addEventListener('click', generateQR);
    }
    
    // Add advertisement rotation
    setInterval(rotateAds, 8000);
    
    // Smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
    
    // Add dynamic styles
    addDynamicStyles();
});

// Initialize Supabase
async function initSupabase() {
    if (!window.SUPABASE_CONFIG) {
        console.error('Supabase configuration not found!');
        showNotification('Configuration error! Please check console.', 'error');
        return;
    }

    try {
        // Create Supabase client
        window.globalSupabase = window.supabase.createClient(
            window.SUPABASE_CONFIG.URL,
            window.SUPABASE_CONFIG.ANON_KEY
        );
        console.log('Supabase client initialized');
        return window.globalSupabase;
    } catch (error) {
        console.error('Error initializing Supabase:', error);
        showNotification('Error connecting to database', 'error');
    }
}

// Get Supabase instance
function getSupabase() {
    return window.globalSupabase;
}

// API Helper Functions
async function supabaseRequest(table, operation = 'select', data = null, query = null) {
    const supabase = getSupabase();
    if (!supabase) {
        await initSupabase();
    }

    try {
        let result;

        switch (operation) {
            case 'select':
                if (query) {
                    result = await window.globalSupabase
                        .from(table)
                        .select('*')
                        .eq(query.field, query.value);
                } else {
                    result = await window.globalSupabase
                        .from(table)
                        .select('*')
                        .order('createdat', { ascending: false });
                }
                break;

            case 'insert':
                result = await window.globalSupabase
                    .from(table)
                    .insert([data])
                    .select();
                break;

            case 'update':
                result = await window.globalSupabase
                    .from(table)
                    .update(data)
                    .eq(query.field, query.value)
                    .select();
                break;

            case 'delete':
                result = await window.globalSupabase
                    .from(table)
                    .delete()
                    .eq(query.field, query.value);
                break;

            default:
                throw new Error('Invalid operation');
        }

        if (result.error) throw result.error;
        return result.data;

    } catch (error) {
        console.error('Supabase API Error:', error);
        throw error;
    }
}

// Generate short code with encryption (#)
function generateShortCode(length = 6) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result; // Yahan se '#' hata diya gaya hai
}

// Check if alias exists
async function aliasExists(alias) {
    try {
        const links = await supabaseRequest(
            window.SUPABASE_CONFIG.TABLES.LINKS,
            'select',
            null,
            { field: 'shortcode', value: alias }
        );
        return links && links.length > 0;
    } catch (error) {
        console.error('Error checking alias:', error);
        return false;
    }
}

// Shorten URL function
async function shortenUrl(event) {
    event.preventDefault();
    console.log('Shorten function called');
    
    const longUrl = document.getElementById('longUrl').value;
    const customAlias = document.getElementById('customAlias').value;
    const password = document.getElementById('linkPassword').value;
    
    if (!longUrl) {
        alert('Please enter a URL');
        return;
    }

    // Validate URL
    try {
        new URL(longUrl);
    } catch {
        alert('Please enter a valid URL (include http:// or https://)');
        return;
    }

    // Show loading state
    const button = document.getElementById('shortenBtn');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Shortening...';
    button.disabled = true;

    try {
        let shortCode = customAlias;
        
        if (customAlias) {
            // Check if custom alias already exists
            const exists = await aliasExists(customAlias);
            if (exists) {
                alert('This custom alias is already taken. Please choose another.');
                button.innerHTML = originalText;
                button.disabled = false;
                return;
            }
        } else {
            // Generate unique short code
            let exists = true;
            let attempts = 0;
            while (exists && attempts < 10) {
                shortCode = generateShortCode();
                exists = await aliasExists(shortCode);
                attempts++;
            }
            if (exists) {
                throw new Error('Could not generate unique short code');
            }
        }

        const shortUrl = 'https://koom.site/' + shortCode;
        
        // Save to Supabase
        const linkData = {
            shortcode: shortCode,
            longurl: longUrl,
            password: password || '',
            createdat: new Date().toISOString(),
            clicks: 0,
            encrypted: true,
            status: 'active'
        };

        await supabaseRequest(
            window.SUPABASE_CONFIG.TABLES.LINKS,
            'insert',
            linkData
        );

        // Display result
        displayResult(shortUrl, shortCode);
        
        // Generate QR code
        generateQRForUrl(shortUrl);
        
        // Clear form
        document.getElementById('longUrl').value = '';
        document.getElementById('customAlias').value = '';
        document.getElementById('linkPassword').value = '';
        
        showNotification('Link created successfully!', 'success');
        
    } catch (error) {
        console.error('Error shortening URL:', error);
        alert('Error creating short link. Please try again.');
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

// Display result


// Copy to clipboard
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(function() {
        showNotification('Copied to clipboard!', 'success');
    }).catch(function() {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showNotification('Copied to clipboard!', 'success');
    });
};

// Sfunction displayResult(shortUrl, shortCode) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <div class="shortened-url">
            <a href="${shortUrl}" target="_blank">${shortUrl}</a>
            <button onclick="copyToClipboard('${shortUrl}')" class="btn-copy">
                <i class="fas fa-copy"></i> Copy
            </button>
            <button onclick="showQR('${shortUrl}')" class="btn-qr-small">
                <i class="fas fa-qrcode"></i> QR
            </button>
        </div>
        <div class="link-stats">
            <small>🔒 Secure Link | Track clicks in dashboard</small>
        </div>
    `;
        }how notification
function showNotification(message, type) {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'notification ' + type;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(function() {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

// Generate QR code
function generateQR() {
    const url = document.getElementById('qrUrl').value;
    if (!url) {
        alert('Please enter a URL');
        return;
    }
    generateQRForUrl(url);
}

// Show QR for specific URL
window.showQR = function(url) {
    document.getElementById('qrUrl').value = url;
    generateQR();
    document.querySelector('.qr-generator').scrollIntoView({ behavior: 'smooth' });
};

function generateQRForUrl(url) {
    const qrContainer = document.getElementById('qrResult');
    qrContainer.innerHTML = '';
    qrContainer.classList.add('active');
    
    // Using QRServer API for QR generation
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url);
    
    const img = document.createElement('img');
    img.src = qrUrl;
    img.alt = 'QR Code';
    img.onclick = function() { downloadQR(img.src, 'qrcode.png'); };
    
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-secondary btn-small';
    downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download QR';
    downloadBtn.onclick = function() { downloadQR(img.src, 'qrcode.png'); };
    
    qrContainer.appendChild(img);
    qrContainer.appendChild(downloadBtn);
}

// Download QR code
function downloadQR(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Advertisement rotation
function rotateAds() {
    const ads = document.querySelectorAll('.ad-container .ad-content p');
    const messages = [
        '🚀 Premium ad space available - Reach 10k+ daily visitors',
        '💼 Promote your business here - Contact us today',
        '📊 Drive targeted traffic to your website',
        '🎯 Get featured on koom.site - Premium placement'
    ];
    
    ads.forEach(function(ad) {
        if (ad) {
            const randomIndex = Math.floor(Math.random() * messages.length);
            ad.textContent = messages[randomIndex];
        }
    });
}

// Add dynamic styles
function addDynamicStyles() {
    if (!document.querySelector('#dynamic-styles')) {
        const style = document.createElement('style');
        style.id = 'dynamic-styles';
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 1rem 1.5rem;
                background: white;
                border-radius: 5px;
                box-shadow: 0 5px 20px rgba(0,0,0,0.2);
                display: flex;
                align-items: center;
                gap: 10px;
                z-index: 9999;
                animation: slideIn 0.3s ease;
            }
            
            .notification.success {
                border-left: 4px solid #48bb78;
            }
            
            .notification.error {
                border-left: 4px solid #f56565;
            }
            
            .notification i {
                font-size: 1.2rem;
            }
            
            .notification.success i {
                color: #48bb78;
            }
            
            .notification.error i {
                color: #f56565;
            }
            
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            .btn-qr-small {
                background: #48bb78;
                color: white;
                border: none;
                padding: 0.5rem 1rem;
                border-radius: 5px;
                cursor: pointer;
                margin-left: 10px;
            }
            
            .btn-small {
                padding: 0.5rem 1rem;
                font-size: 0.9rem;
                margin-top: 10px;
            }
            
            .link-stats {
                margin-top: 10px;
                color: #666;
            }

            .btn-copy {
                background: #4299e1;
                color: white;
                border: none;
                padding: 0.5rem 1rem;
                border-radius: 5px;
                cursor: pointer;
            }
            
            .shortened-url {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }
            
            .shortened-url a {
                color: #667eea;
                text-decoration: none;
                font-weight: 500;
                word-break: break-all;
            }
        `;
        document.head.appendChild(style);
    }
}

// Replace/Edit link function
window.replaceLink = async function(shortCode, newUrl) {
    try {
        await supabaseRequest(
            window.SUPABASE_CONFIG.TABLES.LINKS,
            'update',
            { longurl: newUrl, updatedat: new Date().toISOString() },
            { field: 'shortcode', value: shortCode }
        );
        showNotification('Link updated successfully!', 'success');
        return true;
    } catch (error) {
        console.error('Error updating link:', error);
        showNotification('Error updating link', 'error');
        return false;
    }
};

// Get link stats
window.getLinkStats = async function(shortCode) {
    try {
        const links = await supabaseRequest(
            window.SUPABASE_CONFIG.TABLES.LINKS,
            'select',
            null,
            { field: 'shortcode', value: shortCode }
        );
        if (links && links.length > 0) {
            return links[0];
        }
        return null;
    } catch (error) {
        console.error('Error getting link stats:', error);
        return null;
    }
};

// Increment click count
window.incrementClicks = async function(shortCode) {
    try {
        const links = await supabaseRequest(
            window.SUPABASE_CONFIG.TABLES.LINKS,
            'select',
            null,
            { field: 'shortcode', value: shortCode }
        );
        
        if (links && links.length > 0) {
            const link = links[0];
            const currentClicks = parseInt(link.clicks) || 0;
            
            await supabaseRequest(
                window.SUPABASE_CONFIG.TABLES.LINKS,
                'update',
                { 
                    clicks: currentClicks + 1,
                    lastclicked: new Date().toISOString()
                },
                { field: 'shortcode', value: shortCode }
            );
        }
    } catch (error) {
        console.error('Error incrementing clicks:', error);
    }
};

console.log('All functions loaded successfully');
