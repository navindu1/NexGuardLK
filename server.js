require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const allRoutes = require('./src/routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Vercel Cron Job Endpoint
const { processAutoConfirmableOrders } = require('./src/services/orderService');
const { cleanupOldReceipts } = require('./src/services/cronService');
const { sendExpiryReminders } = require('./src/services/notificationService');

// අලුත් කේතය:
app.post('/api/cron', (req, res) => {
    // Check for the secret in the Authorization header
    const providedSecret = req.headers['authorization']?.split(' ')[1];

    // Compare with the secret stored in Vercel Environment Variables
    if (providedSecret !== process.env.CRON_SECRET) {
        console.warn('Unauthorized cron job attempt.');
        return res.status(401).send('Unauthorized');
    }
    
    console.log('External Cron Job triggered: Running scheduled tasks...');
    processAutoConfirmableOrders();
    cleanupOldReceipts();

    res.status(200).send('Cron job executed successfully.');
});

// Daily Cron Job Endpoint (for less frequent tasks)
app.post('/api/daily-cron', (req, res) => {
    const providedSecret = req.headers['authorization']?.split(' ')[1];
    if (providedSecret !== process.env.DAILY_CRON_SECRET) {
        console.warn('Unauthorized DAILY cron job attempt.');
        return res.status(401).send('Unauthorized');
    }
    
    console.log('Daily Cron Job triggered: Running daily tasks...');
    sendExpiryReminders();
    
    res.status(200).send('Daily cron job executed successfully.');
});

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




app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;

