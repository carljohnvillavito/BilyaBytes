const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../db.json');

// In-memory fallback for Vercel/Read-only environments
let memoryDb = [];
let useMemory = false;

// Initialize DB
try {
    if (!fs.existsSync(DB_FILE)) {
        // Try to create the file. If this fails (read-only), we switch to memory
        fs.writeFileSync(DB_FILE, JSON.stringify([]));
    }
    // Load initial data
    const data = fs.readFileSync(DB_FILE);
    memoryDb = JSON.parse(data);
} catch (error) {
    console.warn('⚠️ File system is read-only or db.json is inaccessible. Using in-memory storage (data will be lost on restart).');
    useMemory = true;
}

const db = {
    getAll: () => {
        if (useMemory) return memoryDb;
        try {
            const data = fs.readFileSync(DB_FILE);
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading DB:', error);
            return memoryDb;
        }
    },
    save: (data) => {
        memoryDb.push(data); // Always update memory

        if (!useMemory) {
            try {
                fs.writeFileSync(DB_FILE, JSON.stringify(memoryDb, null, 2));
            } catch (error) {
                console.error('Error writing to DB file, switching to memory-only:', error.message);
                useMemory = true;
            }
        }
    },
    getBundleById: (id) => {
        const currentData = db.getAll();
        const bundle = currentData.find(item => item.id === id);
        if (bundle && bundle.expiresAt) {
            const expiresAt = new Date(bundle.expiresAt);
            const now = new Date();

            if (expiresAt < now) {
                return null; // Treat as not found if expired
            }
        }
        return bundle;
    },
    getFileById: (fileId) => {
        const currentData = db.getAll();
        for (const bundle of currentData) {
            if (bundle.files) {
                const file = bundle.files.find(f => f.id === fileId);
                if (file) return file;
            }
        }
        return null;
    },
    pruneExpired: () => {
        const currentData = db.getAll();
        const now = new Date();
        const active = [];
        const expired = [];

        currentData.forEach(item => {
            if (item.expiresAt && new Date(item.expiresAt) < now) {
                expired.push(item);
            } else {
                active.push(item);
            }
        });

        if (expired.length > 0) {
            memoryDb = active; // Update memory
            if (!useMemory) {
                try {
                    fs.writeFileSync(DB_FILE, JSON.stringify(active, null, 2));
                } catch (error) {
                    console.error('Error pruning DB file:', error.message);
                }
            }
        }
        return expired;
    }
};

module.exports = db;
