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
router.get('/resellers', adminController.getResellers);

// --- START: NEW AND UPDATED ROUTES FOR CONNECTIONS AND PACKAGES ---

// Connections Routes
router.get('/connections', adminController.getConnectionsAndPackages);
router.post('/connections', adminController.createConnection);
router.put('/connections/:id', adminController.updateConnection);
router.delete('/connections/:id', adminController.deleteConnection);

// Packages Routes
router.post('/packages', adminController.createPackage);
router.put('/packages/:id', adminController.updatePackage);
router.delete('/packages/:id', adminController.deletePackage);
router.get('/reports/chart-data', adminController.getChartData);
router.get('/reports/download', adminController.downloadOrdersReport);
router.get('/reports/summary', adminController.getReportSummary);

// --- END: NEW AND UPDATED ROUTES ---
// authMiddleware කෑල්ල මකා දමන්න. උඩින්ම authenticateToken දමා ඇති නිසා එය අවශ්‍ය නැත.
router.post('/tutorials', adminController.addTutorial);
router.delete('/tutorials/:id', adminController.deleteTutorial);

// Plans Routes
router.get('/plans', adminController.getPlans);
router.post('/plans', adminController.createPlan);
router.delete('/plans/:id', adminController.deletePlan);
router.get('/settings', adminController.getSettings);
router.post('/settings', adminController.updateSettings);

router.get('/inbounds', adminController.getV2rayInbounds); 


module.exports = router;



