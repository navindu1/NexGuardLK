require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet'); // Security Package
const rateLimit = require('express-rate-limit'); // Rate Limiter
const allRoutes = require('./src/routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); 

// 1. මුලින්ම CORS සහ Body Parsers දාන්න (Connection එක හරියට අඳුරගන්න මේක උඩින්ම තියෙන්න ඕන)
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. ඊට පස්සේ Security Middleware (Helmet) දාන්න
app.use(helmet({
    contentSecurityPolicy: false, 
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }, 
    crossOriginEmbedderPolicy: false 
}));

// 3. ඊට පස්සේ Rate Limiter එක දාන්න
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 60, 
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests, please try again later." }
});
app.use('/api', limiter); 


// --- Cron Jobs ---
const { processAutoConfirmableOrders } = require('./src/services/orderService');
const { cleanupOldReceipts, processRenewalQueue } = require('./src/services/cronService');
const { sendExpiryReminders } = require('./src/services/notificationService');

app.post('/api/cron', (req, res) => {
    const providedSecret = req.headers['authorization']?.split(' ')[1];

    if (providedSecret !== process.env.CRON_SECRET) {
        console.warn('Unauthorized cron job attempt.');
        return res.status(401).send('Unauthorized');
    }
    
    console.log('External Cron Job triggered: Running scheduled tasks...');
    processAutoConfirmableOrders();
    cleanupOldReceipts();
    processRenewalQueue();

    res.status(200).send('Cron job executed successfully.');
});

app.post('/api/daily-cron', async (req, res) => { 
    const providedSecret = req.headers['authorization']?.split(' ')[1];
    if (providedSecret !== process.env.DAILY_CRON_SECRET) {
        console.warn('Unauthorized DAILY cron job attempt.');
        return res.status(401).send('Unauthorized');
    }
    
    console.log('Daily Cron Job triggered: Running daily tasks...');
    await sendExpiryReminders(); 
    
    res.status(200).send('Daily cron job executed successfully.');
});

// --- API Routes ---
app.use('/api', allRoutes);

// --- Serve static files ---
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