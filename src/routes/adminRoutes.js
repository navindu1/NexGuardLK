const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, authenticateAdmin } = require('../middleware/authMiddleware');

// Middleware to protect all admin routes
router.use(authenticateToken, authenticateAdmin);

// Dashboard
router.get('/stats', adminController.getDashboardStats);

// Orders
router.get('/orders', adminController.getOrders);
router.post('/orders/approve', adminController.approveOrder);
router.post('/orders/reject', adminController.rejectOrder);

// Users & Resellers
router.get('/users', adminController.getUsers);
router.post('/users/credit', adminController.updateUserCredit);
// NEW: User Ban Route (මෙය අලුතින් එකතු කරන ලදි)
router.put('/users/:id/ban', adminController.banUser);
router.get('/resellers', adminController.getResellers);

// Connections Routes
router.get('/connections', adminController.getConnectionsAndPackages);
router.post('/connections', adminController.createConnection);
router.put('/connections/:id', adminController.updateConnection);
router.delete('/connections/:id', adminController.deleteConnection);

// Packages Routes
router.post('/packages', adminController.createPackage);
router.put('/packages/:id', adminController.updatePackage);
router.delete('/packages/:id', adminController.deletePackage);

// Reports Routes
router.get('/reports/chart-data', adminController.getChartData);
router.get('/reports/download', adminController.downloadOrdersReport);
router.get('/reports/summary', adminController.getReportSummary);

// Tutorial Routes
router.post('/tutorials', adminController.addTutorial);
router.delete('/tutorials/:id', adminController.deleteTutorial);

// Plans Routes
router.get('/plans', adminController.getPlans);
router.post('/plans', adminController.createPlan);
router.delete('/plans/:id', adminController.deletePlan);

// Settings Routes
router.get('/settings', adminController.getSettings);
router.post('/settings', adminController.updateSettings);

// V2Ray Routes
router.get('/inbounds', adminController.getV2rayInbounds); 

module.exports = router;