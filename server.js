require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const cron = require('node-cron');
const { checkExpiredSubscriptions } = require('./src/services/cronService');
const allRoutes = require('./src/routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Professional URL Routes ---
// These routes will serve the HTML files for clean URLs.

// Serve admin login page at /admin/login
app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// Serve admin dashboard at /admin
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve reseller login page at /reseller/login
app.get('/reseller/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reseller-login.html'));
});

// Serve reseller dashboard at /reseller
app.get('/reseller', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reseller.html'));
});


// API Routes
app.use('/api', allRoutes);

// Root route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Schedule cron job to run every hour
cron.schedule('0 * * * *', () => {
    console.log('Running hourly check for expired subscriptions...');
    checkExpiredSubscriptions();
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
