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


router.post("/google-login", authController.googleLogin);
// මේක authRoutes.js එකේ අන්තිම හරියට එකතු කරන්න (module.exports = router; එකට උඩින්)
router.post("/update-whatsapp", authController.updateWhatsapp);

module.exports = router;