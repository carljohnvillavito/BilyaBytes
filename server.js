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
app.use(express.static('public'));

// Configure Multer (Local Temp Storage)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

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
                        await cloudinary.uploader.destroy(file.cloudinaryId, { resource_type: 'raw' });
                        console.log(`Deleted from Cloudinary: ${file.cloudinaryId}`);
                    } catch (err) {
                        console.error(`Failed to delete from Cloudinary: ${file.cloudinaryId}`, err);
                    }
                } else {
                    // Delete from local disk
                    const filePath = path.join(__dirname, 'uploads', file.filename);
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
            let fileData = {
                id: uuidv4(),
                originalName: file.originalname,
                filename: file.filename, // Local filename
                mimetype: file.mimetype,
                size: file.size
            };

            if (useCloudinary) {
                // Upload to Cloudinary
                // Use upload_large for better handling of large files (chunked)
                const result = await cloudinary.uploader.upload_large(file.path, {
                    resource_type: 'auto', // Auto-detect type (image, video, raw)
                    folder: 'cloudshare',
                    use_filename: true,
                    unique_filename: true,
                    chunk_size: 6000000 // 6MB chunks
                });

                fileData.cloudinaryId = result.public_id;
                fileData.url = result.secure_url;
                fileData.resourceType = result.resource_type;

                // Delete local temp file
                fs.unlink(file.path, () => { });
            }
            return fileData;
        });

        const uploadedFiles = await Promise.all(uploadPromises);

        const bundleData = {
            id: bundleId,
            type: 'bundle',
            uploadDate: new Date().toISOString(),
            expiresAt: expiresAt,
            files: uploadedFiles
        };

        db.save(bundleData);
        res.json({ message: 'Upload successful', bundle: bundleData });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
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
        return res.status(404).json({ error: 'File not found or expired' });
    }

    if (fileData.url) {
        // Redirect to Cloudinary URL
        return res.redirect(fileData.url);
    }

    // Fallback to local file
    const filePath = path.join(__dirname, 'uploads', fileData.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on disk' });
    }

    res.download(filePath, fileData.originalName);
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
const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Increase timeout to 10 minutes for large uploads
server.timeout = 10 * 60 * 1000;
