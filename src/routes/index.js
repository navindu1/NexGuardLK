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

router.get('/public/connections', async (req, res) => {
    try {
        // Fix: Select all columns ('*') to get icon, package details, etc.
        const { data, error } = await supabase
            .from('connections')
            .select('*') // <-- නිවැරදි කිරීම: සියලුම දත්ත select කිරීම
            .eq('is_active', true)
            .order('created_at', { ascending: true }); // <-- අමතරව: පිලිවෙලකට පෙන්වීමට

        if (error) throw error;
        // The data now includes name, icon, requires_package_choice, package_options, etc.
        res.json({ success: true, data: data || [] });
    } catch (error) {
        console.error('Error fetching public connections:', error);
        res.status(500).json({ success: false, message: 'Could not fetch connections.' });
    }
});

// General API routes
router.get('/check-usage/:username', usageController.checkUsage);
router.post('/create-order', authenticateToken, upload.single('receipt'), orderController.createOrder);


module.exports = router;