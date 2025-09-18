// File Path: src/controllers/adminController.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('../services/v2rayService');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { approveOrder: approveOrderService } = require('../services/orderService');
const { logAction } = require('../services/logService');


exports.getDashboardData = async (req, res) => {
    try {
        const { data: orders, error: oError } = await supabase.from("orders").select("id, status");
        const { data: users, error: uError } = await supabase.from("users").select("id, role");
        const { count: unconfirmedCount, error: unconfirmedError } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('auto_approved', true)
            .is('admin_confirmed_at', null);

        if (oError || uError || unconfirmedError) throw oError || uError || unconfirmedError;

        const { data: allOrdersData, error: allOrdersError } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
        const { data: allUsersData, error: allUsersError } = await supabase.from("users").select("id, username, email, whatsapp, active_plans, role");
        if(allOrdersError || allUsersError) throw allOrdersError || allUsersError;

        const data = {
            stats: {
                pending: orders.filter((o) => o.status === "pending").length,
                approved: orders.filter((o) => o.status === "approved").length,
                rejected: orders.filter((o) => o.status === "rejected").length,
                users: users.length,
                unconfirmed: unconfirmedCount
            },
            pendingOrders: allOrdersData.filter((o) => o.status === "pending").sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
            allOrders: allOrdersData,
            allUsers: allUsersData,
        };
        res.json({ success: true, data });
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.status(500).json({ success: false, message: "Failed to load dashboard data." });
    }
};

exports.approveOrder = async (req, res) => {
    const { orderId } = req.params;
    try {
        const result = await approveOrderService(orderId, false); // false = not auto-approved
        if (!result.success) {
            return res.status(400).json(result);
        }
        await logAction(req.user.username, 'ORDER_APPROVED', { orderId, client: result.finalUsername });
        res.json(result);
    } catch (error) {
        console.error(`Error manually approving order ${orderId}:`, error.message);
        res.status(500).json({ success: false, message: error.message || "An error occurred." });
    }
};

exports.rejectOrder = async (req, res) => {
    const { orderId } = req.params;
    try {
        const { error } = await supabase.from("orders").update({ status: "rejected" }).eq("id", orderId);
        if (error) throw error;
        await logAction(req.user.username, 'ORDER_REJECTED', { orderId });
        res.json({ success: true, message: "Order rejected" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error." });
    }
};

exports.banUser = async (req, res) => {
    const { userId } = req.body;
    try {
        const { data: userToBan, error: findError } = await supabase.from("users").select("username, active_plans").eq("id", userId).single();
        if(findError) throw findError;

        if (userToBan && userToBan.active_plans) {
            for(const plan of userToBan.active_plans) {
                const clientData = await v2rayService.findV2rayClient(plan.v2rayUsername);
                if (clientData) {
                    await v2rayService.deleteClient(clientData.inboundId, clientData.client.id);
                }
            }
        }
        
        const { error: deleteError } = await supabase.from("users").delete().eq("id", userId);
        if (deleteError) throw deleteError;
        
        await logAction(req.user.username, 'USER_BANNED', { bannedUserId: userId, bannedUsername: userToBan.username });
        res.json({ success: true, message: `User has been banned.` });
    } catch (error) {
        console.error("Error banning user:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createReseller = async (req, res) => {
    const { username, email, password, whatsapp } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: "Username, email, and password are required." });
    }
    try {
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .or(`username.eq.${username},email.eq.${email}`)
            .limit(1);

        if (existingUser && existingUser.length > 0) {
            return res.status(409).json({ success: false, message: 'Username or email already exists.' });
        }
        const hashedPassword = bcrypt.hashSync(password, 10);
        const newReseller = {
            id: uuidv4(),
            username,
            email,
            password: hashedPassword,
            whatsapp: whatsapp || null,
            role: 'reseller',
            profile_picture: "assets/profilePhoto.jpg",
            active_plans: [],
        };
        const { error: insertError } = await supabase.from('users').insert(newReseller);
        if (insertError) throw insertError;
        await logAction(req.user.username, 'RESELLER_CREATED', { newResellerUsername: username });
        res.status(201).json({ success: true, message: 'Reseller account created successfully.' });
    } catch (error) {
        console.error('Error creating reseller:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
};

exports.updateReseller = async (req, res) => {
    const { resellerId } = req.params;
    const { username, email, whatsapp, password } = req.body;

    if (!username || !email) {
        return res.status(400).json({ success: false, message: "Username and email are required." });
    }
    try {
        let updateData = { username, email, whatsapp: whatsapp || null };
        if (password && password.length > 0) {
            updateData.password = bcrypt.hashSync(password, 10);
        }
        const { error } = await supabase.from('users').update(updateData).eq('id', resellerId).eq('role', 'reseller');
        if (error) throw error;
        await logAction(req.user.username, 'RESELLER_UPDATED', { resellerId, updatedUsername: username });
        res.status(200).json({ success: true, message: 'Reseller account updated successfully.' });
    } catch (error) {
        console.error('Error updating reseller:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
};

exports.getInboundsWithClients = async (req, res) => {
    try {
        const cookie = await v2rayService.getPanelCookie();
        if (!cookie) throw new Error("Failed to authenticate with V2Ray panel.");
        
        const INBOUNDS_LIST_URL = `${process.env.PANEL_URL}/panel/api/inbounds/list`;
        const { data: inboundsData } = await axios.get(INBOUNDS_LIST_URL, { headers: { Cookie: cookie } });

        if (!inboundsData || !inboundsData.success) throw new Error("Failed to fetch inbounds from V2Ray panel.");
        
        const processedInbounds = inboundsData.obj.map(inbound => {
            const settings = JSON.parse(inbound.settings || '{}');
            const clients = settings.clients || [];
            return {
                id: inbound.id,
                remark: inbound.remark,
                port: inbound.port,
                protocol: inbound.protocol,
                clientCount: clients.length,
                clients: clients.map(c => ({ email: c.email, id: c.id, total: c.total, expiryTime: c.expiryTime, enable: c.enable, up: c.up, down: c.down }))
            };
        }).sort((a, b) => a.id - b.id);

        res.json({ success: true, data: processedInbounds });
    } catch (error) {
        console.error("Error fetching inbounds with clients:", error.message);
        res.status(500).json({ success: false, message: error.message || "An error occurred." });
    }
};

exports.getUnconfirmedOrders = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('auto_approved', true)
            .is('admin_confirmed_at', null)
            .order('created_at', { ascending: true });
        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch unconfirmed orders.' });
    }
};

exports.confirmAutoApprovedOrder = async (req, res) => {
    const { orderId } = req.params;
    try {
        const { error } = await supabase
            .from('orders')
            .update({ admin_confirmed_at: new Date().toISOString() })
            .eq('id', orderId);
        if (error) throw error;
        await logAction(req.user.username, 'AUTO_APPROVAL_CONFIRMED', { orderId });
        res.json({ success: true, message: 'Order confirmed.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to confirm order.' });
    }
};

exports.rejectAutoApprovedOrder = async (req, res) => {
    const { orderId } = req.params;
    try {
        const { data: order, error: orderError } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (orderError || !order) return res.status(404).json({ success: false, message: 'Order not found.' });

        if (order.final_username) {
            const clientData = await v2rayService.findV2rayClient(order.final_username);
            if (clientData) {
                await v2rayService.deleteClient(clientData.inboundId, clientData.client.id);
            }
        }
        const { error } = await supabase
            .from('orders')
            .update({ status: 'rejected', admin_confirmed_at: new Date().toISOString() })
            .eq('id', orderId);
        if (error) throw error;

        await logAction(req.user.username, 'AUTO_APPROVAL_REJECTED', { orderId, rejectedClient: order.final_username });
        res.json({ success: true, message: 'Auto-approved order has been rejected and the client removed.' });
    } catch (error) {
        console.error(`Error rejecting auto-approved order ${orderId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to reject order.' });
    }
};

exports.getAppSettings = async (req, res) => {
    try {
        const { data, error } = await supabase.from('app_settings').select('*');
        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch settings.' });
    }
};

exports.updateAppSettings = async (req, res) => {
    const settings = req.body.settings; // Expects an array of {key, value}
    try {
        const upsertPromises = settings.map(s =>
            supabase.from('app_settings').upsert({ setting_key: s.key, setting_value: s.value }, { onConflict: 'setting_key' })
        );
        await Promise.all(upsertPromises);
        await logAction(req.user.username, 'SETTINGS_UPDATED', { settings });
        res.json({ success: true, message: 'Settings updated successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update settings.' });
    }
};

exports.getSalesSummary = async (req, res) => {
    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select('plan_id, created_at, approved_at')
            .eq('status', 'approved');
        if (error) throw error;

        // Basic plan prices - for a real app, this should come from a database table
        const planPrices = { "100GB": 300, "200GB": 500, "Unlimited": 800 };

        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const summary = {
            last7Days: { totalRevenue: 0, salesByDay: [] },
            last30Days: { totalRevenue: 0, orderCount: 0 },
            allTime: { totalRevenue: 0, orderCount: 0 },
        };

        // Initialize salesByDay for the last 7 days
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            summary.last7Days.salesByDay.push({ date: date.toISOString().split('T')[0], count: 0 });
        }
        
        orders.forEach(order => {
            const price = planPrices[order.plan_id] || 0;
            const approvedDate = new Date(order.approved_at || order.created_at);

            summary.allTime.totalRevenue += price;
            summary.allTime.orderCount++;

            if (approvedDate >= thirtyDaysAgo) {
                summary.last30Days.totalRevenue += price;
                summary.last30Days.orderCount++;
            }
            if (approvedDate >= sevenDaysAgo) {
                summary.last7Days.totalRevenue += price;
                const dateString = approvedDate.toISOString().split('T')[0];
                const dayData = summary.last7Days.salesByDay.find(d => d.date === dateString);
                if (dayData) {
                    dayData.count++;
                }
            }
        });
        
        res.json({ success: true, data: summary });
    } catch (error) {
        console.error("Error generating sales summary:", error);
        res.status(500).json({ success: false, message: 'Failed to generate summary.' });
    }
};

// --- NEW CONNECTION MANAGEMENT FUNCTIONS ---
exports.getConnections = async (req, res) => {
    try {
        const { data, error } = await supabase.from('connections').select('*').order('created_at');
        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch connections.' });
    }
};

exports.createConnection = async (req, res) => {
    const { name, inbound_id, vless_template } = req.body;
    if (!name || !inbound_id || !vless_template) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    try {
        const { error } = await supabase.from('connections').insert({ name, inbound_id, vless_template });
        if (error) throw error;
        await logAction(req.user.username, 'CONNECTION_CREATED', { name, inbound_id });
        res.status(201).json({ success: true, message: 'Connection created successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create connection.' });
    }
};

exports.deleteConnection = async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase.from('connections').delete().eq('id', id);
        if (error) throw error;
        await logAction(req.user.username, 'CONNECTION_DELETED', { connectionId: id });
        res.json({ success: true, message: 'Connection deleted.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete connection.' });
    }
};