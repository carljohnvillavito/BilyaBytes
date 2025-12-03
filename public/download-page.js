document.addEventListener('DOMContentLoaded', () => {
    // Get ID from URL path: /view/:id
    const pathParts = window.location.pathname.split('/');
    const bundleId = pathParts[pathParts.length - 1];

    if (!bundleId) {
        window.location.href = '/expired';
        return;
    }

    fetch(`/api/bundle/${bundleId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Bundle not found');
            }
            return response.json();
        })
        .then(bundle => {
            renderBundle(bundle);
        })
        .catch(err => {
            console.error('Error fetching bundle:', err);
            window.location.href = '/expired';
        });
});

function renderBundle(bundle) {
    const container = document.querySelector('.upload-area');

    if (!container) {
        console.error('ERROR: .upload-area container not found!');
        return;
    }

    container.innerHTML = ''; // Clear loading state
    container.style.cursor = 'default';
    container.style.textAlign = 'left';
    container.style.padding = '2rem';

    // Header
    const header = document.createElement('div');
    header.style.textAlign = 'center';
    header.style.marginBottom = '2rem';

    const fileCount = bundle.files.length;
    const totalSize = bundle.files.reduce((acc, file) => acc + file.size, 0);
    const title = fileCount === 1 ? bundle.files[0].originalName : `${fileCount} Files Shared`;

    // Calculate time remaining
    const expiresAt = new Date(bundle.expiresAt);
    const uploadDate = new Date(bundle.uploadDate);

    // Start countdown
    const updateCountdown = () => {
        const now = new Date();
        const diff = expiresAt - now;

        if (diff <= 0) {
            window.location.href = '/expired'; // Redirect to expired page
            return;
        }

        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        const hours = Math.floor(diff / (1000 * 60 * 60));

        const timerEl = document.getElementById('expiry-timer');
        if (timerEl) {
            timerEl.innerText = `${hours}h ${minutes}m ${seconds}s`;
        }
    };

    // Run once immediately to check expiry
    updateCountdown();
    // Then run every second
    setInterval(updateCountdown, 1000);

    header.innerHTML = `
        <div class="file-preview-icon" style="margin-bottom: 1rem;">
            <i class="fa-solid ${fileCount === 1 ? 'fa-file' : 'fa-folder-open'}" style="font-size: 4rem; color: var(--primary);"></i>
        </div>
        <h2 style="font-size: 1.5rem; margin-bottom: 0.5rem;">${title}</h2>
        <p style="color: var(--text-muted); margin-bottom: 0.5rem;">${formatSize(totalSize)}</p>
        
        <div style="display: flex; justify-content: center; gap: 2rem; margin-top: 1rem; font-size: 0.9rem; color: var(--text-muted);">
            <div>
                <i class="fa-regular fa-clock"></i> Uploaded: <br>
                <span style="color: var(--text-main);">${uploadDate.toLocaleString()}</span>
            </div>
            <div>
                <i class="fa-solid fa-hourglass-half" style="color: var(--secondary);"></i> Expires in: <br>
                <span id="expiry-timer" style="color: var(--secondary); font-weight: bold;">Calculating...</span>
            </div>
        </div>
    `;
    container.appendChild(header);

    // File List
    const list = document.createElement('div');
    list.className = 'file-list';
    list.style.marginTop = '0';

    bundle.files.forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.style.marginBottom = '1rem';

        const downloadUrl = `/api/download/${file.id}`;

        // Ensure mimetype exists
        const mimetype = file.mimetype || 'application/octet-stream';

        item.innerHTML = `
            <div class="file-info">
                <div class="file-icon">
                    <i class="fa-solid ${getFileIcon(mimetype)}"></i>
                </div>
                <div class="file-details">
                    <h3>${file.originalName}</h3>
                    <p>${formatSize(file.size)}</p>
                </div>
            </div>
            <a href="${downloadUrl}" class="copy-btn" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center;">
                <i class="fa-solid fa-download"></i>
            </a>
        `;
        list.appendChild(item);
    });

    container.appendChild(list);

    // CTA Section
    const cta = document.createElement('div');
    cta.style.marginTop = '3rem';
    cta.style.textAlign = 'center';
    cta.style.borderTop = '1px solid var(--border)';
    cta.style.paddingTop = '2rem';

    cta.innerHTML = `
        <h3 style="margin-bottom: 0.5rem;">Ready to share your own files?</h3>
        <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Experience the fastest, simplest way to share files securely.</p>
        <a href="/" class="browse-btn" style="text-decoration: none; display: inline-block; background: linear-gradient(135deg, var(--secondary), #8b5cf6);">
            <i class="fa-solid fa-rocket"></i> Start Sharing Now
        </a>
    `;
    container.appendChild(cta);
}

function getFileIcon(mimetype) {
    if (!mimetype) return 'fa-file';
    if (mimetype.startsWith('image/')) return 'fa-image';
    if (mimetype.startsWith('video/')) return 'fa-file-video';
    if (mimetype.startsWith('audio/')) return 'fa-file-audio';
    if (mimetype.includes('pdf')) return 'fa-file-pdf';
    return 'fa-file';
}

function showError(msg) {
    const container = document.querySelector('.upload-area');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; color: #ef4444;">
                <i class="fa-solid fa-circle-exclamation" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <h3>Something went wrong</h3>
                <p>${msg || 'File not found or has been deleted.'}</p>
                <a href="/" class="browse-btn" style="margin-top: 1.5rem; display: inline-block; text-decoration: none;">Go Home</a>
            </div>
        `;
        container.style.cursor = 'default';
    } else {
        // Fallback if container not found
        window.location.href = '/expired';
    }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
