const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authenticateToken } = require("../middleware/authMiddleware");
const upload = require("../config/uploads");

// 1. Get User Status (Dashboard දත්ත ලබා ගැනීම)
router.get("/status", authenticateToken, userController.getUserStatus);

// 2. Get Order History (ඇණවුම් ඉතිහාසය)
router.get("/orders", authenticateToken, userController.getUserOrders);

// 3. Update Profile Picture (පින්තූරය මාරු කිරීම)
router.post(
  "/profile-picture",
  authenticateToken,
  upload.single("avatar"),
  userController.updateProfilePicture
);

// 4. Link Old V2Ray Account (නව Manual Linking විශේෂාංගය)
// අපි අලුතින් යාවත්කාලීන කළ controller එකේ 'linkV2rayAccount' function එක මෙතැනින් call වේ.
router.post("/link-v2ray", authenticateToken, userController.linkV2rayAccount);

// 5. Get Tutorials
router.get('/tutorials', authenticateToken, userController.getTutorials);

// 6. Update Password
router.post("/update-password", authenticateToken, userController.updatePassword);

// 7. Unlink Plan (ගිණුමක් ඉවත් කිරීම)
router.post('/unlink', authenticateToken, userController.unlinkPlan);

module.exports = router;