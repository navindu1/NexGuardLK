// File Path: src/controllers/resellerController.js

const supabase = require('../config/supabaseClient');
const { approveOrder: approveOrderService } = require('../services/orderService');
const { v4: uuidv4 } = require('uuid');
const v2rayService = require('../services/v2rayService');

// This should be in a database, but for now, we keep it here.
const planPrices = { "100GB": 300, "200GB": 500, "Unlimited": 800 };

exports.getDashboardData = async (req, res) => {
    try {
        const resellerId = req.user.id;

        const { data: reseller, error: resellerError } = await supabase
            .from('users')
            .select('username, credit_balance')
            .eq('id', resellerId)
            .single();

        if (resellerError) throw resellerError;

        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, username, email, whatsapp, active_plans, created_at')
            .eq('created_by', resellerId)
            .order('created_at', { ascending: false });
            
        if (usersError) throw usersError;

        res.json({
            success: true,
            data: {
                reseller,
                users: users || [],
                userCount: users?.length || 0
            }
        });
    } catch (error) {
        console.error('Error fetching reseller dashboard data:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve dashboard data.' });
    }
};

// src/controllers/resellerController.js

exports.createUser = async (req, res) => {
    const resellerId = req.user.id;
    const { username, planId, connId, pkg } = req.body; // Added pkg for multi-package connections

    if (!username || !planId || !connId) {
        return res.status(400).json({ success: false, message: 'Username, Plan, and Connection are required.' });
    }

    try {
        // Step 1: Fetch reseller's current credit balance first.
        const { data: reseller, error: resellerError } = await supabase
            .from('users')
            .select('credit_balance')
            .eq('id', resellerId)
            .single();

        if (resellerError || !reseller) {
            return res.status(404).json({ success: false, message: 'Reseller account not found.' });
        }

        // Step 2: Fetch the plan price from the 'plans' table in the database.
        const { data: plan, error: planError } = await supabase
            .from('plans')
            .select('price')
            .eq('plan_name', planId)
            .single();

        if (planError || !plan) {
            return res.status(400).json({ success: false, message: 'Invalid plan selected.' });
        }
        const planPrice = parseFloat(plan.price);

        // Step 3: Check if the reseller has enough credit BEFORE proceeding.
        if (reseller.credit_balance < planPrice) {
            return res.status(403).json({ success: false, message: 'Insufficient credit balance to create this user.' });
        }
        
        // Step 4: Fetch connection details from the database securely.
        const { data: connection, error: connError } = await supabase
            .from('connections')
            .select('*') // Select all details
            .eq('name', connId)
            .single();

        if (connError || !connection) {
            return res.status(404).json({ success: false, message: 'Selected connection type not found.'});
        }
        
        // Determine which inbound_id and vless_template to use
        let inboundId, vlessTemplate;

        if (connection.requires_package_choice) {
            if (!pkg) {
                return res.status(400).json({ success: false, message: 'A package selection is required for this connection type.' });
            }
            const packageOptions = JSON.parse(connection.package_options || '[]');
            const selectedPackage = packageOptions.find(p => p.name === pkg);
            if (!selectedPackage) {
                return res.status(400).json({ success: false, message: 'Invalid package selected.' });
            }
            inboundId = selectedPackage.inbound_id;
            vlessTemplate = selectedPackage.template;
        } else {
            inboundId = connection.default_inbound_id;
            vlessTemplate = connection.default_vless_template;
        }

        if (!inboundId || !vlessTemplate) {
            return res.status(500).json({ success: false, message: 'Connection configuration is incomplete.' });
        }

        // Step 5: Create a temporary "order" to pass to the approval service.
        const newOrderId = uuidv4();
        const tempOrder = {
            id: newOrderId,
            username: username,
            website_username: username, // For reseller-created users, this is the same
            plan_id: planId,
            conn_id: connId,
            pkg: pkg || null,
            whatsapp: 'N/A', // Not applicable for reseller
            receipt_path: 'created_by_reseller',
            status: "pending",
            is_renewal: false,
            inbound_id: inboundId,
            vless_template: vlessTemplate
        };
        
        // Step 6: Create the user record first.
        const { data: newUser, error: userCreateError } = await supabase
            .from('users')
            .insert({
                id: uuidv4(),
                username: username,
                email: `${username.replace(/\s+/g, '_')}@reseller.user`,
                password: 'not_needed_for_v2ray_only_users',
                created_by: resellerId,
                active_plans: []
            })
            .select()
            .single();
            
        if (userCreateError) {
             if (userCreateError.code === '23505') { // Handle unique constraint violation
                return res.status(409).json({ success: false, message: 'This username is already taken in the system.' });
            }
            throw userCreateError;
        }
        
        // Insert the temporary order record
        await supabase.from("orders").insert(tempOrder);

        // Step 7: Call the approval service to create the V2Ray user and finalize the order.
        const approvalResult = await approveOrderService(newOrderId, false); // isAutoApproved = false

        if (!approvalResult.success) {
            // If approval fails, roll back the user creation
            await supabase.from('users').delete().eq('id', newUser.id);
            // also remove the temporary order
            await supabase.from('orders').delete().eq('id', newOrderId);
            throw new Error(approvalResult.message);
        }

        // Step 8: Deduct credit from reseller's balance.
        const newBalance = reseller.credit_balance - planPrice;
        const { error: creditError } = await supabase
            .from('users')
            .update({ credit_balance: newBalance })
            .eq('id', resellerId);

        if (creditError) {
            // This is a critical state - log it for manual review and alert the admin.
            console.error(`CRITICAL: Failed to deduct credit for reseller ${resellerId} after user creation. Order ID: ${newOrderId}`);
        }
        
        // Step 9: Fetch the final user data to get the generated v2rayLink.
        const { data: finalUserData } = await supabase.from('users').select('active_plans').eq('id', newUser.id).single();
        const finalPlanDetails = finalUserData.active_plans.find(p => p.orderId === newOrderId);

        res.status(201).json({ 
            success: true, 
            message: 'User created successfully!',
            data: {
                v2rayUsername: finalPlanDetails.v2rayUsername,
                v2rayLink: finalPlanDetails.v2rayLink
            }
        });

    } catch (error) {
        console.error('Error in reseller creating user:', error);
        res.status(500).json({ success: false, message: error.message || 'An internal error occurred.' });
    }
};

exports.deleteUser = async (req, res) => {
    const resellerId = req.user.id;
    const { userId } = req.params;

    try {
        // First, verify the user belongs to the reseller
        const { data: user, error: findError } = await supabase
            .from('users')
            .select('id, username, active_plans')
            .eq('id', userId)
            .eq('created_by', resellerId)
            .single();
        
        if (findError || !user) {
            return res.status(404).json({ success: false, message: 'User not found or you do not have permission.' });
        }
        
        // Delete from V2Ray panel
        if (user.active_plans && user.active_plans.length > 0) {
            const v2rayUsername = user.active_plans[0].v2rayUsername;
            const clientData = await v2rayService.findV2rayClient(v2rayUsername);
            if (clientData) {
                await v2rayService.deleteClient(clientData.inboundId, clientData.client.id);
            }
        }
        
        // Delete from database
        const { error: deleteError } = await supabase.from('users').delete().eq('id', userId);
        if (deleteError) throw deleteError;

        res.json({ success: true, message: 'User deleted successfully.' });

    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, message: 'Failed to delete user.' });
    }
};

exports.getUserDetails = async (req, res) => {
    const resellerId = req.user.id;
    const { userId } = req.params;
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, created_at, active_plans')
            .eq('id', userId)
            .eq('created_by', resellerId)
            .single();
        
        if (error || !user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to get user details.' });
    }
}