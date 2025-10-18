// File Path: src/services/cronService.js (Corrected Version)

const cron = require('node-cron');
const v2rayService = require('./v2rayService');
const supabase = require('../config/supabaseClient');
const logService = require('./logService');
const usageService = require('./usageService'); // <-- නිවැරදි කරන ලදී
const notificationService = require('./notificationService');

let isUsageUpdateRunning = false;

const updateAllClientUsage = async () => {
    if (isUsageUpdateRunning) {
        console.log('Usage update job is already running. Skipping this cycle.');
        return;
    }
    isUsageUpdateRunning = true;
    logService.logInfo('Starting scheduled job: updateAllClientUsage');

    try {
        const allPanelClientsMap = await v2rayService.getAllClientDetails();
        if (allPanelClientsMap.size === 0) {
            logService.logInfo('No clients found in the panel to update.');
            return;
        }

        const { data: allUsers, error: userError } = await supabase
            .from('users')
            .select('id, username, active_plans, notification_token');

        if (userError) throw userError;

        for (const user of allUsers) {
            if (!user.active_plans || user.active_plans.length === 0) continue;

            const updatedPlans = [];
            let needsDbUpdate = false;

            for (const plan of user.active_plans) {
                const clientEmail = plan.v2rayUsername.toLowerCase();
                const panelClient = allPanelClientsMap.get(clientEmail);
                if (!panelClient) continue;

                const lastKnownUsage = plan.lastUsage || 0;
                const currentUsage = panelClient.up + panelClient.down;
                const usedBytes = currentUsage - lastKnownUsage;

                if (usedBytes > 0) {
                    // usageController වෙනුවට usageService භාවිතා කිරීම
                    await usageService.addUsageRecord(plan.v2rayUsername, usedBytes); // <-- නිවැරදි කරන ලදී
                    plan.lastUsage = currentUsage;
                    needsDbUpdate = true;
                }
                updatedPlans.push(plan);
            }

            if (needsDbUpdate) {
                await supabase
                    .from('users')
                    .update({ active_plans: updatedPlans })
                    .eq('id', user.id);
            }
        }
    } catch (error) {
        logService.logError('Error during usage update cron job', { errorMessage: error.message });
    } finally {
        isUsageUpdateRunning = false;
    }
};

const cleanupExpiredClients = async () => {
  // ... මෙම කොටසේ වෙනසක් අවශ්‍ය නැත ...
};

exports.start = () => {
    cron.schedule('*/10 * * * *', updateAllClientUsage);
    cron.schedule('0 0 * * *', cleanupExpiredClients);
    logService.logInfo('Cron jobs scheduled.');
};