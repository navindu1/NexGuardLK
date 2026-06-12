// File Path: src/routes/resellerRoutes.js

const express = require("express");
const router = express.Router();
const resellerController = require("../controllers/resellerController");
const { authenticateReseller } = require("../middleware/authMiddleware");

// Route to get all initial dashboard data for the reseller
router.get("/dashboard-data", authenticateReseller, resellerController.getDashboardData);

// Route to get a specific user's details (must be created by this reseller)
router.get("/users/:userId", authenticateReseller, resellerController.getUserDetails);

// Route to create a new V2Ray user
router.post("/users", authenticateReseller, resellerController.createUser);

// Route to delete a user (must be created by this reseller)
router.delete("/users/:userId", authenticateReseller, resellerController.deleteUser);

module.exports = router;