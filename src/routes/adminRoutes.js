// File Path: src/routes/adminRoutes.js

const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { authenticateAdmin } = require("../middleware/authMiddleware");

// Dashboard data route
router.get("/dashboard-data", authenticateAdmin, adminController.getDashboardData);

// Order management routes
router.post("/approve-order/:orderId", authenticateAdmin, adminController.approveOrder);
router.post("/reject-order/:orderId", authenticateAdmin, adminController.rejectOrder);

// User management routes
router.delete("/ban-user", authenticateAdmin, adminController.banUser);

// --- ADD THE NEW RESELLER ROUTE HERE ---
router.post("/resellers", authenticateAdmin, adminController.createReseller);

router.put("/resellers/:resellerId", authenticateAdmin, adminController.updateReseller);

module.exports = router;