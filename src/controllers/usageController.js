// File Path: src/controllers/usageController.js

const v2rayService = require('../services/v2rayService');

exports.checkUsage = async (req, res) => {
    const username = req.params.username;
    if (!username) {
        return res.status(400).json({ success: false, message: "Username is required." });
    }
    try {
        const clientData = await v2rayService.findV2rayClient(username);
        if (clientData && clientData.client) {
            res.json({ success: true, data: clientData.client });
        } else {
            res.status(404).json({ success: false, message: "User not found in the panel." });
        }
    } catch (error) {
        console.error(`Error checking usage for ${username}:`, error.message);
        res.status(500).json({ success: false, message: "An internal server error occurred." });
    }
};