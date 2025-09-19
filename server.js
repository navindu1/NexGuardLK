require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const cron = require('node-cron');
const { checkAndApprovePendingOrders } = require('./src/services/orderService');
const { cleanupOldReceipts } = require('./src/services/cronService');
const allRoutes = require('./src/routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. API Routes - Must be defined before static files and the SPA catch-all
app.use('/api', allRoutes);

// 2. Serve static files from the "public" directory (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// 3. Professional URL Routes for specific admin/reseller HTML files
// These ensure that direct navigation to these pages works correctly.
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/reseller/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reseller-login.html')));
app.get('/reseller', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reseller.html')));

// 4. SPA Catch-all Route
// For any other GET request, serve the main index.html file.
// This is crucial for single-page applications where routing is handled on the client-side.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- Cron Jobs (Scheduled Tasks) ---

// Schedule job to run every 5 minutes for auto-approvals
cron.schedule('*/5 * * * *', () => {
    console.log('Running scheduled check for auto-approval of pending orders...');
    checkAndApprovePendingOrders();
});

// Schedule job to run daily at 2 AM for cleaning up old receipts
cron.schedule('0 2 * * *', () => {
    console.log('Running daily check for old receipts to clean up...');
    cleanupOldReceipts();
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    // Perform an initial check when the server starts up
    console.log('Performing initial check for auto-approvals on server start...');
    checkAndApprovePendingOrders();
});

module.exports = app;
