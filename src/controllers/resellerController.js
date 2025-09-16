// File Path: src/controllers/resellerController.js

const supabase = require('../config/supabaseClient');

// Get all users created by the currently logged-in reseller
exports.getMyUsers = async (req, res) => {
    const resellerId = req.user.id; // Get reseller's ID from the authenticated token

    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, username, email, whatsapp, active_plans, created_at') // Select only non-sensitive data
            .eq('created_by', resellerId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, users: users || [] });

    } catch (error) {
        console.error('Error fetching reseller users:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve users.' });
    }
};