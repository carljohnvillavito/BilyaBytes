const express = require('express');
const multer = require('multer');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('./src/db');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 3000;

// Cloudinary Config
const useCloudinary = process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET;

if (useCloudinary) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    console.log('Cloudinary configured. Using cloud storage.');
} else {
    console.log('Cloudinary credentials missing. Using local storage.');
}

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(express.static('public'));

// Configure Multer (Local Temp Storage)
const isVercel = process.env.VERCEL === '1';
const uploadDir = isVercel ? '/tmp' : 'uploads/';

// Ensure upload directory exists (only for local 'uploads/')
if (!isVercel && !fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir);
    } catch (err) {
        console.error('Failed to create upload directory:', err);
    }
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept ALL file types - no restrictions
        // Log the file format being uploaded
        const ext = path.extname(file.originalname).toLowerCase();
        const mimeType = file.mimetype;
        console.log(`📎 Accepting file: ${file.originalname} | Extension: ${ext || 'none'} | MIME: ${mimeType}`);
        cb(null, true); // Accept all files
    }
});

// Cleanup Task
setInterval(async () => {
    console.log('Running cleanup task...');
    const expiredBundles = db.pruneExpired();

    if (expiredBundles.length > 0) {
        console.log(`Found ${expiredBundles.length} expired bundles.`);
        for (const bundle of expiredBundles) {
            for (const file of bundle.files) {
                if (file.cloudinaryId) {
                    // Delete from Cloudinary
                    try {
                        await cloudinary.uploader.destroy(file.cloudinaryId, { resource_type: file.resourceType || 'raw' });
                        console.log(`Deleted from Cloudinary: ${file.cloudinaryId}`);
                    } catch (err) {
                        console.error(`Failed to delete from Cloudinary: ${file.cloudinaryId}`, err);
                    }
                } else {
                    // Delete from local disk
                    const filePath = path.join(uploadDir, file.filename);
                    if (fs.existsSync(filePath)) {
                        fs.unlink(filePath, (err) => {
                            if (err) console.error(`Failed to delete ${file.filename}:`, err.message);
                            else console.log(`Deleted local file ${file.filename}`);
                        });
                    }
                }
            }
        }
    }
}, 60 * 1000);

// Helper function to categorize file types
function getFileCategory(filename, mimetype) {
    const ext = path.extname(filename).toLowerCase();

    // Image formats
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif', '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw', '.dng'];

    // Video formats
    const videoExts = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp', '.ogv', '.vob', '.ts', '.mts'];

    // Audio formats
    const audioExts = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus', '.aiff', '.ape', '.alac', '.mid', '.midi'];

    // Document formats
    const documentExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.odt', '.ods', '.odp', '.pages', '.numbers', '.key'];

    // Archive formats
    const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso', '.dmg', '.pkg'];

    // Code/Script formats
    const codeExts = ['.js', '.py', '.java', '.cpp', '.c', '.cs', '.php', '.html', '.css', '.json', '.xml', '.sql', '.sh', '.bat', '.ps1', '.rb', '.go', '.rs', '.swift', '.kt', '.ts', '.jsx', '.tsx', '.vue'];

    // Executable formats
    const executableExts = ['.exe', '.msi', '.app', '.apk', '.deb', '.rpm', '.dmg', '.bat', '.sh', '.jar'];

    if (imageExts.includes(ext) || mimetype?.startsWith('image/')) return 'Image';
    if (videoExts.includes(ext) || mimetype?.startsWith('video/')) return 'Video';
    if (audioExts.includes(ext) || mimetype?.startsWith('audio/')) return 'Audio';
    if (documentExts.includes(ext)) return 'Document';
    if (archiveExts.includes(ext)) return 'Archive';
    if (codeExts.includes(ext) || mimetype?.includes('text/')) return 'Code/Text';
    if (executableExts.includes(ext)) return 'Executable';

    return 'Other';
}

// Helper function to format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Routes

// Upload Endpoint
app.post('/api/upload', upload.array('files'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }

    const expiryMinutes = parseInt(req.body.expiry) || 60;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60000).toISOString();
    const bundleId = uuidv4();

    const uploadedFiles = [];

    try {
        const uploadPromises = req.files.map(async (file) => {
            const fileData = {
                id: uuidv4(),
                originalName: file.originalname,
                filename: file.filename,
                mimetype: file.mimetype,
                size: file.size
            };

            if (!useCloudinary) {
                // Clean up the temp file
                fs.unlink(file.path, () => { });
                throw new Error('Cloudinary is not configured. Cloud storage is required.');
            }

            const fileCategory = getFileCategory(file.originalname, file.mimetype);
            console.log(`📤 Uploading to Cloudinary: ${file.originalname} | Category: ${fileCategory} | Size: ${formatBytes(file.size)}`);

            try {
                // Determine resource type based on file extension
                // Cloudinary blocks certain extensions with 'auto', so we use 'raw' for executables and other restricted types
                const ext = path.extname(file.originalname).toLowerCase();
                const restrictedExts = ['.exe', '.msi', '.app', '.apk', '.deb', '.rpm', '.bat', '.sh', '.jar', '.dll', '.so', '.dylib'];
                const imageVideoExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.mp4', '.avi', '.mov', '.mkv', '.webm'];

                let resourceType = 'raw'; // Default to raw for maximum compatibility
                if (imageVideoExts.includes(ext)) {
                    resourceType = 'auto'; // Use auto for images/videos to get optimizations
                }

                console.log(`📦 Resource type: ${resourceType} for ${file.originalname}`);

                // Upload to Cloudinary - this is REQUIRED
                const result = await cloudinary.uploader.upload(file.path, {
                    resource_type: resourceType,
                    folder: 'cloudshare',
                    use_filename: true,
                    unique_filename: true,
                    timeout: 600000 // 10 minutes
                });

                // Validate the upload result
                if (!result || !result.public_id || !result.secure_url) {
                    throw new Error('Cloudinary upload returned invalid response');
                }

                console.log(`✅ Uploaded to Cloudinary: ${result.public_id}`);

                fileData.cloudinaryId = result.public_id;
                fileData.url = result.secure_url;
                fileData.resourceType = result.resource_type;

                // Delete local temp file after successful cloud upload
                fs.unlink(file.path, (err) => {
                    if (err) console.error(`⚠️  Failed to delete temp file ${file.filename}:`, err.message);
                    else console.log(`🗑️  Deleted temp file: ${file.filename}`);
                });

                return fileData;
            } catch (cloudError) {
                console.error(`❌ Cloudinary upload FAILED for ${file.originalname}:`, cloudError.message);

                // Clean up temp file
                fs.unlink(file.path, () => { });

                throw new Error(`Failed to upload ${file.originalname} to cloud storage: ${cloudError.message}`);
            }
        });

        const uploadedFiles = await Promise.all(uploadPromises);

        // Verify all files have Cloudinary URLs before saving
        const missingUrls = uploadedFiles.filter(f => !f.url || !f.cloudinaryId);
        if (missingUrls.length > 0) {
            throw new Error('Some files failed to upload to cloud storage');
        }

        const bundleData = {
            id: bundleId,
            type: 'bundle',
            uploadDate: new Date().toISOString(),
            expiresAt: expiresAt,
            files: uploadedFiles
        };

        db.save(bundleData);

        console.log(`✅ Bundle created successfully: ${bundleId} (${uploadedFiles.length} files)`);
        res.json({ message: 'Upload successful', bundle: bundleData });

    } catch (error) {
        console.error('❌ Upload error:', error.message);
        res.status(500).json({
            error: 'Upload failed',
            message: error.message || 'Failed to upload files to cloud storage'
        });
    }
});

// Get Bundle Info
app.get('/api/bundle/:id', (req, res) => {
    console.log(`Fetching bundle with ID: ${req.params.id}`);
    const bundle = db.getBundleById(req.params.id);
    if (!bundle) {
        console.log(`Bundle ${req.params.id} not found.`);
        return res.status(404).json({ error: 'Bundle not found or expired' });
    }
    console.log(`Bundle ${req.params.id} found. Expires at: ${bundle.expiresAt}`);
    res.json(bundle);
});

// Download Single File
app.get('/api/download/:fileId', (req, res) => {
    const fileData = db.getFileById(req.params.fileId);

    if (!fileData) {
        console.error(`❌ File not found: ${req.params.fileId}`);
        return res.status(404).json({ error: 'File not found or expired' });
    }

    // Check if file has Cloudinary URL
    if (!fileData.url || !fileData.cloudinaryId) {
        console.error(`❌ File has no cloud URL: ${fileData.originalName} (ID: ${fileData.id})`);
        return res.status(404).json({
            error: 'File not available',
            message: 'This file was not properly uploaded to cloud storage and is no longer accessible.'
        });
    }

    // For raw files, we need to proxy the download to set proper headers
    // For images/videos, we can use Cloudinary transformations
    const resourceType = fileData.resourceType || 'raw';

    if (resourceType === 'raw') {
        // Proxy download through our server to set Content-Disposition header
        console.log(`🔄 Proxying download: ${fileData.originalName} from ${fileData.url}`);

        // Fetch from Cloudinary
        const https = require('https');
        const http = require('http');
        const urlModule = require('url');

        const parsedUrl = urlModule.parse(fileData.url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        protocol.get(fileData.url, (cloudinaryRes) => {
            // Set headers to force download with original filename
            res.setHeader('Content-Disposition', `attachment; filename="${fileData.originalName}"`);
            res.setHeader('Content-Type', fileData.mimetype || 'application/octet-stream');
            res.setHeader('Content-Length', cloudinaryRes.headers['content-length']);

            // Pipe the response from Cloudinary to client
            cloudinaryRes.pipe(res);
        }).on('error', (err) => {
            console.error(`❌ Error proxying download:`, err);
            res.status(500).json({ error: 'Download failed' });
        });
    } else {
        // For images/videos, use fl_attachment transformation (it works for these)
        let downloadUrl = fileData.url;
        const urlParts = downloadUrl.split('/upload/');

        if (urlParts.length === 2) {
            const encodedFilename = encodeURIComponent(fileData.originalName);
            downloadUrl = `${urlParts[0]}/upload/fl_attachment:${encodedFilename}/${urlParts[1]}`;
        }

        console.log(`✅ Redirecting to Cloudinary: ${fileData.originalName} -> ${downloadUrl}`);
        return res.redirect(downloadUrl);
    }
});

// Serve Download/View Page
app.get('/view/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'download.html'));
});

// Serve Expired Page
app.get('/expired', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'expired.html'));
});

// Start Server
if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });

    // Increase timeout to 30 minutes for large uploads
    server.timeout = 30 * 60 * 1000;
    server.keepAliveTimeout = 30 * 60 * 1000;
    server.headersTimeout = 30 * 60 * 1000;
}

module.exports = app;
