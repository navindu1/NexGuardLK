// File Path: src/routes/adminRoutes.js

const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { authenticateAdmin } = require("../middleware/authMiddleware");

// Note: Admin login is a public route, handled in authController/authRoutes.
router.get("/dashboard-data", authenticateAdmin, adminController.getDashboardData);
router.post("/approve-order/:orderId", authenticateAdmin, adminController.approveOrder);


module.exports = router;