// File Path: src/services/notificationService.js

const supabase = require('../config/supabaseClient');
const v2rayService = require('./v2rayService');
const transporter = require('../config/mailer');
const { generateEmailTemplate, generateExpiryReminderEmailContent } = require('./emailService');

exports.sendExpiryReminders = async () => {
    // ආරම්භක ලොග් පණිවිඩය
    console.log('[Cron Daily] Running sendExpiryReminders job...');
    try {
        // පරිශීලකයන් ලබා ගැනීම
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('id, username, email, active_plans')
            .not('active_plans', 'is', null);

        if (userError) throw userError;

        // වැඩිපුර ලොග්: ලබාගත් පරිශීලකයන් ගණන
        console.log(`[Cron Daily] Fetched users with active plans: ${users ? users.length : 0}`);

        const now = new Date();
        const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        // පරිශීලකයන් හරහා loop වීම
        for (const user of users) {
            // වැඩිපුර ලොග්: වත්මන් පරිශීලකයා
            console.log(`[Cron Daily] Processing user: ${user.username}`);

            if (!user.active_plans || user.active_plans.length === 0 || !user.email) {
                // වැඩිපුර ලොග්: පරිශීලකයා මග හැරීමට හේතුව
                console.log(`[Cron Daily] Skipping user ${user.username} (No active plans or email)`);
                continue; // ඊළඟ පරිශීලකයා වෙත යන්න
            }

            // පරිශීලකයාගේ active plans හරහා loop වීම
            for (const plan of user.active_plans) {
                try {
                    // වැඩිපුර ලොග්: V2Ray පරීක්ෂා කිරීමට පෙර
                    console.log(`[Cron Daily] Checking V2Ray panel for plan: ${plan.v2rayUsername} (User: ${user.username})`);
                    const clientData = await v2rayService.findV2rayClient(plan.v2rayUsername);
                    // වැඩිපුර ලොග්: V2Ray පරීක්ෂාවෙන් පසු expiryTime එක
                    console.log(`[Cron Daily] V2Ray check done for ${plan.v2rayUsername}. ExpiryTime: ${clientData?.client?.expiryTime}`);

                    if (clientData && clientData.client && clientData.client.expiryTime > 0) {
                        const expiryDate = new Date(clientData.client.expiryTime);

                        // කල් ඉකුත් වීමේ වේලාව පරීක්ෂා කිරීම
                        if (expiryDate > now && expiryDate <= twentyFourHoursFromNow) {
                            // වැඩිපුර ලොග්: කල් ඉකුත් වීමේ කොන්දේසිය සපුරා ඇත
                            console.log(`[Reminder] Expiry condition met for: ${plan.v2rayUsername}. Expires at: ${expiryDate}`);

                            console.log(`[Reminder] Plan for ${plan.v2rayUsername} is expiring soon. Sending email to ${user.email}.`);

                            const mailOptions = {
                                from: `NexGuard Support <${process.env.EMAIL_SENDER}>`,
                                to: user.email,
                                subject: `Your NexGuard Plan is Expiring Soon!`,
                                html: generateEmailTemplate(
                                    "Your Plan is Expiring!",
                                    `Don't lose your connection. Your plan for ${plan.v2rayUsername} is expiring soon.`,
                                    generateExpiryReminderEmailContent(user.username, plan.v2rayUsername, expiryDate)
                                ),
                            };
                            // වැඩිපුර ලොග්: Email යැවීමට උත්සාහ කිරීමට පෙර
                            console.log(`[Reminder] Attempting to send email to: ${user.email} for plan ${plan.v2rayUsername}`);
                            await transporter.sendMail(mailOptions);
                            // වැඩිපුර ලොග්: Email (සමහරවිට) යැවීමෙන් පසු
                            console.log(`[Reminder] Email potentially sent to ${user.email} for plan ${plan.v2rayUsername}`);
                        } else {
                            // වැඩිපුර ලොග්: කොන්දේසිය සපුරා නැත
                            console.log(`[Reminder] Expiry condition not met for ${plan.v2rayUsername}. Expiry: ${expiryDate}, Now: ${now}, 24h: ${twentyFourHoursFromNow}`);
                        }
                    } else {
                         // වැඩිපුර ලොග්: Client හමු නොවූ හෝ expiryTime එක 0 වූ විට
                         console.log(`[Reminder] V2Ray client not found or expiryTime is 0 for ${plan.v2rayUsername}. Skipping reminder.`);
                    }
                } catch (innerError) {
                    console.error(`[Reminder] Error processing plan ${plan.v2rayUsername} for user ${user.username}:`, innerError.message);
                    // මෙතන error එකක් ආවොත්, ඊළඟ plan එකට යනවා, function එක crash වෙන්නෙ නෑ.
                }
            }
        }
        // වැඩිපුර ලොග්: Function එක අවසානයට පැමිණියා
        console.log('[Cron Daily] Reached end of sendExpiryReminders function.');
        // අවසාන ලොග් පණිවිඩය
        console.log('[Cron Daily] Finished sendExpiryReminders job.');
    } catch (error) {
        console.error('Error in sendExpiryReminders cron job:', error.message);
        // මෙතන error එකක් ආවොත් (උදා: users ලව ගන්න බැරි උනොත්), සම්පූර්ණ function එකම නවතිනවා.
    }
};
