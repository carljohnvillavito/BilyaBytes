const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../db.json');

// Initialize DB file if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

const db = {
    getAll: () => {
        try {
            const data = fs.readFileSync(DB_FILE);
            return JSON.parse(data);
        } catch (error) {
            return [];
        }
    },
    save: (data) => {
        const currentData = db.getAll();
        currentData.push(data);
        fs.writeFileSync(DB_FILE, JSON.stringify(currentData, null, 2));
    },
    getBundleById: (id) => {
        const currentData = db.getAll();
        const bundle = currentData.find(item => item.id === id);
        if (bundle && bundle.expiresAt) {
            const expiresAt = new Date(bundle.expiresAt);
            const now = new Date();
            console.log(`[getBundleById] Bundle ID: ${id}`);
            console.log(`[getBundleById] Expires at: ${bundle.expiresAt} (parsed: ${expiresAt.toString()})`);
            console.log(`[getBundleById] Current time: ${now.toISOString()} (parsed: ${now.toString()})`);
            console.log(`[getBundleById] Is expired? ${expiresAt < now}`);

            if (expiresAt < now) {
                console.log(`[getBundleById] Returning null - bundle is expired`);
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
                console.log(`Pruning expired bundle: ${item.id}. ExpiresAt: ${item.expiresAt}, Now: ${now.toISOString()}`);
                expired.push(item);
            } else {
                active.push(item);
            }
        });

        if (expired.length > 0) {
            fs.writeFileSync(DB_FILE, JSON.stringify(active, null, 2));
        }
        return expired;
    }
};

module.exports = db;
