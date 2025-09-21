// File Path: src/controllers/adminController.js

const supabase = require('../config/supabaseClient');
const { approveOrder: approveOrderService } = require('../services/orderService');
const v2rayService = require('../services/v2rayService');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateRejectionEmailContent } = require('../services/emailService');

// --- 1. DASHBOARD & STATS ---
// --- 1. DASHBOARD & STATS ---

// පැරණි getDashboardStats function එක ඉවත් කර, මෙම අලුත් function එක ඇතුළත් කරන්න
const getDashboardStats = async (req, res) => {
    try {
        // එක් එක් status එකට අදාළව ගණනය කිරීම් සමාන්තරව (parallel) සිදු කරයි
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

        // Error handling
        const errors = [pendingResult.error, unconfirmedResult.error, approvedResult.error, rejectedResult.error, usersResult.error, resellersResult.error].filter(Boolean);
        if (errors.length > 0) {
            throw new Error(errors.map(e => e.message).join(', '));
        }

        // Stats object එක නිර්මාණය කිරීම
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

// ... (ගොනුවේ ඉතිරි කොටස වෙනස් නොකරන්න) ...

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
        const result = await approveOrderService(orderId);
        if (!result.success) return res.status(400).json(result);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const rejectOrder = async (req, res) => {
    try {
        const { orderId } = req.body;

        // Fetch order details including status and final_username
        const { data: orderToReject, error: fetchError } = await supabase
            .from('orders')
            .select('receipt_path, website_username, plan_id, id, status, final_username') // Add status and final_username
            .eq('id', orderId)
            .single();

        if (fetchError || !orderToReject) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if ((orderToReject.status === 'unconfirmed' || orderToReject.status === 'approved') && orderToReject.final_username) {
            try {
                const clientData = await v2rayService.findV2rayClient(orderToReject.final_username);
                if (clientData) {
                    await v2rayService.deleteClient(clientData.inboundId, clientData.client.id);
                    console.log(`Successfully deleted V2Ray client: ${orderToReject.final_username} for rejected order ${orderId}`);
                }
            } catch (v2rayError) {
                console.error(`Failed to delete V2Ray client ${orderToReject.final_username}. Please check manually. Error: ${v2rayError.message}`);
            }
        }
        
        // Update order status to 'rejected'
        await supabase.from('orders').update({ status: 'rejected' }).eq('id', orderId);

        // Delete the receipt from storage
        if (orderToReject.receipt_path && orderToReject.receipt_path !== 'created_by_reseller') {
            try {
                const urlParts = orderToReject.receipt_path.split('/');
                const fileName = urlParts[urlParts.length - 1];
                if (fileName) {
                    await supabase.storage.from('receipts').remove([fileName]);
                }
            } catch (e) {
                console.error(`Error parsing or deleting receipt from storage: ${e.message}`);
            }
        }

        const { data: websiteUser } = await supabase
            .from("users")
            .select("email, username")
            .eq("username", orderToReject.website_username)
            .single();

        if (websiteUser && websiteUser.email) {
            const mailOptions = {
                from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`,
                to: websiteUser.email,
                subject: "Important Update Regarding Your NexGuard Order",
                html: generateEmailTemplate(
                    "Your Order Has Been Rejected",
                    `Unfortunately, your order for the ${orderToReject.plan_id} plan could not be approved.`,
                    generateRejectionEmailContent(websiteUser.username, orderToReject.plan_id, orderToReject.id)
                ),
            };
            transporter.sendMail(mailOptions).catch(err => console.error(`FAILED to send rejection email:`, err));
        }

        res.json({ success: true, message: 'Order rejected and receipt deleted.' });
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
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch users.' });
    }
};

const updateUserCredit = async (req, res) => {
    try {
        const { userId, amount } = req.body;
        if (!userId || isNaN(parseFloat(amount))) {
            return res.status(400).json({ success: false, message: 'User ID and a valid amount are required.' });
        }
        const { error } = await supabase.rpc('add_user_credit', { user_id_param: userId, amount_param: parseFloat(amount) });
        if (error) throw error;
        res.json({ success: true, message: 'Credit added successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update credit.' });
    }
};

// --- 4. CONNECTION & PACKAGE MANAGEMENT ---
const getConnectionsAndPackages = async (req, res) => {
    try {
        const { data, error } = await supabase.from('connections').select('*, packages(*)').order('created_at', { ascending: true });
        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch connections.' });
    }
};

const createConnection = async (req, res) => {
    try {
        const { name, icon, requires_package_choice, default_package, default_inbound_id, default_vless_template } = req.body;
        const { data, error } = await supabase.from('connections').insert([{ name, icon, requires_package_choice, default_package, default_inbound_id, default_vless_template }]).select().single();
        if (error) throw error;
        res.status(201).json({ success: true, message: 'Connection created successfully.', data });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create connection.', error: error.message });
    }
};

const updateConnection = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon, requires_package_choice, default_package, default_inbound_id, default_vless_template } = req.body;

        // Create an object with the fields that are always updated.
        const updateData = {
            name,
            icon,
            requires_package_choice
        };

        // Conditionally add fields to the update object.
        if (requires_package_choice) {
            // If it's a multi-package connection, set default fields to null
            // to avoid database errors with empty strings.
            updateData.default_package = null;
            updateData.default_inbound_id = null;
            updateData.default_vless_template = null;
        } else {
            // If it's a single-package connection, use the values from the form.
            updateData.default_package = default_package;
            updateData.default_inbound_id = default_inbound_id;
            updateData.default_vless_template = default_vless_template;
        }

        const { data, error } = await supabase
            .from('connections')
            .update(updateData) // Use the conditionally built updateData object
            .eq('id', id)
            .select()
            .single();
            
        if (error) throw error;
        
        res.json({ success: true, message: 'Connection updated successfully.', data });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update connection.' });
    }
};

const deleteConnection = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('connections').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true, message: 'Connection and its packages deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete connection.' });
    }
};

const createPackage = async (req, res) => {
    try {
        const { connection_id, name, template, inbound_id } = req.body;
        const { data, error } = await supabase.from('packages').insert([{ connection_id, name, template, inbound_id }]).select().single();
        if (error) throw error;
        res.status(201).json({ success: true, message: 'Package created successfully.', data });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create package.' });
    }
};

const updatePackage = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, template, inbound_id } = req.body;
        const { data, error } = await supabase.from('packages').update({ name, template, inbound_id }).eq('id', id).select().single();
        if (error) throw error;
        res.json({ success: true, message: 'Package updated successfully.', data });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update package.' });
    }
};

const deletePackage = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('packages').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true, message: 'Package deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete package.' });
    }
};

// --- 5. PLAN MANAGEMENT ---
const getPlans = async (req, res) => {
    try {
        const { data, error } = await supabase.from('plans').select('*');
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch plans.' });
    }
};

const createPlan = async (req, res) => {
    try {
        const { plan_name, price, total_gb } = req.body;
        const { data, error } = await supabase.from('plans').insert([{ plan_name, price: parseFloat(price), total_gb: parseInt(total_gb, 10) }]).select().single();
        if (error) throw error;
        res.status(201).json({ success: true, message: 'Plan created successfully.', data });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create plan.' });
    }
};

const deletePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('plans').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true, message: 'Plan deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete plan.' });
    }
};

// --- 6. LIVE V2RAY PANEL & REPORTS ---
const getV2rayInbounds = async (req, res) => {
    try {
        const inbounds = await v2rayService.getInboundsWithClients();
        res.json({ success: true, data: inbounds });
    } catch (error) {
        res.status(500).json({ success: false, message: `Failed to fetch V2Ray inbounds: ${error.message}` });
    }
};

// --- 7. SETTINGS MANAGEMENT ---
const getSettings = async (req, res) => {
    try {
        const { data, error } = await supabase.from('settings').select('*');
        if (error) throw error;
        const settingsObj = (data || []).reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});
        res.json({ success: true, data: settingsObj });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch settings.' });
    }
};

const updateSettings = async (req, res) => {
    try {
        const settings = req.body;
        const upsertPromises = Object.entries(settings).map(([key, value]) =>
            supabase.from('settings').upsert({ key, value }, { onConflict: 'key' })
        );
        const results = await Promise.all(upsertPromises);
        results.forEach(result => { if (result.error) throw result.error; });
        res.json({ success: true, message: 'Settings updated successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update settings.' });
    }
};

const getResellers = (req, res) => {
    // This is a placeholder. You need to implement the logic to get resellers.
    res.json({ success: true, data: [] });
};

// **** START: REVISED REPORTING FUNCTION ****
const getReportSummary = async (req, res) => {
    try {
        // Step 1: Fetch all plans and their prices to create a lookup map
        const { data: plans, error: plansError } = await supabase
            .from('plans')
            .select('plan_name, price');
        if (plansError) throw plansError;
        
        // Create a Map for easy price lookup -> priceMap['100GB'] = 300
        const priceMap = new Map(plans.map(p => [p.plan_name, p.price]));

        // Step 2: Fetch orders without relying on a 'price' column
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // --- Modified Queries: Removed 'price' from select ---
        const { data: daily, error: dailyError } = await supabase.from('orders').select('id, plan_id').eq('status', 'approved').gte('approved_at', startOfToday.toISOString());
        const { data: weekly, error: weeklyError } = await supabase.from('orders').select('id, plan_id').eq('status', 'approved').gte('approved_at', startOfWeek.toISOString());
        const { data: monthly, error: monthlyError } = await supabase.from('orders').select('id, plan_id').eq('status', 'approved').gte('approved_at', startOfMonth.toISOString());

        if (dailyError || weeklyError || monthlyError) throw dailyError || weeklyError || monthlyError;

        // Step 3: Calculate summary dynamically using the priceMap
        const calculateSummary = (orders) => ({
            count: orders.length,
            // Use the priceMap to get the price for each order's plan_id
            revenue: orders.reduce((sum, order) => sum + (priceMap.get(order.plan_id) || 0), 0)
        });

        res.json({
            success: true,
            data: {
                daily: calculateSummary(daily || []),
                weekly: calculateSummary(weekly || []),
                monthly: calculateSummary(monthly || []),
            }
        });
    } catch (error) {
        console.error("Error in getReportSummary:", error.message);
        res.status(500).json({ success: false, message: 'Failed to generate report summary.' });
    }
};
// **** END: REVISED REPORTING FUNCTION ****

const getChartData = async (req, res) => {
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('orders')
            .select('created_at')
            .eq('status', 'approved')
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const counts = {};
        for (let i = 6; i >= 0; i--) { // Iterate backwards to get chronological order
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0]; // YYYY-MM-DD
            counts[key] = 0;
        }

        data.forEach(order => {
            const key = new Date(order.created_at).toISOString().split('T')[0];
            if (counts[key] !== undefined) {
                counts[key]++;
            }
        });

        const labels = Object.keys(counts);
        const chartData = labels.map(label => counts[label]);

        res.json({
            success: true, data: {
                labels, datasets: [{
                    label: 'Approved Orders',
                    data: chartData,
                    borderColor: '#a78bfa',
                    backgroundColor: 'rgba(167, 139, 250, 0.2)',
                    fill: true,
                    tension: 0.3
                }]
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch chart data.' });
    }
};

const downloadOrdersReport = async (req, res) => {
    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select('final_username, plan_id, conn_id, pkg, status, created_at, approved_at, price')
            .order('created_at', { ascending: false });

        if (error) throw error;

        let csv = 'V2Ray_Username,Plan,Connection,Package,Status,Created_At,Approved_At,Price\n';

        orders.forEach(order => {
            const row = [
                `"${order.final_username || 'N/A'}"`,
                `"${order.plan_id}"`,
                `"${order.conn_id}"`,
                `"${order.pkg || 'N/A'}"`,
                `"${order.status}"`,
                `"${new Date(order.created_at).toLocaleString()}"`,
                `"${order.approved_at ? new Date(order.approved_at).toLocaleString() : 'N/A'}"`,
                `"${order.price || '0.00'}"`
            ].join(',');
            csv += row + '\n';
        });

        res.header('Content-Type', 'text/csv');
        res.attachment('nexguard-orders-report.csv');
        res.send(csv);

    } catch (error) {
        res.status(500).send('Failed to generate report.');
    }
};
// **** END: UPDATED REPORTING FUNCTIONS ****

module.exports = {
    getDashboardStats,
    getOrders,
    approveOrder,
    rejectOrder,
    getUsers,
    updateUserCredit,
    getResellers,
    getConnectionsAndPackages,
    createConnection,
    updateConnection,
    deleteConnection,
    createPackage,
    updatePackage,
    deletePackage,
    getPlans,
    createPlan,
    deletePlan,
    getV2rayInbounds,
    getSettings,
    updateSettings,
    getReportSummary,
    getChartData,
    downloadOrdersReport
};