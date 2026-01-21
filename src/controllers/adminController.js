// File Path: src/controllers/adminController.js

const supabase = require('../config/supabaseClient');
const { approveOrder: approveOrderService } = require('../services/orderService');
const v2rayService = require('../services/v2rayService');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateRejectionEmailContent } = require('../services/emailService');

// --- 1. DASHBOARD & STATS ---
const getDashboardStats = async (req, res) => {
    try {
        const [
            pendingResult,
            unconfirmedResult,
            approvedResult,
            rejectedResult,
            usersResult,
            resellersResult
        ] = await Promise.all([
            supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'unconfirmed'),
            supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
            supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
            supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'user'),
            supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'reseller')
        ]);

        const errors = [pendingResult.error, unconfirmedResult.error, approvedResult.error, rejectedResult.error, usersResult.error, resellersResult.error].filter(Boolean);
        if (errors.length > 0) throw new Error(errors.map(e => e.message).join(', '));

        const stats = {
            pending: pendingResult.count || 0,
            unconfirmed: unconfirmedResult.count || 0,
            approved: approvedResult.count || 0,
            rejected: rejectedResult.count || 0,
            users: usersResult.count || 0,
            resellers: resellersResult.count || 0,
        };
        
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error("Error in getDashboardStats:", error.message);
        res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats.' });
    }
};

// --- 2. ORDER MANAGEMENT ---
const getOrders = async (req, res) => {
    try {
        const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch orders.' });
    }
};

const approveOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        // Call service with 'isAutoConfirm' as false for manual admin approval
        const result = await approveOrderService(orderId, false); 
        if (!result.success) return res.status(400).json(result);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const rejectOrder = async (req, res) => {
    try {
        const { orderId } = req.body;

        // Fetch order details
        const { data: orderToReject, error: fetchError } = await supabase
            .from('orders')
            .select('receipt_path, website_username, plan_id, id, status, final_username')
            .eq('id', orderId)
            .single();

        if (fetchError || !orderToReject) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        // Logic: Delete V2Ray user if it exists (for unconfirmed/approved orders)
        if ((orderToReject.status === 'unconfirmed' || orderToReject.status === 'approved') && orderToReject.final_username) {
            try {
                const clientData = await v2rayService.findV2rayClient(orderToReject.final_username);
                if (clientData) {
                    await v2rayService.deleteClient(clientData.inboundId, clientData.client.id);
                    console.log(`Successfully deleted V2Ray client: ${orderToReject.final_username}`);
                }
            } catch (v2rayError) {
                console.error(`Failed to delete V2Ray client: ${v2rayError.message}`);
            }
        }
        
        // Update order status to 'rejected'
        await supabase.from('orders').update({ status: 'rejected' }).eq('id', orderId);

        // Delete receipt
        if (orderToReject.receipt_path && orderToReject.receipt_path !== 'created_by_reseller') {
            try {
                const fileName = orderToReject.receipt_path.split('/').pop();
                if (fileName) await supabase.storage.from('receipts').remove([fileName]);
            } catch (e) {
                console.error(`Error deleting receipt: ${e.message}`);
            }
        }

        // Send rejection email
        const { data: websiteUser } = await supabase.from("users").select("email, username").eq("username", orderToReject.website_username).single();
        if (websiteUser && websiteUser.email) {
            const mailOptions = {
                from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`,
                to: websiteUser.email,
                subject: "Important Update Regarding Your NexGuard Order",
                html: generateEmailTemplate("Your Order Has Been Rejected", `Unfortunately, your order for the ${orderToReject.plan_id} plan could not be approved.`, generateRejectionEmailContent(websiteUser.username, orderToReject.plan_id, orderToReject.id)),
            };
            try { await transporter.sendMail(mailOptions); } catch (err) { console.error(`FAILED to send rejection email:`, err); }
        }

        res.json({ success: true, message: 'Order rejected and cleaned up.' });
    } catch (error) {
        console.error("Error rejecting order:", error);
        res.status(500).json({ success: false, message: 'Failed to reject order.' });
    }
};

// --- 3. USER & RESELLER MANAGEMENT ---
const getUsers = async (req, res) => {
    try {
        const { data, error } = await supabase.from('users').select('*').neq('role', 'admin').order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch users.' }); }
};

const updateUserCredit = async (req, res) => {
    try {
        const { userId, amount } = req.body;
        if (!userId || isNaN(parseFloat(amount))) return res.status(400).json({ success: false, message: 'Invalid data.' });
        const { error } = await supabase.rpc('add_user_credit', { user_id_param: userId, amount_param: parseFloat(amount) });
        if (error) throw error;
        res.json({ success: true, message: 'Credit added successfully.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to update credit.' }); }
};

// --- 4. CONNECTION & PACKAGE MANAGEMENT ---
const getConnectionsAndPackages = async (req, res) => {
    try {
        const { data, error } = await supabase.from('connections').select('*, packages(*)').order('created_at', { ascending: true });
        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch connections.' }); }
};

const createConnection = async (req, res) => {
    try {
        const { data, error } = await supabase.from('connections').insert([req.body]).select().single();
        if (error) throw error;
        res.status(201).json({ success: true, message: 'Connection created.', data });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to create connection.' }); }
};

const updateConnection = async (req, res) => {
    try {
        const { id } = req.params;
        const { requires_package_choice, default_package, default_inbound_id, default_vless_template, name, icon } = req.body;
        const updateData = { name, icon, requires_package_choice };
        if (requires_package_choice) {
            updateData.default_package = null; updateData.default_inbound_id = null; updateData.default_vless_template = null;
        } else {
            updateData.default_package = default_package; updateData.default_inbound_id = default_inbound_id; updateData.default_vless_template = default_vless_template;
        }
        const { data, error } = await supabase.from('connections').update(updateData).eq('id', id).select().single();
        if (error) throw error;
        res.json({ success: true, message: 'Connection updated.', data });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to update connection.' }); }
};

const deleteConnection = async (req, res) => {
    try {
        const { error } = await supabase.from('connections').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Connection deleted.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to delete connection.' }); }
};

const createPackage = async (req, res) => {
    try {
        const { data, error } = await supabase.from('packages').insert([req.body]).select().single();
        if (error) throw error;
        res.status(201).json({ success: true, message: 'Package created.', data });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to create package.' }); }
};

const updatePackage = async (req, res) => {
    try {
        const { data, error } = await supabase.from('packages').update(req.body).eq('id', req.params.id).select().single();
        if (error) throw error;
        res.json({ success: true, message: 'Package updated.', data });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to update package.' }); }
};

const deletePackage = async (req, res) => {
    try {
        const { error } = await supabase.from('packages').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Package deleted.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to delete package.' }); }
};

// --- 5. PLAN MANAGEMENT ---
const getPlans = async (req, res) => {
    try {
        const { data, error } = await supabase.from('plans').select('*');
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch plans.' }); }
};

const createPlan = async (req, res) => {
    try {
        const { plan_name, price, total_gb } = req.body;
        const { data, error } = await supabase.from('plans').insert([{ plan_name, price: parseFloat(price), total_gb: parseInt(total_gb, 10) }]).select().single();
        if (error) throw error;
        res.status(201).json({ success: true, message: 'Plan created.', data });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to create plan.' }); }
};

const deletePlan = async (req, res) => {
    try {
        const { error } = await supabase.from('plans').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Plan deleted.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to delete plan.' }); }
};

// --- 6. LIVE V2RAY PANEL & REPORTS ---
const getV2rayInbounds = async (req, res) => {
    try {
        const inbounds = await v2rayService.getInboundsWithClients();
        res.json({ success: true, data: inbounds });
    } catch (error) { res.status(500).json({ success: false, message: `Failed: ${error.message}` }); }
};

// --- 7. SETTINGS MANAGEMENT ---
const getSettings = async (req, res) => {
    try {
        const { data, error } = await supabase.from('settings').select('*');
        if (error) throw error;
        const settingsObj = (data || []).reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {});
        res.json({ success: true, data: settingsObj });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch settings.' }); }
};

const updateSettings = async (req, res) => {
    try {
        const promises = Object.entries(req.body).map(([key, value]) => supabase.from('settings').upsert({ key, value }, { onConflict: 'key' }));
        await Promise.all(promises);
        res.json({ success: true, message: 'Settings updated.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to update settings.' }); }
};

const addTutorial = async (req, res) => {
    try {
        const { data, error } = await supabase.from('tutorials').insert([req.body]).select();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

const deleteTutorial = async (req, res) => {
    try {
        const { error } = await supabase.from('tutorials').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

const getResellers = (req, res) => { res.json({ success: true, data: [] }); };

const getReportSummary = async (req, res) => {
    try {
        const { data: plans } = await supabase.from('plans').select('plan_name, price');
        const priceMap = new Map((plans || []).map(p => [p.plan_name, p.price]));
        const now = new Date();
        const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
        const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const { data: daily } = await supabase.from('orders').select('id, plan_id').eq('status', 'approved').gte('approved_at', startOfToday.toISOString());
        const { data: weekly } = await supabase.from('orders').select('id, plan_id').eq('status', 'approved').gte('approved_at', startOfWeek.toISOString());
        const { data: monthly } = await supabase.from('orders').select('id, plan_id').eq('status', 'approved').gte('approved_at', startOfMonth.toISOString());

        const calculate = (orders) => ({ count: orders.length, revenue: orders.reduce((sum, o) => sum + (priceMap.get(o.plan_id) || 0), 0) });
        res.json({ success: true, data: { daily: calculate(daily||[]), weekly: calculate(weekly||[]), monthly: calculate(monthly||[]) } });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to generate report.' }); }
};

const getChartData = async (req, res) => {
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase.from('orders').select('created_at').eq('status', 'approved').gte('created_at', sevenDaysAgo).order('created_at', { ascending: true });
        if (error) throw error;
        
        const counts = {};
        for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); counts[d.toISOString().split('T')[0]] = 0; }
        (data||[]).forEach(o => { const k = new Date(o.created_at).toISOString().split('T')[0]; if (counts[k] !== undefined) counts[k]++; });

        res.json({ success: true, data: { labels: Object.keys(counts), datasets: [{ label: 'Approved Orders', data: Object.values(counts), borderColor: '#a78bfa', backgroundColor: 'rgba(167, 139, 250, 0.2)', fill: true, tension: 0.3 }] } });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch chart.' }); }
};

const downloadOrdersReport = async (req, res) => {
    try {
        const { data: orders } = await supabase.from('orders').select('final_username, plan_id, conn_id, pkg, status, created_at, approved_at, price').order('created_at', { ascending: false });
        let csv = 'V2Ray_Username,Plan,Connection,Package,Status,Created_At,Approved_At,Price\n';
        (orders||[]).forEach(o => { csv += [`"${o.final_username||'N/A'}"`,`"${o.plan_id}"`,`"${o.conn_id}"`,`"${o.pkg||'N/A'}"`,`"${o.status}"`,`"${new Date(o.created_at).toLocaleString()}"`,`"${o.approved_at?new Date(o.approved_at).toLocaleString():'N/A'}"`,`"${o.price||'0.00'}"`].join(',') + '\n'; });
        res.header('Content-Type', 'text/csv'); res.attachment('nexguard-orders-report.csv'); res.send(csv);
    } catch (error) { res.status(500).send('Failed to generate report.'); }
};

module.exports = {
    getDashboardStats, getOrders, approveOrder, rejectOrder, getUsers, updateUserCredit, getResellers,
    getConnectionsAndPackages, createConnection, updateConnection, deleteConnection, createPackage, updatePackage, deletePackage,
    getPlans, createPlan, deletePlan, getV2rayInbounds, getSettings, updateSettings, getReportSummary, getChartData, downloadOrdersReport, addTutorial, deleteTutorial
};