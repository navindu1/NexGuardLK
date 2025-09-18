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

exports.createUser = async (req, res) => {
    const resellerId = req.user.id;
    const { username, planId, connId } = req.body;

    if (!username || !planId || !connId) {
        return res.status(400).json({ success: false, message: 'Username, Plan, and Connection are required.' });
    }

    try {
        const planPrice = planPrices[planId];
        if (planPrice === undefined) {
            return res.status(400).json({ success: false, message: 'Invalid plan selected.' });
        }

        // 1. Check reseller's credit balance
        const { data: reseller, error: resellerError } = await supabase
            .from('users')
            .select('credit_balance')
            .eq('id', resellerId)
            .single();
        if (resellerError || !reseller) throw new Error('Could not verify reseller.');

        if (reseller.credit_balance < planPrice) {
            return res.status(403).json({ success: false, message: 'Insufficient credit balance to create this user.' });
        }

        // 2. Create a temporary "order" to pass to the approval service
        const newOrderId = uuidv4();
        const tempOrder = {
            id: newOrderId,
            username: username,
            website_username: username, // For simplicity, user is their own "website user"
            plan_id: planId,
            conn_id: connId,
            whatsapp: 'N/A',
            receipt_path: 'created_by_reseller',
            status: "pending",
            is_renewal: false
        };
        
        // 3. Create the user record first
        const { data: newUser, error: userCreateError } = await supabase
            .from('users')
            .insert({
                id: uuidv4(),
                username: username,
                email: `${username}@reseller.user`,
                password: 'not_needed',
                created_by: resellerId,
                active_plans: []
            })
            .select()
            .single();
            
        if (userCreateError) throw userCreateError;
        
        // Insert the temporary order
        await supabase.from("orders").insert(tempOrder);

        // 4. Call the approval service to create the V2Ray user and finalize the order
        const approvalResult = await approveOrderService(newOrderId, false);

        if (!approvalResult.success) {
            // If approval fails, roll back user creation
            await supabase.from('users').delete().eq('id', newUser.id);
            throw new Error(approvalResult.message);
        }

        // 5. Deduct credit from reseller
        const newBalance = reseller.credit_balance - planPrice;
        const { error: creditError } = await supabase
            .from('users')
            .update({ credit_balance: newBalance })
            .eq('id', resellerId);
        if (creditError) {
            // This is a critical state - log it for manual review
            console.error(`CRITICAL: Failed to deduct credit for reseller ${resellerId} after user creation.`);
        }
        
        // 6. Fetch the final user data to get the v2rayLink
        const { data: finalUserData } = await supabase.from('users').select('active_plans').eq('id', newUser.id).single();
        const finalPlanDetails = finalUserData.active_plans[0];

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