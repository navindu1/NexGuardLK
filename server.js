require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet'); // New Security Package
const rateLimit = require('express-rate-limit'); // New Rate Limiter
const allRoutes = require('./src/routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

// --- පහත පේළිය අලුතින් එකතු කරන්න ---
app.set('trust proxy', 1); 

// --- Security Middleware ---
app.use(helmet({
    contentSecurityPolicy: false, // Frontend එකේ script අවුල් නොවෙන්න මෙය false කරන්න
}));

// Rate Limiter: විනාඩි 15ක් තුළ එක IP එකකින් එන උපරිම ඉල්ලීම් 100 කට සීමා කිරීම
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // විනාඩි 1ක් ඇතුලත (Window reduced to 1 minute)
    max: 60, // විනාඩියකට ඉල්ලීම් 60ක් (තත්පරයකට 1ක් වගේ)
    standardHeaders: true,
    legacyHeaders: false,
    // 429 ආවොත් JSON එකක් යවන්න, එවිට Frontend එකට එය හඳුනාගත හැක
    message: { success: false, message: "Too many requests, please try again later." }
});
app.use('/api', limiter); // සියලුම API routes වලට මෙය යොදන්න

// Standard Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { processAutoConfirmableOrders } = require('./src/services/orderService');
const { cleanupOldReceipts, processRenewalQueue } = require('./src/services/cronService');
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

    // -- ADD THIS LINE: Call the new function every 5 minutes --
    processRenewalQueue();

    res.status(200).send('Cron job executed successfully.');
});

// Daily Cron Job Endpoint (for less frequent tasks)
app.post('/api/daily-cron', async (req, res) => { // 1. මෙතනට 'async' දාන්න
    const providedSecret = req.headers['authorization']?.split(' ')[1];
    if (providedSecret !== process.env.DAILY_CRON_SECRET) {
        console.warn('Unauthorized DAILY cron job attempt.');
        return res.status(401).send('Unauthorized');
    }
    
    console.log('Daily Cron Job triggered: Running daily tasks...');
    await sendExpiryReminders(); 
    
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

