// File Path: src/routes/index.js

const express = require("express");
const router = express.Router();

// Middleware and configs
const { authenticateToken } = require('../middleware/authMiddleware');
const upload = require('../config/uploads');
const supabase = require('../config/supabaseClient'); 

// Controllers
const authController = require("../controllers/authController");
const userController = require("../controllers/userController");
const adminController = require("../controllers/adminController");
const orderController = require("../controllers/orderController");
const usageController = require("../controllers/usageController"); // Assuming you create this file

// Route definitions
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const adminRoutes = require("./adminRoutes");
const resellerRoutes = require("./resellerRoutes"); // <-- ADD THIS LINE

// Route grouping
router.use("/auth", authRoutes);
router.use("/user", userRoutes);
router.use("/admin", adminRoutes);
router.use("/reseller", resellerRoutes);


// src/routes/index.js - නිවැරදි කරන ලද කේතය

// src/routes/index.js - සම්පූර්ණයෙන්ම නිවැරදි කරන ලද කේතය

router.get('/public/connections', async (req, res) => {
    try {
        // --- 1. Query එක වෙනස් කිරීම ---
        // 'connections' වගුවේ සියලුම දත්ත (*) සමග, ඊට අදාළ 'packages' වගුවේ සියලුම දත්තද (*) ලබාගනී.
        // Supabase මගින් foreign key සම්බන්ධතාවය නිසා මෙය ස්වයංක්‍රීයව සිදු කරයි.
        const { data: connections, error } = await supabase
            .from('connections')
            .select('*, packages(*)') // <-- මෙතනයි ප්‍රධාන වෙනස
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // --- 2. Frontend එකට ගැලපෙන සේ දත්ත සැකසීම ---
        // දත්ත ගබඩාවෙන් ලැබෙන 'packages' යන නම, frontend එක බලාපොරොත්තු වන 'package_options' ලෙස වෙනස් කරයි.
        // यामुळे, frontend කේතයේ (main.js) කිසිඳු වෙනසක් කිරීමට අවශ්‍ය නොවේ.
        const formattedData = connections.map(conn => {
            // 'packages' නමින් ලැබෙන array එක 'package_options' නමින් නව property එකකට දමයි.
            const packageOptions = conn.packages || [];
            
            // පැරණි 'packages' property එක ඉවත් කරයි.
            delete conn.packages;

            // 'package_options' සමග සම්පූර්ණ connection object එක return කරයි.
            return {
                ...conn,
                package_options: packageOptions
            };
        });

        res.json({ success: true, data: formattedData || [] });

    } catch (error) {
        console.error('Error fetching public connections:', error);
        res.status(500).json({ success: false, message: 'Could not fetch connections.' });
    }
});

// General API routes
router.get('/check-usage/:username', usageController.checkUsage);
router.post('/create-order', authenticateToken, upload.single('receipt'), orderController.createOrder);


// Add this new route before module.exports
router.get('/public/plans', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('plans')
            .select('plan_name, price, total_gb')
            .order('price', { ascending: true });
        if (error) throw error;

        const plansObject = data.reduce((acc, plan) => {
            const features = [
                `${plan.total_gb === 0 ? 'Unlimited Data' : `${plan.total_gb}GB Monthly Data`}`,
                "High-Speed Connection",
                "30-Day Validity"
            ];
            acc[plan.plan_name] = {
                name: `${plan.plan_name} Plan`,
                price: plan.price.toString(),
                features: features
            };
            return acc;
        }, {});

        res.json({ success: true, data: plansObject });
    } catch (error) {
        console.error('Error fetching public plans:', error);
        res.status(500).json({ success: false, message: 'Could not fetch plans.' });
    }
});

// Speed Test Endpoints
router.get('/ping', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendStatus(200);
});

router.post('/upload', (req, res) => {
    res.sendStatus(200);
});

module.exports = router;