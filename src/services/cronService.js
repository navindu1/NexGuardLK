// File Path: src/services/cronService.js

const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabaseClient');

exports.cleanupOldReceipts = async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    try {
        // 1. Get old, approved orders with receipts from Supabase
        const { data: oldOrders, error } = await supabase
            .from("orders")
            .select("id, receipt_path")
            .eq("status", "approved")
            .not("receipt_path", "is", null)
            .lte("created_at", fiveDaysAgo.toISOString()); // Use created_at or approved_at

        if (error) throw error;
        if (!oldOrders || oldOrders.length === 0) {
            console.log("Cron Job: No old receipts to delete.");
            return;
        }

        console.log(`Cron Job: Found ${oldOrders.length} old receipts to delete.`);

        for (const order of oldOrders) {
            const fullPath = path.join(process.cwd(), order.receipt_path);

            // 2. Delete the file from the server
            if (fs.existsSync(fullPath)) {
                fs.unlink(fullPath, (err) => {
                    if (err) {
                        console.error(`Cron Job Error: Could not delete file ${fullPath}:`, err);
                    } else {
                        console.log(`Cron Job: Successfully deleted receipt file: ${fullPath}`);
                    }
                });
            }

            // 3. Remove the receipt_path from the database record
            await supabase
                .from("orders")
                .update({ receipt_path: null })
                .eq("id", order.id);
        }
    } catch (error) {
        console.error("Cron Job Error during old receipt cleanup:", error);
    }
};