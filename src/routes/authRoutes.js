// File Path: src/routes/authRoutes.js

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/register", authController.register);
router.post("/verify-otp", authController.verifyOtp);
router.post("/login", authController.login);
router.post("/admin/login", authController.adminLogin);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/reseller/login", authController.resellerLogin);

// --- Google Auth Routes ---
router.post("/google-login", authController.googleLogin);
router.post("/update-whatsapp", authController.updateWhatsapp);

// --- අලුතින් එකතු කළ Website Username Check Route එක ---
router.get("/check-username", authController.checkWebsiteUsername);

module.exports = router;