// File Path: src/services/cronService.js

// 'fs' සහ 'path' තවදුරටත් අවශ්‍ය නොවේ.
const supabase = require('../config/supabaseClient');

exports.cleanupOldReceipts = async () => {
    // දින 5කට වඩා පැරණි කාලය ලබාගැනීම
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    try {
        // 1. Supabase වෙතින් පැරණි, අනුමත කළ orders ලබාගැනීම
        const { data: oldOrders, error } = await supabase
            .from("orders")
            .select("id, receipt_path")
            .eq("status", "approved")
            .not("receipt_path", "is", null) // receipt_path එකක් ඇති ඒවා පමණක්
            .neq("receipt_path", "created_by_reseller") // reseller-created ඒවා මගහැරීම
            .lte("created_at", fiveDaysAgo.toISOString());

        if (error) throw error;
        if (!oldOrders || oldOrders.length === 0) {
            console.log("Cron Job: No old receipts to delete.");
            return;
        }

        console.log(`Cron Job: Found ${oldOrders.length} old receipts to delete from Supabase Storage.`);

        // 2. එක් එක් order එක සඳහා, Supabase Storage එකෙන් file එක delete කිරීම
        for (const order of oldOrders) {
            // URL එකෙන් file name එක වෙන් කරගැනීම
            // උදා: https://..../receipts/receipt-12345.jpg -> receipt-12345.jpg
            const urlParts = order.receipt_path.split('/');
            const fileName = urlParts[urlParts.length - 1];

            if (fileName) {
                // Supabase Storage වෙතින් file එක ඉවත් කිරීම
                const { error: deleteError } = await supabase.storage.from('receipts').remove([fileName]);

                if (deleteError) {
                    console.error(`Cron Job Error: Could not delete ${fileName} from Supabase Storage:`, deleteError.message);
                } else {
                    console.log(`Cron Job: Successfully deleted receipt ${fileName} from Supabase Storage.`);
                    
                    // 3. Database record එකෙන් receipt_path එක ඉවත් කිරීම
                    await supabase
                        .from("orders")
                        .update({ receipt_path: null })
                        .eq("id", order.id);
                }
            }
        }
    } catch (e) {
        console.error('Exception in cleanupOldReceipts cron job:', e.message);
    }
};