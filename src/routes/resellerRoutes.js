// File Path: src/routes/resellerRoutes.js

const express = require("express");
const router = express.Router();
const resellerController = require("../controllers/resellerController");
const { authenticateReseller } = require("../middleware/authMiddleware");

// Route to get all users created by the logged-in reseller
router.get("/users", authenticateReseller, resellerController.getMyUsers);

// We will add more routes here later (e.g., create user, renew user)

module.exports = router;