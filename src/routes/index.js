// File Path: src/routes/index.js

const express = require("express");
const router = express.Router();

// Middleware and configs
const { authenticateToken } = require('../middleware/authMiddleware');
const upload = require('../config/uploads');

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

// Route grouping
router.use("/auth", authRoutes);
router.use("/user", userRoutes);
router.use("/admin", adminRoutes);

// General API routes
router.get('/check-usage/:username', usageController.checkUsage);
router.post('/create-order', authenticateToken, upload.single('receipt'), orderController.createOrder);

module.exports = router;