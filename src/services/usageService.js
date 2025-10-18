// File Path: src/services/usageService.js

const supabase = require('../config/supabaseClient');
const logService = require('./logService');

/**
 * Records a data usage entry in the database.
 * @param {string} username - The V2Ray username.
 * @param {number} usedBytes - The bytes used in the recent period.
 */
const addUsageRecord = async (username, usedBytes) => {
    if (!username || usedBytes <= 0) {
        return; // Don't record if there's no username or no usage
    }
    try {
        const { error } = await supabase
            .from('usage_records')
            .insert([
                {
                    v2ray_username: username,
                    used_bytes: usedBytes,
                    recorded_at: new Date().toISOString(),
                }
            ]);

        if (error) {
            throw error;
        }
    } catch (error) {
        // Log the error using your logService instead of console.error
        logService.logError(`Failed to add usage record for ${username}`, {
            errorMessage: error.message,
            username: username,
            usedBytes: usedBytes,
        });
    }
};

module.exports = {
    addUsageRecord,
};