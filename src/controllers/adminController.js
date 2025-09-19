const supabase = require('../config/supabaseClient');
const { approveOrder: approveOrderService } = require('../services/orderService');
const v2rayService = require('../services/v2rayService');

// --- 1. DASHBOARD & STATS ---
const getDashboardStats = async (req, res) => {
    try {
        const { data: orders, error: ordersError } = await supabase.from('orders').select('status');
        const { data: users, error: usersError } = await supabase.from('users').select('role');
        if (ordersError || usersError) throw ordersError || usersError;
        const stats = {
            pending: orders.filter(o => o.status === 'pending').length,
            unconfirmed: orders.filter(o => o.status === 'unconfirmed').length,
            approved: orders.filter(o => o.status === 'approved').length,
            rejected: orders.filter(o => o.status === 'rejected').length,
            users: users.filter(u => u.role === 'user').length,
            resellers: users.filter(u => u.role === 'reseller').length,
        };
        res.json({ success: true, data: stats });
    } catch (error) {
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
        const { error } = await supabase.from('orders').update({ status: 'rejected' }).eq('id', orderId);
        if (error) throw error;
        res.json({ success: true, message: 'Order rejected successfully.' });
    } catch (error) {
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
        // This requires a Supabase Function named 'add_user_credit'. If not created, use the commented out code.
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
        const { data, error } = await supabase.from('connections').update({ name, icon, requires_package_choice, default_package, default_inbound_id, default_vless_template }).eq('id', id).select().single();
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

// --- 6. LIVE V2RAY PANEL & REPORTS (Restored from old logic) ---
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
    } catch(error) {
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
    } catch(error) {
        res.status(500).json({ success: false, message: 'Failed to update settings.' });
    }
};

module.exports = {
    getDashboardStats,
    getOrders,
    approveOrder,
    rejectOrder,
    getUsers,
    updateUserCredit,
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
    updateSettings
};