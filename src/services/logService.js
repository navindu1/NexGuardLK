// File Path: src/services/logService.js
const supabase = require('../config/supabaseClient');

exports.logAction = async (adminUsername, action, details = {}) => {
    try {
        const { error } = await supabase.from('audit_log').insert({
            admin_username: adminUsername,
            action: action,
            details: details
        });
        if (error) {
            console.error('Failed to write to audit log:', error);
        }
    } catch (e) {
        console.error('Exception in logAction:', e.message);
    }
};