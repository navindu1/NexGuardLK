// File Path: src/services/notificationService.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('./v2rayService');
// කෙලින්ම transporter require කිරීම අයින් කළා
// ඒ වෙනුවට emailService එකෙන් sendEmail ගන්නවා:
const { sendEmail, generateEmailTemplate, generateExpiryReminderEmailContent } = require('./emailService');

exports.sendExpiryReminders = async () => {
    console.log('[Cron Daily] Running sendExpiryReminders job...');
    try {
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('id, username, email, active_plans')
            .not('active_plans', 'is', null);

        if (userError) throw userError;

        const now = new Date();
        const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        for (const user of users) {
            if (!user.active_plans || user.active_plans.length === 0 || !user.email) {
                continue;
            }

            for (const plan of user.active_plans) {
                try {
                    const clientData = await v2rayService.findV2rayClient(plan.v2rayUsername);
                    if (clientData && clientData.client && clientData.client.expiryTime > 0) {
                        const expiryDate = new Date(clientData.client.expiryTime);

                        // Expiry එකට පැය 24කට වඩා අඩු නම් Reminder එක යවන්න
                        if (expiryDate > now && expiryDate <= twentyFourHoursFromNow) {
                            console.log(`[Reminder] Plan for ${plan.v2rayUsername} is expiring soon. Sending email to ${user.email}.`);
                            
                            const subject = `Your NexGuard Plan is Expiring Soon!`;
                            const htmlContent = generateEmailTemplate(
                                "Your Plan is Expiring!",
                                `Don't lose your connection. Your plan for ${plan.v2rayUsername} is expiring soon.`,
                                generateExpiryReminderEmailContent(user.username, plan.v2rayUsername, expiryDate)
                            );

                            // මෙතන දැන් පාවිච්චි කරන්නේ අර අපි හදාගත්ත sendEmail function එක
                            await sendEmail(user.email, subject, htmlContent);
                        }
                    }
                } catch (innerError) {
                    console.error(`[Reminder] Error processing plan ${plan.v2rayUsername} for user ${user.username}:`, innerError.message);
                }
            }
        }
        console.log('[Cron Daily] Finished sendExpiryReminders job.');
    } catch (error) {
        console.error('Error in sendExpiryReminders cron job:', error.message);
    }
};