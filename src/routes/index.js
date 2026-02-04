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
const usageController = require("../controllers/usageController");

// Route definitions
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const adminRoutes = require("./adminRoutes");
const resellerRoutes = require("./resellerRoutes");

// Route grouping
router.use("/auth", authRoutes);
router.use("/user", userRoutes);
router.use("/admin", adminRoutes);
router.use("/reseller", resellerRoutes);

// --- Public Routes ---

// 1. Get Public Connections (Updated for Manual Linking)
router.get('/public/connections', async (req, res) => {
    try {
        // 'connections' වගුවේ සියලුම දත්ත (*) සමග, ඊට අදාළ 'packages' වගුවේ සියලුම දත්ත (*) ලබාගනී.
        const { data: connections, error } = await supabase
            .from('connections')
            .select('*, packages(*)') 
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Frontend එකට ගැලපෙන ලෙස 'packages' array එක 'package_options' ලෙස නම වෙනස් කිරීම
        const formattedData = connections.map(conn => {
            const packageOptions = conn.packages || [];
            
            // පැරණි 'packages' property එක ඉවත් කරයි (clean response)
            delete conn.packages;

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

// 2. Get Public Plans (For Plans Page)
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

// 3. General API routes
router.get('/check-usage/:username', usageController.checkUsage);
router.post('/create-order', authenticateToken, upload.single('receipt'), orderController.createOrder);

module.exports = router;