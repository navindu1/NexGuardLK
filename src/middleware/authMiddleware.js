const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

exports.authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    console.log("Auth Middleware: No token provided.");
    return res.status(401).json({ success: false, message: "Unauthorized: No token provided." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log("Auth Middleware Error:", err.message);
      return res.status(403).json({ success: false, message: "Forbidden: Invalid or expired token." });
    }
    req.user = user;
    next();
  });
};

exports.authenticateAdmin = (req, res, next) => {
  // සටහන: මෙය authenticateToken එකට පසුව ධාවනය වන නිසා, අපට req.user කෙලින්ම භාවිතා කළ හැක.
  // නමුත් ආරක්ෂාව සඳහා අපි නැවත Token එක පරීක්ෂා කරමු.
  
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized: No token provided." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error("Admin Auth Error: Token verification failed.", err.message);
      return res.status(403).json({ success: false, message: "Forbidden: Invalid token." });
    }

    // Role එක පරීක්ෂා කිරීම (මෙතැන තමයි ගොඩක් වෙලාවට ප්‍රශ්නය එන්නේ)
    if (user.role !== "admin") {
      console.error(`Admin Auth Error: User ${user.username} is not an admin. Role: ${user.role}`);
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

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err || user.role !== "reseller") {
            return res.status(403).json({ success: false, message: "Forbidden: Reseller privileges required." });
        }
        req.user = user;
        next();
    });
};