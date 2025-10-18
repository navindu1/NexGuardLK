// File Path: src/routes/adminRoutes.js

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authMiddleware, adminOnly } = require('../middleware/authMiddleware');
const upload = require('../config/uploads');

router.use(authMiddleware);
router.use(adminOnly);

router.post('/create-user', adminController.createUser);
router.post('/create-order', upload.single('receipt'), adminController.createOrder);
router.post('/approve-order', adminController.approveOrder);
router.post('/reject-order', adminController.rejectOrder);
router.delete('/delete-order/:id', adminController.deleteOrder);
router.post('/change-plan', upload.single('receipt'), adminController.changePlan);
router.post('/logout', adminController.logoutAdmin);
router.post('/reset-user-traffic', adminController.resetUserTraffic);
router.post('/delete-v2ray-user', adminController.deleteV2rayUser);
router.post('/update-user', adminController.updateUser);
router.post('/settings/update', adminController.updateSettings);

router.get('/orders', adminController.getOrders);
router.get('/settings', adminController.getSettings);
router.get('/users', adminController.getUsers);
router.get('/stats', adminController.getStats);
router.get('/plans', adminController.getPlans);
router.get('/connections', adminController.getConnections);

// FIX: This route is now protected by the middleware applied at the top
router.get('/users/all', adminController.getAllUsernames);

module.exports = router;