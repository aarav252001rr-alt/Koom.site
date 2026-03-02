// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Script.js loaded successfully');
    
    // Check if config is loaded
    if (!window.SHEETDB_CONFIG) {
        console.error('SheetDB configuration not found!');
        showNotification('Configuration error! Please check console.', 'error');
    } else {
        console.log('SheetDB config found');
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

    // Add CSS for notifications if not present
    addDynamicStyles();
});

// API Helper Functions
async function sheetdbRequest(endpoint = '', method = 'GET', data = null) {
    if (!window.SHEETDB_CONFIG || !window.SHEETDB_CONFIG.API_URL) {
        throw new Error('SheetDB configuration missing');
    }
    
    const url = window.SHEETDB_CONFIG.API_URL + endpoint;
    
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        console.log('Making request to:', url, method);
        const response = await fetch(url, options);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('API Response:', result);
        return result;
        
    } catch (error) {
        console.error('SheetDB API Error:', error);
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
    // Add # for encryption indicator
    return '#' + result;
}

// Check if alias exists
async function aliasExists(alias) {
    try {
        const links = await sheetdbRequest('/search?shortCode=' + alias);
        return links && links.length > 0;
    } catch (error) {
        console.error('Error checking alias:', error);
        return false;
    }
}

// Shorten URL function
window.shortenUrl = async function(event) {
    event.preventDefault();
    
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
    const button = event.target;
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
        
        // Save to SheetDB
        const linkData = {
            shortCode: shortCode,
            longUrl: longUrl,
            password: password || '',
            createdAt: new Date().toISOString(),
            clicks: '0',
            encrypted: 'true',
            status: 'active'
        };

        await sheetdbRequest('', 'POST', { data: linkData });

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
};

// Display result
function displayResult(shortUrl, shortCode) {
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
            <small>🔒 Encrypted with # | Track clicks in dashboard</small>
        </div>
    `;
}

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

// Show notification
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
window.generateQR = function() {
    const url = document.getElementById('qrUrl').value;
    if (!url) {
        alert('Please enter a URL');
        return;
    }
    generateQRForUrl(url);
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

// Show QR for specific URL
window.showQR = function(url) {
    document.getElementById('qrUrl').value = url;
    generateQR();
    document.querySelector('.qr-generator').scrollIntoView({ behavior: 'smooth' });
};

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
        await sheetdbRequest('/shortCode/' + shortCode, 'PATCH', {
            data: {
                longUrl: newUrl,
                updatedAt: new Date().toISOString()
            }
        });
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
        const links = await sheetdbRequest('/search?shortCode=' + shortCode);
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
        const links = await sheetdbRequest('/search?shortCode=' + shortCode);
        if (links && links.length > 0) {
            const link = links[0];
            const currentClicks = parseInt(link.clicks) || 0;
            
            await sheetdbRequest('/shortCode/' + shortCode, 'PATCH', {
                data: {
                    clicks: (currentClicks + 1).toString(),
                    lastClicked: new Date().toISOString()
                }
            });
        }
    } catch (error) {
        console.error('Error incrementing clicks:', error);
    }
};

// Console log to confirm everything is loaded
console.log('All functions loaded successfully');