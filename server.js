require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
// const cron = require('node-cron'); - We will remove this
const allRoutes = require('./src/routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- START OF FIX: VER-CEL CRON JOB ENDPOINT ---
// We add a new, secure endpoint that Vercel's cron job can call.
const { checkAndApprovePendingOrders } = require('./src/services/orderService');
const { cleanupOldReceipts } = require('./src/services/cronService');

// This endpoint is protected by a secret key from environment variables
app.post('/api/cron', (req, res) => {
    const cronSecret = req.headers['authorization']?.split(' ')[1];
    if (cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).send('Unauthorized');
    }
    
    console.log('Vercel Cron Job triggered: Running scheduled tasks...');
    checkAndApprovePendingOrders();
    cleanupOldReceipts();

    res.status(200).send('Cron job executed.');
});
// --- END OF FIX ---

// API Routes
app.use('/api', allRoutes);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// SPA Fallback and specific routes
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/reseller/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reseller-login.html')));
app.get('/reseller', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reseller.html')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- REMOVED NODE-CRON SCHEDULES ---
// The cron jobs are now handled by Vercel's configuration.

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
