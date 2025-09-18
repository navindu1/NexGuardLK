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

// Reseller management routes
router.post("/resellers", authenticateAdmin, adminController.createReseller);
router.put("/resellers/:resellerId", authenticateAdmin, adminController.updateReseller);

// V2Ray Inbounds route
router.get("/inbounds", authenticateAdmin, adminController.getInboundsWithClients);

// Auto-approval management routes
router.get("/unconfirmed-orders", authenticateAdmin, adminController.getUnconfirmedOrders);
router.post("/orders/:orderId/confirm", authenticateAdmin, adminController.confirmAutoApprovedOrder);
router.post("/orders/:orderId/reject-auto", authenticateAdmin, adminController.rejectAutoApprovedOrder);

// Settings routes
router.get("/settings", authenticateAdmin, adminController.getAppSettings);
router.post("/settings", authenticateAdmin, adminController.updateAppSettings);

// Reporting routes
router.get("/reports/summary", authenticateAdmin, adminController.getSalesSummary);

module.exports = router;