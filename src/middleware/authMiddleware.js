// File Path: src/middleware/authMiddleware.js

const jwt = require('jsonwebtoken');
const supabase = require('../config/supabaseClient');

exports.authMiddleware = async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        if (req.method === 'GET') {
            req.user = null;
            return next();
        }
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', decoded.id)
            .single();

        if (error || !user) {
            return res.status(401).json({ message: 'User not found, authorization denied' });
        }
        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

exports.adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Admin access required' });
    }
};

// --- START: FIX FOR THE CRASH ---
// This function was missing, causing the application to crash.
exports.resellerOnly = (req, res, next) => {
    if (req.user && (req.user.role === 'reseller' || req.user.role === 'admin')) {
        next();
    } else {
        res.status(403).json({ message: 'Reseller access required' });
    }
};
// --- END: FIX FOR THE CRASH ---

