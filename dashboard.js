// Global variables - use window object
let currentEditCode = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard loaded');
    initSupabase();
    loadLinks();
    addDashboardStyles();
});

// Initialize Supabase
async function initSupabase() {
    if (!window.SUPABASE_CONFIG) {
        console.error('Supabase configuration not found!');
        showNotification('Configuration error! Please check console.', 'error');
        return;
    }

    try {
        // Create Supabase client if not exists
        if (!window.globalSupabase) {
            window.globalSupabase = window.supabase.createClient(
                window.SUPABASE_CONFIG.URL,
                window.SUPABASE_CONFIG.ANON_KEY
            );
        }
        console.log('Supabase client initialized');
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
    if (!window.globalSupabase) {
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

// Show create modal
window.showCreateModal = function() {
    document.getElementById('modalTitle').textContent = 'Create New Link';
    document.getElementById('modalLongUrl').value = '';
    document.getElementById('modalCustomAlias').value = '';
    document.getElementById('modalPassword').value = '';
    currentEditCode = null;
    document.getElementById('linkModal').style.display = 'block';
};

// Close modal
window.closeModal = function() {
    document.getElementById('linkModal').style.display = 'none';
};

// Generate short code
function generateShortCode(length = 6) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return '#' + result;
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

// Save link (create or update)
window.saveLink = async function() {
    const longUrl = document.getElementById('modalLongUrl').value;
    const customAlias = document.getElementById('modalCustomAlias').value;
    const password = document.getElementById('modalPassword').value;
    
    if (!longUrl) {
        alert('Please enter a URL');
        return;
    }

    // Validate URL
    try {
        new URL(longUrl);
    } catch {
        alert('Please enter a valid URL');
        return;
    }

    try {
        if (currentEditCode) {
            // Update existing link
            await supabaseRequest(
                window.SUPABASE_CONFIG.TABLES.LINKS,
                'update',
                {
                    longurl: longUrl,
                    password: password || '',
                    updatedat: new Date().toISOString()
                },
                { field: 'shortcode', value: currentEditCode }
            );
            showNotification('Link updated successfully!', 'success');
        } else {
            // Create new link
            let shortCode = customAlias;
            
            if (customAlias) {
                const exists = await aliasExists(customAlias);
                if (exists) {
                    alert('This custom alias is already taken.');
                    return;
                }
            } else {
                do {
                    shortCode = generateShortCode();
                } while (await aliasExists(shortCode));
            }

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
            showNotification('Link created successfully!', 'success');
        }
        
        closeModal();
        loadLinks();
    } catch (error) {
        console.error('Error saving link:', error);
        showNotification('Error saving link', 'error');
    }
};

// Load links
async function loadLinks() {
    try {
        const links = await supabaseRequest(window.SUPABASE_CONFIG.TABLES.LINKS);
        if (links && links.length > 0) {
            displayLinks(links);
        } else {
            document.getElementById('linksContainer').innerHTML = '<p class="no-links">No links yet. Create your first link!</p>';
        }
    } catch (error) {
        console.error('Error loading links:', error);
        document.getElementById('linksContainer').innerHTML = '<p class="error">Error loading links. Please refresh.</p>';
    }
}

// Display links
function displayLinks(links) {
    const container = document.getElementById('linksContainer');
    container.innerHTML = '';
    
    links.forEach(link => {
        const card = document.createElement('div');
        card.className = 'link-card';
        
        const createdDate = new Date(link.createdat).toLocaleDateString();
        const clicks = parseInt(link.clicks) || 0;
        
        card.innerHTML = `
            <div class="link-header">
                <h4>${link.shortcode}</h4>
                <span class="link-status ${link.status}">${link.status}</span>
            </div>
            <p class="link-url" title="${link.longurl}">${link.longurl.substring(0, 50)}${link.longurl.length > 50 ? '...' : ''}</p>
            <div class="link-meta">
                <span><i class="fas fa-calendar"></i> ${createdDate}</span>
                <span><i class="fas fa-eye"></i> ${clicks} clicks</span>
                ${link.password ? '<span><i class="fas fa-lock"></i> Protected</span>' : ''}
            </div>
            <div class="link-actions">
                <button class="btn-edit" onclick="editLink('${link.shortcode}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn-qr" onclick="showQR('${link.longurl}')">
                    <i class="fas fa-qrcode"></i> QR
                </button>
                <button class="btn-copy" onclick="copyToClipboard('https://koom.site/${link.shortcode}')">
                    <i class="fas fa-copy"></i> Copy
                </button>
                <button class="btn-delete" onclick="deleteLink('${link.shortcode}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

// Edit link
window.editLink = function(code) {
    currentEditCode = code;
    document.getElementById('modalTitle').textContent = 'Edit Link';
    
    // Load existing data
    supabaseRequest(
        window.SUPABASE_CONFIG.TABLES.LINKS,
        'select',
        null,
        { field: 'shortcode', value: code }
    ).then(links => {
        if (links && links.length > 0) {
            const link = links[0];
            document.getElementById('modalLongUrl').value = link.longurl;
            document.getElementById('modalCustomAlias').value = link.shortcode;
            document.getElementById('modalPassword').value = link.password || '';
        }
    });
    
    document.getElementById('linkModal').style.display = 'block';
};

// Delete link
window.deleteLink = async function(code) {
    if (!confirm('Are you sure you want to delete this link?')) return;
    
    try {
        await supabaseRequest(
            window.SUPABASE_CONFIG.TABLES.LINKS,
            'delete',
            null,
            { field: 'shortcode', value: code }
        );
        showNotification('Link deleted successfully!', 'success');
        loadLinks();
    } catch (error) {
        console.error('Error deleting link:', error);
        showNotification('Error deleting link', 'error');
    }
};

// Show QR code
window.showQR = function(url) {
    const qrContainer = document.getElementById('qrResult');
    qrContainer.innerHTML = '';
    qrContainer.classList.add('active');
    
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
    
    const img = document.createElement('img');
    img.src = qrUrl;
    img.alt = 'QR Code';
    
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-secondary btn-small';
    downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download QR';
    downloadBtn.onclick = function() { downloadQR(qrUrl, 'qrcode.png'); };
    
    qrContainer.appendChild(img);
    qrContainer.appendChild(downloadBtn);
    
    // Scroll to QR
    qrContainer.scrollIntoView({ behavior: 'smooth' });
};

// Download QR code
function downloadQR(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Copy to clipboard
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Copied to clipboard!', 'success');
    });
};

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Logout function
window.logout = function() {
    if (confirm('Are you sure you want to logout?')) {
        window.location.href = 'index.html';
    }
};

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('linkModal');
    if (event.target === modal) {
        closeModal();
    }
};

// Add dashboard styles
function addDashboardStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .link-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .link-status {
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .link-status.active {
            background: #c6f6d5;
            color: #22543d;
        }
        
        .link-status.inactive {
            background: #fed7d7;
            color: #742a2a;
        }
        
        .link-meta {
            display: flex;
            gap: 15px;
            margin: 10px 0;
            font-size: 0.85rem;
            color: #666;
        }
        
        .link-meta i {
            margin-right: 5px;
        }
        
        .btn-copy {
            background: #4299e1;
            color: white;
            border: none;
            padding: 0.5rem;
            border-radius: 3px;
            cursor: pointer;
            transition: background 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
        }
        
        .btn-copy:hover {
            background: #3182ce;
        }
        
        .no-links {
            text-align: center;
            padding: 3rem;
            background: white;
            border-radius: 5px;
            color: #666;
        }
        
        .error {
            text-align: center;
            padding: 2rem;
            background: #fed7d7;
            color: #742a2a;
            border-radius: 5px;
        }
        
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
    `;
    document.head.appendChild(style);
}