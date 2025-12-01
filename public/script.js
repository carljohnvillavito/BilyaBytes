const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const fileList = document.getElementById('file-list');

// Pending Files Elements
const pendingContainer = document.getElementById('pending-container');
const pendingList = document.getElementById('pending-list');
const uploadBtn = document.getElementById('upload-btn');

let pendingFiles = [];

// Drag & Drop Events
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        addToPending(files);
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        addToPending(fileInput.files);
        // Reset input so same file can be selected again if needed
        fileInput.value = '';
    }
});

uploadBtn.addEventListener('click', () => {
    if (pendingFiles.length > 0) {
        uploadPendingFiles();
    }
});

function addToPending(files) {
    for (let i = 0; i < files.length; i++) {
        pendingFiles.push(files[i]);
    }
    renderPendingFiles();
}

function removePendingFile(index) {
    pendingFiles.splice(index, 1);
    renderPendingFiles();
}

function renderPendingFiles() {
    pendingList.innerHTML = '';

    if (pendingFiles.length === 0) {
        pendingContainer.style.display = 'none';
        return;
    }

    pendingContainer.style.display = 'block';

    pendingFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <div class="file-info">
                <div class="file-icon">
                    <i class="fa-solid fa-file"></i>
                </div>
                <div class="file-details">
                    <h3>${file.name}</h3>
                    <p>${formatSize(file.size)}</p>
                </div>
            </div>
            <button class="copy-btn" style="background: rgba(239, 68, 68, 0.2); color: #ef4444;" onclick="removePendingFile(${index})">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        pendingList.appendChild(item);
    });
}

function uploadPendingFiles() {
    const formData = new FormData();
    for (let i = 0; i < pendingFiles.length; i++) {
        formData.append('files', pendingFiles[i]);
    }

    // Add Expiry
    const expiry = document.getElementById('expiry-select').value;
    formData.append('expiry', expiry);

    // Hide pending container and show progress
    pendingContainer.style.display = 'none';
    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.innerText = 'Starting upload...';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            progressFill.style.width = percentComplete + '%';

            if (percentComplete >= 100) {
                progressText.innerText = 'Finalizing upload... please wait';
            } else {
                progressText.innerText = `Uploading... ${Math.round(percentComplete)}%`;
            }
        }
    };

    xhr.onload = () => {
        if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            progressText.innerText = 'Upload Complete!';
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 2000);

            // Clear pending files
            pendingFiles = [];

            // Add the bundle to the list
            addBundleToList(response.bundle);
            saveToHistory(response.bundle);
        } else {
            progressText.innerText = 'Upload Failed!';
            console.error('Upload error:', xhr.responseText);
            // Show pending container again so user can retry
            pendingContainer.style.display = 'block';
        }
    };

    xhr.onerror = () => {
        progressText.innerText = 'Upload Failed!';
        console.error('Network error');
        pendingContainer.style.display = 'block';
    };

    xhr.send(formData);
}

function addBundleToList(bundle) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';

    const viewUrl = `${window.location.origin}/view/${bundle.id}`;

    // Calculate total size and file count
    const fileCount = bundle.files.length;
    const totalSize = bundle.files.reduce((acc, file) => acc + file.size, 0);
    const title = fileCount === 1 ? bundle.files[0].originalName : `${fileCount} Files Uploaded`;
    const iconClass = fileCount === 1 ? 'fa-file' : 'fa-folder-open';

    fileItem.innerHTML = `
        <div class="file-info">
            <div class="file-icon">
                <i class="fa-solid ${iconClass}"></i>
            </div>
            <div class="file-details">
                <h3>${title}</h3>
                <p>${formatSize(totalSize)} • ${new Date(bundle.uploadDate).toLocaleTimeString()}</p>
            </div>
        </div>
        <button class="copy-btn" onclick="copyToClipboard('${viewUrl}', this)">
            <i class="fa-regular fa-copy"></i> Copy Link
        </button>
    `;

    // Add to main list (if just uploaded)
    // If loading from history, we might append to a different container
    fileList.prepend(fileItem);

    // Save to LocalStorage (only if it's a new upload, not when loading history)
    // We can check if this function call is from a new upload by checking if it's already in history
    // But simpler: let the caller handle saving, or save here and deduplicate.
    // Let's create a separate saveToHistory function called by upload success.
}

function saveToHistory(bundle) {
    let history = JSON.parse(localStorage.getItem('uploadHistory') || '[]');
    history.unshift(bundle);
    // Limit history to 10 items
    if (history.length > 10) {
        history = history.slice(0, 10);
    }
    localStorage.setItem('uploadHistory', JSON.stringify(history));
    loadHistory(); // Refresh the history view
}

function loadHistory() {
    const historyContainer = document.getElementById('history-container');
    const historyList = document.getElementById('history-list');
    let history = JSON.parse(localStorage.getItem('uploadHistory') || '[]');

    if (history.length === 0) {
        historyContainer.style.display = 'none';
        return;
    }

    historyContainer.style.display = 'block';
    historyList.innerHTML = '';

    history.forEach(bundle => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        const viewUrl = `${window.location.origin}/view/${bundle.id}`;

        const fileCount = bundle.files.length;
        const totalSize = bundle.files.reduce((acc, file) => acc + file.size, 0);
        const title = fileCount === 1 ? bundle.files[0].originalName : `${fileCount} Files Uploaded`;
        const iconClass = fileCount === 1 ? 'fa-file' : 'fa-folder-open';

        // Check if expired
        const isExpired = new Date(bundle.expiresAt) < new Date();
        const opacity = isExpired ? '0.5' : '1';
        const statusText = isExpired ? '(Expired)' : '';

        fileItem.innerHTML = `
            <div class="file-info" style="opacity: ${opacity}">
                <div class="file-icon">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div class="file-details">
                    <h3>${title} <span style="font-size: 0.8em; color: var(--secondary);">${statusText}</span></h3>
                    <p>${formatSize(totalSize)} • ${new Date(bundle.uploadDate).toLocaleString()}</p>
                </div>
            </div>
            <button class="copy-btn" onclick="copyToClipboard('${viewUrl}', this)" ${isExpired ? 'disabled style="cursor: not-allowed; opacity: 0.5;"' : ''}>
                <i class="fa-regular fa-copy"></i> Copy Link
            </button>
        `;
        historyList.appendChild(fileItem);
    });
}

function clearHistory() {
    localStorage.removeItem('uploadHistory');
    loadHistory();
}

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        btn.style.background = 'rgba(16, 185, 129, 0.2)';
        btn.style.color = '#10b981';

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
            btn.style.color = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

// Load history on startup
document.addEventListener('DOMContentLoaded', loadHistory);
