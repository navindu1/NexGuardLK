// File Path: src/routes/adminRoutes.js

const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { authenticateAdmin } = require("../middleware/authMiddleware");

// Note: Admin login is a public route, handled in authController/authRoutes.
router.get("/dashboard-data", authenticateAdmin, adminController.getDashboardData);
router.post("/approve-order/:orderId", authenticateAdmin, adminController.approveOrder);
router.post("/reject-order/:orderId", authenticateAdmin, adminController.rejectOrder); // <-- මෙය එකතු කරන ලදී
router.delete("/ban-user", authenticateAdmin, adminController.banUser); // <-- මෙය එකතු කරන ලදී

module.exports = router;