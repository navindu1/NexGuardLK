const supabase = require('../config/supabaseClient');
const v2rayService = require('../services/v2rayService');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateOrderApprovedEmailContent, generateRejectionEmailContent } = require('../services/emailService');
const { v4: uuidv4 } = require('uuid'); // Imported at top to prevent ReferenceError

// --- 1. DASHBOARD & STATS ---
const getDashboardStats = async (req, res) => {
    try {
        // Fetch counts for each status in parallel
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

        // Construct stats object (Default to 0 if error occurs to prevent redirect loop)
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
        // FIX: Instead of returning 500 (which logs you out), return empty stats to keep dashboard alive
        res.json({ success: true, data: { pending: 0, unconfirmed: 0, approved: 0, rejected: 0, users: 0, resellers: 0 } });
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

// --- APPROVE ORDER (UPDATED TO FIX RENEWAL ISSUE) ---
const approveOrder = async (req, res) => {
    const { orderId } = req.body;

    try {
        // 1. Fetch the order
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (orderError || !order) return res.status(404).json({ success: false, message: "Order not found." });

        // 2. Fetch connection details
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*')
            .eq('name', order.conn_id)
            .single();

        if (connError || !connection) return res.status(400).json({ success: false, message: "Invalid connection type." });

        let vlessLink = "";
        let inboundId = order.inbound_id || connection.default_inbound_id;
        let vlessTemplate = order.vless_template || connection.default_vless_template;

        // --- RENEWAL LOGIC: FIX TO PREVENT NEW FILE CREATION ---
        if (order.is_renewal) {
            console.log(`[Admin] Approving RENEWAL for ${order.username}`);

            // A. Reset Traffic (Usage Reset)
            await v2rayService.resetClientTraffic(inboundId, order.username);

            // B. Find Existing Client to get UUID
            const existingClient = await v2rayService.getClient(inboundId, order.username);
            
            if (existingClient) {
                // Calculate New Expiry (Add 30 days)
                const now = Date.now();
                let newExpiry = now + (30 * 24 * 60 * 60 * 1000); 
                
                // If user still has time, add to it
                if (existingClient.expiryTime > now) {
                    newExpiry = existingClient.expiryTime + (30 * 24 * 60 * 60 * 1000);
                }

                // C. Update Client (Keep same UUID)
                const updateSuccess = await v2rayService.updateClient(inboundId, order.username, {
                    id: existingClient.id, // KEEP OLD UUID
                    email: order.username,
                    expiryTime: newExpiry,
                    enable: true,
                    total: existingClient.total || 0,
                    limitIp: existingClient.limitIp || 0
                });

                if (updateSuccess) {
                    // Generate link with OLD UUID
                    vlessLink = v2rayService.generateV2rayConfigLink(vlessTemplate, existingClient);
                } else {
                    console.error("[Admin] Failed to update client in panel during renewal approval.");
                    return res.status(500).json({ success: false, message: "Failed to update V2Ray client." });
                }
            } else {
                // Fallback: Client deleted? Create new.
                console.warn("[Admin] Renewal client not found, recreating...");
                const uuid = uuidv4();
                const clientSettings = {
                    id: uuid,
                    email: order.username,
                    enable: true,
                    expiryTime: Date.now() + (30 * 24 * 60 * 60 * 1000),
                    totalGB: 0, 
                    limitIp: 0
                };
                await v2rayService.addClient(inboundId, clientSettings);
                vlessLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientSettings);
            }

        } else {
            // --- NEW ORDER / CHANGE PLAN ---
            console.log(`[Admin] Approving NEW/CHANGE for ${order.username}`);
            
            const uuid = uuidv4();
            const clientSettings = {
                id: uuid,
                email: order.username,
                enable: true,
                expiryTime: Date.now() + (30 * 24 * 60 * 60 * 1000),
                totalGB: 0,
                limitIp: 0
            };

            const success = await v2rayService.addClient(inboundId, clientSettings);
            if (!success) return res.status(500).json({ success: false, message: "Failed to create V2Ray client." });
            
            vlessLink = v2rayService.generateV2rayConfigLink(vlessTemplate, clientSettings);
        }

        // 3. Update Order Status
        const { error: updateError } = await supabase
            .from('orders')
            .update({ status: 'approved', vless_link: vlessLink })
            .eq('id', orderId);

        if (updateError) throw updateError;

        // 4. Send Email
        const { data: user } = await supabase.from('users').select('email').eq('username', order.website_username).single();
        if (user) {
            const emailHtml = generateEmailTemplate(
                "Order Approved!",
                `Your order for ${order.plan_id} has been approved.`,
                generateOrderApprovedEmailContent(order.website_username, order.plan_id, vlessLink)
            );
            
            // Fix: Await the email sending
            try {
                await transporter.sendMail({
                    from: process.env.EMAIL_SENDER,
                    to: user.email,
                    subject: "NexGuard - Order Approved",
                    html: emailHtml
                });
            } catch (mailError) {
                console.error("Failed to send approval email:", mailError);
            }
        }

        res.json({ success: true, message: "Order approved successfully." });

    } catch (error) {
        console.error("Approve Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const rejectOrder = async (req, res) => {
    try {
        const { orderId } = req.body;

        // --- NEW: Enhanced Rejection Logic ---
        // Fetch order details including status and final_username
        const { data: orderToReject, error: fetchError } = await supabase
            .from('orders')
            .select('receipt_path, website_username, plan_id, id, status, final_username')
            .eq('id', orderId)
            .single();

        if (fetchError || !orderToReject) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        // If the order was already processed (unconfirmed/approved) and has a v2ray user, delete it from the panel.
        if ((orderToReject.status === 'unconfirmed' || orderToReject.status === 'approved') && orderToReject.final_username) {
            try {
                const clientData = await v2rayService.findV2rayClient(orderToReject.final_username);
                if (clientData) {
                    await v2rayService.deleteClient(clientData.inboundId, clientData.client.id);
                    console.log(`Successfully deleted V2Ray client: ${orderToReject.final_username} for rejected order ${orderId}`);
                }
            } catch (v2rayError) {
                // Log the error but continue, so the order is still marked as rejected in our DB.
                console.error(`Failed to delete V2Ray client ${orderToReject.final_username}. Please check manually. Error: ${v2rayError.message}`);
            }
        }
        
        // Update order status to 'rejected' in our database
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

        // Send rejection email to the user
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
            
            try {
                await transporter.sendMail(mailOptions);
                console.log(`Rejection email sent successfully to ${websiteUser.email}`);
            } catch (err) {
                console.error(`FAILED to send rejection email:`, err);
            }
        }

        res.json({ success: true, message: 'Order rejected and associated V2Ray user/receipt deleted.' });
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

        const updateData = {
            name,
            icon,
            requires_package_choice
        };

        if (requires_package_choice) {
            updateData.default_package = null;
            updateData.default_inbound_id = null;
            updateData.default_vless_template = null;
        } else {
            updateData.default_package = default_package;
            updateData.default_inbound_id = default_inbound_id;
            updateData.default_vless_template = default_vless_template;
        }

        const { data, error } = await supabase
            .from('connections')
            .update(updateData)
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

const getReportSummary = async (req, res) => {
    try {
        const { data: plans, error: plansError } = await supabase
            .from('plans')
            .select('plan_name, price');
        if (plansError) throw plansError;
        
        const priceMap = new Map(plans.map(p => [p.plan_name, p.price]));

        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const { data: daily, error: dailyError } = await supabase.from('orders').select('id, plan_id').eq('status', 'approved').gte('approved_at', startOfToday.toISOString());
        const { data: weekly, error: weeklyError } = await supabase.from('orders').select('id, plan_id').eq('status', 'approved').gte('approved_at', startOfWeek.toISOString());
        const { data: monthly, error: monthlyError } = await supabase.from('orders').select('id, plan_id').eq('status', 'approved').gte('approved_at', startOfMonth.toISOString());

        if (dailyError || weeklyError || monthlyError) throw dailyError || weeklyError || monthlyError;

        const calculateSummary = (orders) => ({
            count: orders.length,
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
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
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