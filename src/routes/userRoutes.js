// File Path: src/routes/userRoutes.js

const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authenticateToken } = require("../middleware/authMiddleware");
const upload = require("../config/uploads");

// Get the logged-in user's status and active plans
router.get("/status", authenticateToken, userController.getUserStatus);

// Get the logged-in user's order history
router.get("/orders", authenticateToken, userController.getUserOrders);

// Update the user's profile picture
router.post(
  "/profile-picture",
  authenticateToken,
  upload.single("avatar"),
  userController.updateProfilePicture
);

// Link an existing V2Ray account to the website account
router.post("/link-v2ray", authenticateToken, userController.linkV2rayAccount);

router.get('/tutorials', authenticateToken, userController.getTutorials);

// Update the user's password
router.post("/update-password", authenticateToken, userController.updatePassword);

// --- FIX IS HERE: Changed 'authMiddleware' to 'authenticateToken' ---
router.post('/unlink', authenticateToken, userController.unlinkPlan);

module.exports = router;