// File Path: src/middleware/authMiddleware.js

const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

exports.authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized: No token provided." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: "Forbidden: Invalid or expired token." });
    }
    req.user = user;
    next();
  });
};

exports.authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized: No token provided." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Forbidden: Admin privileges required." });
    }
    req.user = user;
    next();
  });
};

exports.authenticateReseller = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ success: false, message: "Unauthorized: No token provided." });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err || user.role !== "reseller") {
            return res.status(403).json({ success: false, message: "Forbidden: Reseller privileges required." });
        }
        req.user = user;
        next();
    });
};