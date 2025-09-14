// =======================================================================
// NexGuard AI - V2Ray Usage Matrix Backend
// Version: 35.0 (Final & Stable with All Fixes)
// =======================================================================

//------------------libraries---------------------------------------------
const express = require("express");
const cron = require('node-cron');
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const nodemailer = require("nodemailer");
const fs = require("fs");
require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const app = express();
const port = process.env.PORT;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));


// --- Environment & Global Variables ---
const PANEL_URL = process.env.PANEL_URL;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = "https://nexguardlk.store";
const LOGO_URL =
process.env.LOGO_PUBLIC_URL || `${FRONTEND_URL}/assets/logo.png`;





// --- Plan & Inbound Configuration ---


cron.schedule('5 0 * * *', async () => {
    console.log('Running daily task: Deleting old receipts...');

    // දවස් 5කට පෙර දිනය ලබාගැනීම
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    try {
        // 1. දවස් 5කට වඩා පරණ, approve කරපු orders හොයාගන්න
        const Order = require('./models/order.model'); 
        
        // (මෙය ඔබගේ database එක අනුව වෙනස් විය හැක. Mongoose/MongoDB උදාහරණයක්)
        const oldOrders = await Order.find({
            status: 'approved',
            approvedAt: { $lte: fiveDaysAgo }, // approvedAt දිනය දවස් 5කට වඩා පරණයි
            receiptPath: { $ne: null }         // receiptPath එකක් තියෙන orders විතරක්
        });

        if (oldOrders.length === 0) {
            console.log('No old receipts to delete.');
            return;
        }

        console.log(`Found ${oldOrders.length} old receipts to delete.`);

        // 2. එක් එක් order එකේ receipt file එක delete කරන්න
        for (const order of oldOrders) {
            const receiptPath = order.receiptPath; // උදා: 'public/uploads/receipts/receipt-123.jpg'
            
            // සම්පූර්ණ file path එක සදාගැනීම
            const fullPath = path.join(__dirname, '..', receiptPath); 

            // 3. File එක server එකෙන් මකා දැමීම
            if (fs.existsSync(fullPath)) {
                fs.unlink(fullPath, async (err) => {
                    if (err) {
                        console.error(`Error deleting file ${fullPath}:`, err);
                    } else {
                        console.log(`Successfully deleted receipt: ${fullPath}`);
                        
                        // 4. (Optional but Recommended) Database එකෙන් receiptPath එක ඉවත් කිරීම
                        order.receiptPath = null;
                        await order.save();
                    }
                });
            } else {
                 console.warn(`File not found, updating DB anyway: ${fullPath}`);
                 // File එක server එකේ නැතත්, DB එක update කිරීම හොඳයි
                 order.receiptPath = null;
                 await order.save();
            }
        }

    } catch (error) {
        console.error('Error during old receipt cleanup task:', error);
    }
});

const planConfig = {
  "100GB": { totalGB: 100 },
  "200GB": { totalGB: 200 },
  "300GB": { totalGB: 300 },
  Unlimited: { totalGB: 0 },
};
const inboundIdConfig = {
  dialog: process.env.INBOUND_ID_DIALOG,
  hutch: process.env.INBOUND_ID_HUTCH,
  dialog_sim: process.env.INBOUND_ID_DIALOG_SIM,
};

// --- Database Setup ---
const USERS_DB_PATH = path.join(__dirname, "users.json");
const ORDERS_DB_PATH = path.join(__dirname, "orders.json");
const readDb = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]", "utf8");
    const data = fs.readFileSync(filePath, "utf8");
    return data.trim() ? JSON.parse(data) : [];
  } catch (e) {
    console.error(`DB Read Error (${path.basename(filePath)}):`, e);
    return [];
  }
};
const writeDb = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`DB Write Error (${path.basename(filePath)}):`, e);
  }
};

// --- Multer Configuration ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath =
      file.fieldname === "receipt" ? "uploads/receipts/" : "public/uploads/";
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const prefix = file.fieldname === "receipt" ? "receipt-" : "avatar-";
    cb(null, prefix + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// --- Email Transporter Setup ---
const transporter = nodemailer.createTransport({
  host: process.env.ZOHO_HOST,
  port: parseInt(process.env.ZOHO_PORT, 10), // Port එක අංකයක් විය යුතුයි
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.ZOHO_USER,
    pass: process.env.ZOHO_PASS,
  },
});

// --- Temporary Storage ---
let tempUsers = {};
let passwordResetTokens = {};

// --- V2Ray Panel Logic ---
let cookies = "";
const LOGIN_URL = `${PANEL_URL}/login`;
const ADD_CLIENT_URL = `${PANEL_URL}/panel/api/inbounds/addClient`;
const DEL_CLIENT_BY_UUID_URL = (inboundId, uuid) =>
  `${PANEL_URL}/panel/api/inbounds/${inboundId}/delClient/${uuid}`;
const INBOUNDS_LIST_URL = `${PANEL_URL}/panel/api/inbounds/list`;

// server.js

// server.js

// ⚠️ REPLACE your OLD loginToPanel function with this FINAL, CORRECTED version
async function loginToPanel() {
    // If we already have a cookie, assume we are logged in.
    if (cookies) return true;

    console.log(`\n[Panel Login] Attempting to login to panel at: ${LOGIN_URL}`);

    try {
        const response = await axios.post(
            LOGIN_URL,
            { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
            {
                // This is the key change: We tell axios NOT to follow redirects.
                // This allows us to capture the response that CONTAINS the Set-Cookie header.
                maxRedirects: 0,
                
                // We will handle all status codes manually, so we tell axios not to throw errors for 3xx codes.
                validateStatus: (status) => status >= 200 && status < 500,
            }
        );

        // Check if the login was successful (status 200 OK or 302 Redirect) AND a cookie was set.
        if ((response.status === 200 || response.status === 302) && response.headers["set-cookie"]) {
            // The cookie name might be different, so we grab the whole cookie string.
            cookies = response.headers["set-cookie"][0];
            console.log("✅ [Panel Login] Successfully logged into V2Ray panel and received session cookie.");
            return true;
        } 
        // Handle specific error cases
        else if (response.status === 401 || response.status === 403) {
             console.error(`❌ [Panel Login] FAILED. Status Code: ${response.status}. LIKELY CAUSE: Incorrect ADMIN_USERNAME or ADMIN_PASSWORD in your .env file.`);
             return false;
        }
        else {
            // Handle other unexpected responses
            console.error(`❌ [Panel Login] FAILED. Received an unexpected status code: ${response.status}. No cookie was set.`);
            console.error("[Panel Login] Response Data:", response.data);
            return false;
        }

    } catch (error) {
        cookies = ""; // Reset cookies on any error
        console.error("\n❌ V2Ray panel login FAILED due to a network or configuration error:");
        if (error.request) {
            console.error(`  ➡️ LIKELY CAUSE: The PANEL_URL ('${PANEL_URL}') is incorrect, the panel is offline, or a firewall is blocking the connection.`);
        } else {
            console.error('[Error Detail] Error setting up the request:', error.message);
        }
        console.log("\n");
        return false;
    }
}

// Function to find a V2Ray client case-insensitively across all inbounds
async function findV2rayClient(username) {
  if (typeof username !== "string" || !username) {
    return null;
  }
  if (!(await loginToPanel())) throw new Error("Panel authentication failed");
  try {
    let clientSettings = null,
        clientInbound = null,
        clientInboundId = null;
    const { data: inboundsData } = await axios.get(INBOUNDS_LIST_URL, {
      headers: { Cookie: cookies },
    });
    if (inboundsData?.success) {
      const lowerCaseUsername = username.toLowerCase();
      for (const inbound of inboundsData.obj) {
        const clients =
          (inbound.settings && JSON.parse(inbound.settings).clients) || [];
        const foundClient = clients.find(
          (c) => c && c.email && c.email.toLowerCase() === lowerCaseUsername
        );
        if (foundClient) {
          clientSettings = foundClient;
          clientInbound = inbound;
          clientInboundId = inbound.id;
          break;
        }
      }
    }
    if (!clientSettings) {
      return null;
    }
    let clientTraffics = {};
    try {
      const TRAFFIC_URL = `${PANEL_URL}/panel/api/inbounds/getClientTraffics/${clientSettings.email}`;
      const { data: trafficData } = await axios.get(TRAFFIC_URL, {
        headers: { Cookie: cookies },
      });
      if (trafficData?.success && trafficData.obj) {
        clientTraffics = trafficData.obj;
      }
    } catch (error) {
      if (clientInbound?.clientStats) {
        const usernameKey = Object.keys(clientInbound.clientStats).find(
          (key) => key.toLowerCase() === clientSettings.email.toLowerCase()
        );
        if (usernameKey) {
          clientTraffics = clientInbound.clientStats[usernameKey];
        }
      }
    }
    const finalClientData = { ...clientTraffics, ...clientSettings };
    return {
      client: finalClientData,
      inbound: clientInbound,
      inboundId: clientInboundId,
    };
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      cookies = "";
      return await findV2rayClient(username);
    }
    throw error;
  }
}

function generateV2rayConfigLink(inboundId, client) {
  if (!client || !client.id || !client.email) return null;
  const uuid = client.id;
  const remark = encodeURIComponent(client.email);
  let templateKey;
  const numericInboundId = parseInt(inboundId);
  const configIds = {
    dialog: parseInt(process.env.INBOUND_ID_DIALOG),
    hutch: parseInt(process.env.INBOUND_ID_HUTCH),
    slt_zoom: parseInt(process.env.INBOUND_ID_SLT_ZOOM),
    slt_netflix: parseInt(process.env.INBOUND_ID_SLT_NETFLIX),
    dialog_sim: parseInt(process.env.INBOUND_ID_DIALOG_SIM),
  };
  if (numericInboundId === configIds.dialog)
    templateKey = "VLESS_TEMPLATE_DIALOG";
  else if (numericInboundId === configIds.hutch)
    templateKey = "VLESS_TEMPLATE_HUTCH";
  else if (numericInboundId === configIds.slt_zoom)
    templateKey = "VLESS_TEMPLATE_SLT_ZOOM";
  else if (numericInboundId === configIds.slt_netflix)
    templateKey = "VLESS_TEMPLATE_SLT_NETFLIX";
  else if (numericInboundId === configIds.dialog_sim)
    templateKey = "VLESS_TEMPLATE_DIALOG_SIM";
  else {
    console.error(
      `No VLESS template found for inbound ID: ${numericInboundId}`
    );
    return null;
  }
  const linkTemplate = process.env[templateKey];
  if (!linkTemplate) {
    console.error(
      `Environment variable for template key "${templateKey}" is not defined.`
    );
    return null;
  }
  return linkTemplate.replace("{uuid}", uuid).replace("{remark}", remark);
}

const generateEmailTemplate = (title, preheader, content) => `
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="utf-8">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="x-ua-compatible" content="ie=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Orbitron:wght@900&display=swap" rel="stylesheet">
    <style>
      .hover-underline:hover { text-decoration: underline !important; }
      @media (max-width: 600px) { .sm-w-full { width: 100% !important; } .sm-px-24 { padding-left: 24px !important; padding-right: 24px !important; } }
    </style>
</head>
<body style="margin: 0; width: 100%; padding: 0; word-break: break-word; -webkit-font-smoothing: antialiased; background-color: #020010;">
    <div style="display: none;">${preheader}</div>
    <div role="article" aria-roledescription="email" aria-label="${title}" lang="en">
        <table style="width: 100%; font-family: 'Inter', sans-serif;" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
                <td align="center" style="background-color: #020010; padding-top: 24px; padding-bottom: 24px;">
                    <table class="sm-w-full" style="width: 600px;" cellpadding="0" cellspacing="0" role="presentation">
                        <tr>
                            <td align="center" class="sm-px-24" style="padding-bottom: 24px;">
                               <img src="${LOGO_URL}" width="180" alt="NexGuard Logo" style="max-width: 100%; vertical-align: middle; line-height: 1; border: 0;">
                            </td>
                        </tr>
                        <tr>
                            <td style="padding-top: 24px; padding-bottom: 24px;">
                                <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                                    <tr>
                                        <td class="sm-px-24" style="background-color: #0a081c; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1); padding: 48px; text-align: left; font-size: 16px; line-height: 24px; color: #e0e0e0; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);">
                                            <p style="font-family: 'Orbitron', sans-serif; font-size: 24px; font-weight: 900; line-height: 1.2; margin: 0 0 24px; color: #ffffff;">${title}</p>
                                            ${content}
                                            <p style="margin: 48px 0 0; padding-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.1); font-size: 14px; color: #9ca3af;">Thank you,<br>The NexGuard Team</p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding-left: 24px; padding-right: 24px; text-align: center; font-size: 12px; color: #9ca3af;">
                                <p style="margin: 0 0 4px;">Copyright &copy; ${new Date().getFullYear()} NexGuard LK. All rights reserved.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </div>
</body>
</html>`;
const generateOtpEmailContent = (otp) => `
<p style="font-size: 16px; line-height: 24px; margin: 0 0 16px; color: #c7d2fe;">Your One-Time Password (OTP) for your NexGuard account is ready. Use the code below to complete your verification:</p>
<div style="background-color: #1e1b4b; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
    <p style="font-size: 14px; line-height: 20px; margin: 0; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px;">Verification Code</p>
    <p style="font-family: 'Orbitron', sans-serif; font-size: 36px; font-weight: 900; letter-spacing: 4px; margin: 8px 0 0 0; color: #ffffff; line-height: 1.2;">${otp}</p>
</div>
<p style="font-size: 14px; line-height: 20px; margin: 0; color: #9ca3af;">This code is valid for 10 minutes. If you did not request this, you can safely ignore this email.</p>`;
const generateApprovalEmailContent = (username, planId, finalUsername) => `
<p style="font-size: 16px; line-height: 24px; margin: 0 0 16px; color: #c7d2fe;">Congratulations, <strong>${username}</strong>! Your NexGuard plan has been approved and is now active.</p>
<div style="background-color: #1e1b4b; border-radius: 8px; padding: 24px; margin: 24px 0; border-left: 4px solid #4ade80;">
    <p style="margin: 0 0 12px 0; font-size: 14px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px;">Plan Details</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
            <td style="padding: 8px 0; color: #c7d2fe; font-size: 16px;">Selected Plan:</td>
            <td style="padding: 8px 0; color: #ffffff; font-size: 16px; font-weight: bold; text-align: right;">${planId}</td>
        </tr>
        <tr>
            <td style="padding: 8px 0; color: #c7d2fe; font-size: 16px; border-top: 1px solid #374151;">Your V2Ray Username:</td>
            <td style="padding: 8px 0; color: #ffffff; font-size: 16px; font-weight: bold; text-align: right; border-top: 1px solid #374151;">${finalUsername}</td>
        </tr>
    </table>
</div>
<p style="font-size: 16px; line-height: 24px; margin: 24px 0 0; color: #c7d2fe;">You can now log in to your profile on our website to find your connection link and manage your account.</p>
<div style="text-align: center; margin-top: 24px;">
    <a href="${FRONTEND_URL}/profile" target="_blank" style="background: linear-gradient(90deg, #818cf8, #a78bfa, #f472b6); color: #ffffff; padding: 14px 24px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block; font-family: 'Orbitron', sans-serif;">Go to My Profile</a>
</div>`;
const generateOrderPlacedEmailContent = (username, planId) => `
<p style="font-size: 16px; line-height: 24px; margin: 0 0 16px; color: #c7d2fe;">Hello, <strong>${username}</strong>!</p>
<p style="font-size: 16px; line-height: 24px; margin: 0 0 24px; color: #c7d2fe;">We have successfully received your order for the <strong>${planId}</strong> plan. It is now pending approval from our administrators.</p>
<div style="background-color: #1e1b4b; border-radius: 8px; padding: 24px; margin: 24px 0; border-left: 4px solid #f59e0b;">
    <p style="margin: 0; font-size: 16px; color: #e0e0e0;">You will receive another email once your plan is activated. You can check the status of your order at any time on your profile page.</p>
</div>
<div style="text-align: center; margin-top: 24px;">
    <a href="${FRONTEND_URL}/profile?tab=my-orders" target="_blank" style="background: linear-gradient(90deg, #818cf8, #a78bfa, #f472b6); color: #ffffff; padding: 14px 24px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block; font-family: 'Orbitron', sans-serif;">Check Order Status</a>
</div>`;
const generatePasswordResetEmailContent = (username, resetLink) => `
<p style="font-size: 16px; line-height: 24px; margin: 0 0 16px; color: #c7d2fe;">Hello, <strong>${username}</strong>!</p>
<p style="font-size: 16px; line-height: 24px; margin: 0 0 24px; color: #c7d2fe;">We received a request to reset your password. Click the button below to set a new one. If you did not make this request, please ignore this email.</p>
<div style="text-align: center; margin: 32px 0;">
    <a href="${resetLink}" target="_blank" style="background: linear-gradient(90deg, #818cf8, #a78bfa, #f472b6); color: #ffffff; padding: 14px 24px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block; font-family: 'Orbitron', sans-serif;">Reset Your Password</a>
</div>
<p style="font-size: 14px; line-height: 20px; margin: 24px 0 0; color: #9ca3af;">This password reset link is valid for 1 hour.</p>`;

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token)
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized: No token provided." });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err)
      return res.status(403).json({
        success: false,
        message: "Forbidden: Invalid or expired token.",
      });
    req.user = user;
    next();
  });
};
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token)
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized: No token provided." });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err)
      return res.status(403).json({
        success: false,
        message: "Forbidden: Invalid or expired token.",
      });
    if (user.role !== "admin")
      return res.status(403).json({
        success: false,
        message: "Forbidden: Admin privileges required.",
      });
    req.user = user;
    next();
  });
};


app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Also, serve your admin login page if it's separate
app.get('/admin-login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// --- API Endpoints ---
app.post("/api/auth/register", (req, res) => {
  const { username, email, whatsapp, password } = req.body;
  if (!username || !email || !whatsapp || !password)
    return res
      .status(400)
      .json({ success: false, message: "All fields are required." });
  const users = readDb(USERS_DB_PATH);
  if (
    users.some(
      (u) =>
        u.username.toLowerCase() === username.toLowerCase() ||
        u.email.toLowerCase() === email.toLowerCase()
    )
  ) {
    return res
      .status(409)
      .json({ success: false, message: "Username or email is already taken." });
  }
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedPassword = bcrypt.hashSync(password, 10);
  const otpExpiry = Date.now() + 10 * 60 * 1000;
  tempUsers[email] = {
    id: uuidv4(),
    username,
    email,
    whatsapp,
    password: hashedPassword,
    otp,
    otpExpiry,
  };
  const mailOptions = {
    from: `NexGuard <${process.env.EMAIL_SENDER}>`,
    to: email,
    subject: "Your NexGuard Verification Code",
    html: generateEmailTemplate(
      "Verify Your Email",
      "Your OTP is inside.",
      generateOtpEmailContent(otp)
    ),
  };
  transporter.sendMail(mailOptions)
    .then(() => {
      console.log(`OTP sent to ${email} via Zoho: ${otp}`);
      res.status(200).json({
        success: true,
        message: `An OTP has been sent to ${email}. Please verify to complete registration.`,
      });
    })
    .catch(error => {
      console.error("Error sending OTP email via Zoho:", error);
      res.status(500).json({
        success: false,
        message: "Could not send OTP. Please try again.",
      });
    });

});
app.post("/api/auth/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  const tempUser = tempUsers[email];
  if (!tempUser)
    return res
      .status(400)
      .json({ success: false, message: "Invalid request or session expired." });
  if (Date.now() > tempUser.otpExpiry) {
    delete tempUsers[email];
    return res.status(400).json({
      success: false,
      message: "OTP has expired. Please register again.",
    });
  }
  if (tempUser.otp !== otp)
    return res.status(400).json({ success: false, message: "Invalid OTP." });
  const users = readDb(USERS_DB_PATH);
  const newUser = {
    id: tempUser.id,
    username: tempUser.username,
    email: tempUser.email,
    whatsapp: tempUser.whatsapp,
    password: tempUser.password,
    profilePicture: "public/assets/profilePhoto.jpg",
    activePlans: [],
  };
  users.push(newUser);
  writeDb(USERS_DB_PATH, users);
  delete tempUsers[email];
  const token = jwt.sign(
    { id: newUser.id, username: newUser.username },
    JWT_SECRET,
    { expiresIn: "1d" }
  );
  const userPayload = {
    id: newUser.id,
    username: newUser.username,
    email: newUser.email,
    whatsapp: newUser.whatsapp,
    profilePicture: newUser.profilePicture,
  };
  res.status(201).json({
    success: true,
    message: "Account verified and created successfully!",
    token,
    user: userPayload,
  });
});
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const users = readDb(USERS_DB_PATH);
  const user = users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase()
  );
  if (user && bcrypt.compareSync(password, user.password)) {
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "1d" }
    );
    const userPayload = {
      id: user.id,
      username: user.username,
      email: user.email,
      whatsapp: user.whatsapp,
      profilePicture: user.profilePicture
        ? user.profilePicture.replace(/\\/g, "/").replace("public/", "")
        : "assets/profilePhoto.jpg",
    };
    res.json({
      success: true,
      message: "Logged in successfully!",
      token,
      user: userPayload,
    });
  } else {
    res
      .status(401)
      .json({ success: false, message: "Invalid username or password." });
  }
});
app.post("/api/auth/forgot-password", (req, res) => {
  const { email } = req.body;
  if (!email)
    return res
      .status(400)
      .json({ success: false, message: "Email address is required." });
  const users = readDb(USERS_DB_PATH);
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.json({
      success: true,
      message:
        "If an account with this email exists, a password reset link has been sent.",
    });
  }
  const token = crypto.randomBytes(32).toString("hex");
  const expiry = Date.now() + 3600000; // 1 hour
  passwordResetTokens[token] = { userId: user.id, email: user.email, expiry };
  const resetLink = `${FRONTEND_URL}/reset-password?token=${token}`;
  const mailOptions = {
    from: `NexGuard Support <${process.env.EMAIL_SENDER}>`,
    to: user.email,
    subject: "NexGuard Password Reset Request",
    html: generateEmailTemplate(
      "Reset Your Password",
      `A request was made to reset your password.`,
      generatePasswordResetEmailContent(user.username, resetLink)
    ),
  };
  transporter.sendMail(mailOptions, (error) => {
    if (error) {
      console.error("Error sending password reset email:", error);
    }
    console.log(`Password reset link sent to ${user.email}`);
    res.json({
      success: true,
      message:
        "If an account with this email exists, a password reset link has been sent.",
    });
  });
});
app.post("/api/auth/reset-password", (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword)
    return res.status(400).json({
      success: false,
      message: "Token and new password are required.",
    });
  if (newPassword.length < 6)
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters long.",
    });
  const tokenData = passwordResetTokens[token];
  if (!tokenData || Date.now() > tokenData.expiry) {
    delete passwordResetTokens[token];
    return res.status(400).json({
      success: false,
      message: "This reset link is invalid or has expired.",
    });
  }
  let users = readDb(USERS_DB_PATH);
  const userIndex = users.findIndex((u) => u.id === tokenData.userId);
  if (userIndex === -1)
    return res.status(404).json({ success: false, message: "User not found." });
  users[userIndex].password = bcrypt.hashSync(newPassword, 10);
  writeDb(USERS_DB_PATH, users);
  delete passwordResetTokens[token];
  res.json({
    success: true,
    message: "Password has been reset successfully. You can now log in.",
  });
});
app.get("/api/check-usage/:username", async (req, res) => {
  const username = req.params.username;
  if (!username) {
    return res
      .status(400)
      .json({ success: false, message: "Username is required." });
  }
  try {
    const clientData = await findV2rayClient(username);
    if (clientData && clientData.client) {
      res.json({ success: true, data: clientData.client });
    } else {
      res
        .status(404)
        .json({ success: false, message: "User not found in the panel." });
    }
  } catch (error) {
    if (error.message === "Panel authentication failed") {
         return res.status(503).json({ success: false, message: 'Session was renewed. Please try your request again.' });
    }
    console.error(`Error checking usage for ${username}:`, error.message);
    res
      .status(500)
      .json({ success: false, message: "An internal server error occurred." });
  }
});
// server.js
  app.post(
  "/api/create-order",
  authenticateToken,
  upload.single("receipt"),
  async (req, res) => { // async ලෙස වෙනස් කරන ලදී
    const { planId, connId, pkg, whatsapp, username, isRenewal } = req.body;
    if (!planId || !connId || !whatsapp || !username)
      return res.status(400).json({
        success: false,
        message: "Missing required order information.",
      });

    const orders = readDb(ORDERS_DB_PATH);
    const newOrder = {
      id: uuidv4(),
      username: username,
      websiteUsername: req.user.username,
      planId,
      connId,
      pkg: pkg || null,
      whatsapp,
      receiptPath: req.file.path,
      status: "pending",
      createdAt: new Date().toISOString(),
      isRenewal: isRenewal === "true",
    };
    orders.push(newOrder);
    writeDb(ORDERS_DB_PATH, orders);

    // --- 👇 අලුතින් එකතු කළ email යැවීමේ කොටස ---
    try {
      const users = readDb(USERS_DB_PATH);
      const websiteUser = users.find(u => u.username.toLowerCase() === req.user.username.toLowerCase());

      if (websiteUser && websiteUser.email) {
        const mailOptions = {
          from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`,
          to: websiteUser.email,
          subject: 'Your NexGuard Order Has Been Received!',
          html: generateEmailTemplate(
            'Order Received!',
            `Your order for the ${planId} plan is pending approval.`,
            generateOrderPlacedEmailContent(websiteUser.username, planId)
          ),
        };

        transporter.sendMail(mailOptions)
          .then(() => console.log(`✅ Order placed confirmation email sent to ${websiteUser.email}`))
          .catch(err => console.error(`❌ FAILED to send order placed email:`, err));
      }
    } catch (error) {
        console.error("Error preparing order confirmation email:", error);
    }
    // --- 👆 අලුත් කොටස මෙතනින් අවසන් වේ ---

    res
      .status(201)
      .json({ success: true, message: "Order submitted successfully!" });
  }
);

// =======================================================
// === USER-RELATED API ENDPOINTS (PROFILE PAGE) ===
// =======================================================
// server.js

// ⚠️ REPLACE your old '/api/user/status' endpoint with this new async version
app.get("/api/user/status", authenticateToken, async (req, res) => {
    const users = readDb(USERS_DB_PATH);
    const userIndex = users.findIndex((u) => u.id === req.user.id);

    if (userIndex === -1) {
        return res.status(404).json({ success: false, message: "User not found." });
    }

    const user = users[userIndex];
    
    // Check for pending orders first (no change here)
    const orders = readDb(ORDERS_DB_PATH);
    const pendingOrder = orders.find(
        (o) => o.websiteUsername.toLowerCase() === user.username.toLowerCase() && o.status === "pending"
    );
    if (pendingOrder && (!user.activePlans || user.activePlans.length === 0)) {
        return res.json({ success: true, status: "pending" });
    }

    // If user has no active plans, no need to check the panel
    if (!user.activePlans || user.activePlans.length === 0) {
        return res.json({ success: true, status: "no_plan" });
    }

    // --- NEW VERIFICATION LOGIC STARTS HERE ---
    try {
        const verifiedActivePlans = [];
        console.log(`[Verification] Checking plans for user: ${user.username}`);

        // Loop through each plan and check if it exists in the V2Ray panel
        for (const plan of user.activePlans) {
            const clientExists = await findV2rayClient(plan.v2rayUsername);
            if (clientExists) {
                // If client exists in the panel, it's a valid plan
                verifiedActivePlans.push(plan);
            } else {
                // If client does NOT exist, log it and do not add it to the verified list
                console.log(`[Verification] Plan '${plan.v2rayUsername}' not found in panel. Removing from user profile.`);
            }
        }

        // If the number of plans has changed, update the database
        if (verifiedActivePlans.length !== user.activePlans.length) {
            console.log(`[DB Update] Updating active plans for ${user.username}.`);
            users[userIndex].activePlans = verifiedActivePlans;
            writeDb(USERS_DB_PATH, users);
        }
        
        // If after verification, no plans are left, change status to 'no_plan'
        if (verifiedActivePlans.length === 0) {
            return res.json({ success: true, status: "no_plan" });
        }

        // Return the verified list of active plans
        return res.json({
            success: true,
            status: "approved",
            activePlans: verifiedActivePlans,
        });

    } catch (error) {
        // SAFETY FEATURE: If the V2Ray panel is down or there's a login error,
        // DO NOT delete any plans. Just return the existing list.
        console.warn(`[Verification Warning] Could not connect to V2Ray panel to verify plans for user ${user.username}. Returning existing plan list. Error: ${error.message}`);
        return res.json({
            success: true,
            status: "approved",
            activePlans: user.activePlans,
        });
    }
});

// Add this new endpoint to get user-specific orders
app.get("/api/user/orders", authenticateToken, (req, res) => {
  try {
    const allOrders = readDb(ORDERS_DB_PATH);
    const userOrders = allOrders
      .filter(o => o.websiteUsername.toLowerCase() === req.user.username.toLowerCase())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort by newest first

    res.json({ success: true, orders: userOrders });
  } catch (error) {
    console.error("Error fetching user orders:", error);
    res.status(500).json({ success: false, message: "Could not retrieve orders." });
  }
});

app.post(
  "/api/user/profile-picture",
  authenticateToken,
  upload.single("avatar"),
  (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file was uploaded." });
    }
    let users = readDb(USERS_DB_PATH);
    const userIndex = users.findIndex((u) => u.id === req.user.id);
    if (userIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }
    const oldPicture = users[userIndex].profilePicture;
    if (oldPicture && oldPicture !== "public/assets/profilePhoto.jpg") {
      fs.unlink(path.join(__dirname, oldPicture), (err) => {
        if (err) console.error("Could not delete old avatar:", err.message);
      });
    }
    const filePath = req.file.path.replace(/\\/g, "/");
    users[userIndex].profilePicture = filePath;
    writeDb(USERS_DB_PATH, users);
    res.json({
      success: true,
      message: "Profile picture updated.",
      filePath: filePath.replace("public/", ""),
    });
  }
);

app.post("/api/user/link-v2ray", authenticateToken, async (req, res) => {
  const { v2rayUsername } = req.body;
  if (!v2rayUsername) {
    return res
      .status(400)
      .json({ success: false, message: "V2Ray username is required." });
  }
  try {
    const clientData = await findV2rayClient(v2rayUsername);
    if (!clientData || !clientData.client) {
      return res.status(404).json({
        success: false,
        message: "This V2Ray username was not found in our panel.",
      });
    }
    let users = readDb(USERS_DB_PATH);
    const userIndex = users.findIndex((u) => u.id === req.user.id);
    if (userIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Logged in user not found." });
    }
    const isAlreadyLinked = users.some(
      (u) =>
        u.activePlans &&
        u.activePlans.some(
          (p) => p.v2rayUsername.toLowerCase() === v2rayUsername.toLowerCase()
        )
    );
    if (isAlreadyLinked) {
      return res.status(409).json({
        success: false,
        message:
          "This V2Ray account is already linked to another website account.",
      });
    }

    let detectedPlanId = "Unlimited";
    const totalBytes = clientData.client.total || 0;
    if (totalBytes > 0) {
      const totalGB = Math.round(totalBytes / (1024 * 1024 * 1024));
      if (planConfig[`${totalGB}GB`]) {
        detectedPlanId = `${totalGB}GB`;
      }
    }

    let detectedConnId = "Unknown";
    const inboundId = clientData.inboundId;
    const inboundIdMap = {
      [process.env.INBOUND_ID_DIALOG]: "dialog",
      [process.env.INBOUND_ID_HUTCH]: "hutch",
      [process.env.INBOUND_ID_SLT_ZOOM]: "slt_fiber",
      [process.env.INBOUND_ID_SLT_NETFLIX]: "slt_router",
      [process.env.INBOUND_ID_DIALOG_SIM]: "dialog_sim",
    };
    detectedConnId = inboundIdMap[inboundId] || "Unknown";

    if (!users[userIndex].activePlans) {
      users[userIndex].activePlans = [];
    }
    const newPlan = {
      v2rayUsername: clientData.client.email,
      v2rayLink: generateV2rayConfigLink(
        clientData.inboundId,
        clientData.client
      ),
      planId: detectedPlanId,
      connId: detectedConnId,
      activatedAt: new Date().toISOString(),
      orderId: "linked-" + uuidv4(),
    };
    users[userIndex].activePlans.push(newPlan);
    writeDb(USERS_DB_PATH, users);
    res.json({
      success: true,
      message: "Your V2Ray account has been successfully linked!",
    });
  } catch (error) {
    console.error("Error linking V2Ray account:", error);
    res
      .status(500)
      .json({ success: false, message: "An internal server error occurred." });
  }
});

// Admin Login API endpoint
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = jwt.sign({ username: ADMIN_USERNAME, role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// server.js

// ⚠️ REPLACE your old '/api/admin/dashboard-data' endpoint with this more robust version
app.get('/api/admin/dashboard-data', authenticateAdmin, (req, res) => {
    try {
        const orders = readDb(ORDERS_DB_PATH);
        const users = readDb(USERS_DB_PATH);

        // Ensure orders and users are arrays before filtering
        const validOrders = Array.isArray(orders) ? orders : [];
        const validUsers = Array.isArray(users) ? users : [];

        // Remove passwords before sending user data
        const safeUsers = validUsers.map(({ password, ...user }) => user);

        const data = {
            stats: {
                pending: validOrders.filter(o => o.status === 'pending').length,
                approved: validOrders.filter(o => o.status === 'approved').length,
                rejected: validOrders.filter(o => o.status === 'rejected').length,
                users: validUsers.length
            },
            pendingOrders: validOrders.filter(o => o.status === 'pending').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
            allOrders: validOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
            allUsers: safeUsers
        };
        res.json({ success: true, data });

    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.status(500).json({ success: false, message: "Failed to load dashboard data." });
    }
});

app.post('/api/user/update-password', authenticateToken, (req, res) => {
    const { newPassword } = req.body;
    const userId = req.user.id; // Get user ID from the authenticated token

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    let users = readDb(USERS_DB_PATH);
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
        return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Hash the new password before saving
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    users[userIndex].password = hashedPassword;

    writeDb(USERS_DB_PATH, users);

    res.json({ success: true, message: 'Password updated successfully!' });
});

// Endpoint to get all dashboard stats
app.get('/api/admin/stats', authenticateAdmin, (req, res) => {
    const orders = readDb(ORDERS_DB_PATH);
    const users = readDb(USERS_DB_PATH);
    const stats = {
        pending: orders.filter(o => o.status === 'pending').length,
        approved: orders.filter(o => o.status === 'approved').length,
        rejected: orders.filter(o => o.status === 'rejected').length,
        users: users.length
    };
    res.json(stats);
});

// Endpoint to get ONLY pending orders
app.get('/api/admin/orders', authenticateAdmin, (req, res) => {
    const orders = readDb(ORDERS_DB_PATH);
    const pendingOrders = orders.filter(order => order.status === 'pending');
    res.json({ success: true, orders: pendingOrders });
});

// Endpoint to get completed order history
app.get('/api/admin/order-history', authenticateAdmin, (req, res) => {
    const orders = readDb(ORDERS_DB_PATH);
    const completedOrders = orders.filter(order => order.status === 'approved' || order.status === 'rejected');
    res.json(completedOrders);
});

// Endpoint to get all users
app.get('/api/admin/users', authenticateAdmin, (req, res) => {
    const users = readDb(USERS_DB_PATH);
    // Do not send passwords to the client
    const safeUsers = users.map(({ password, ...user }) => user);
    res.json(safeUsers);
});

// Endpoint to reject an order
app.post('/api/admin/reject-order/:orderId', authenticateAdmin, (req, res) => {
    const { orderId } = req.params;
    let orders = readDb(ORDERS_DB_PATH);
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) {
        return res.status(404).json({ success: false, message: 'Order not found' });
    }
    orders[orderIndex].status = 'rejected';
    writeDb(ORDERS_DB_PATH, orders);
    res.json({ success: true, message: 'Order rejected' });
});

// Endpoint to ban a user (deletes from website and panel)
app.delete('/api/admin/ban-user', authenticateAdmin, async (req, res) => {
    const { userId, v2rayUsername } = req.body;
    try {
        if (v2rayUsername) {
            if (!await loginToPanel()) throw new Error("Panel auth failed.");
            const clientData = await findV2rayClient(v2rayUsername);
            if (clientData) {
                await axios.post(DEL_CLIENT_BY_UUID_URL(clientData.inboundId, clientData.client.id), {}, { headers: { Cookie: cookies } });
            }
        }
        let users = readDb(USERS_DB_PATH);
        const filteredUsers = users.filter(u => u.id !== userId);
        writeDb(USERS_DB_PATH, filteredUsers); // Corrected from 'users' to 'filteredUsers'
        res.json({ success: true, message: `User ${userId} has been banned.` });
    } catch (error) {
        console.error("Error banning user:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post(
  "/api/admin/approve-order/:orderId",
  authenticateAdmin,
  async (req, res) => {
    const orderId = req.params.orderId;
    if (!(await loginToPanel()))
      return res
        .status(500)
        .json({ success: false, message: "Panel authentication failed." });
    let orders = readDb(ORDERS_DB_PATH);
    const orderIndex = orders.findIndex((o) => o.id === orderId);
    if (orderIndex === -1)
      return res
        .status(404)
        .json({ success: false, message: "Order not found." });
    const order = orders[orderIndex];
    let users = readDb(USERS_DB_PATH);
    const userIndex = users.findIndex(
      (u) => u.username.toLowerCase() === order.websiteUsername.toLowerCase()
    );
    if (userIndex === -1)
      return res.status(404).json({
        success: false,
        message: `Website user "${order.websiteUsername}" not found.`,
      });
    try {
      const plan = planConfig[order.planId];
      let inboundId = inboundIdConfig[order.connId];
      if (["slt_fiber", "slt_router"].includes(order.connId)) {
        inboundId = order.pkg?.toLowerCase().includes("netflix")
          ? process.env.INBOUND_ID_SLT_NETFLIX
          : process.env.INBOUND_ID_SLT_ZOOM;
      }
      if (!inboundId || !plan)
        return res.status(400).json({
          success: false,
          message: "Invalid plan/connection in order.",
        });

      // Common settings for new/renewed clients
      const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const newSettings = {
        enable: true,
        totalGB: (plan.totalGB || 0) * 1024 * 1024 * 1024,
        expiryTime: expiryTime,
      };

      let clientLink;
      let finalUsername = order.username;

      // ======================= RENEWAL LOGIC =======================
      if (order.isRenewal) {
        // Find the existing client in the panel
        const clientInPanel = await findV2rayClient(order.username);
        
        // If client exists, delete it first to reset everything
        if (clientInPanel) {
          // Use the inbound ID from the existing client for accuracy
          inboundId = clientInPanel.inboundId;
          await axios.post(
            DEL_CLIENT_BY_UUID_URL(inboundId, clientInPanel.client.id), {}, { headers: { Cookie: cookies } }
          );
        }

        // Re-create the client with the same name but new settings
        const clientSettings = { id: uuidv4(), email: finalUsername, ...newSettings };
        const payload = {
          id: parseInt(inboundId),
          settings: JSON.stringify({ clients: [clientSettings] }),
        };
        await axios.post(ADD_CLIENT_URL, payload, { headers: { Cookie: cookies } });
        clientLink = generateV2rayConfigLink(inboundId, clientSettings);
        
        // Update the existing plan details in the user's profile
        const planIndex = users[userIndex].activePlans.findIndex(
          (p) => p.v2rayUsername.toLowerCase() === finalUsername.toLowerCase()
        );
        if (planIndex !== -1) {
          users[userIndex].activePlans[planIndex].activatedAt = new Date().toISOString();
          users[userIndex].activePlans[planIndex].v2rayLink = clientLink; // UUID changes, so link must be updated
          users[userIndex].activePlans[planIndex].orderId = order.id; // Update with the new order ID
        }
      // ===================== NEW USER LOGIC ======================
      } else { 
        // Check if the username already exists
        let clientInPanel = await findV2rayClient(finalUsername);
        if (clientInPanel) {
          let counter = 1;
          let newUsername = `${order.username}-${counter}`;
          while (await findV2rayClient(newUsername)) {
            counter++;
            newUsername = `${order.username}-${counter}`;
          }
          finalUsername = newUsername;
        }

        // Create a new client
        const clientSettings = { id: uuidv4(), email: finalUsername, ...newSettings };
        const payload = {
          id: parseInt(inboundId),
          settings: JSON.stringify({ clients: [clientSettings] }),
        };
        await axios.post(ADD_CLIENT_URL, payload, { headers: { Cookie: cookies } });
        clientLink = generateV2rayConfigLink(inboundId, clientSettings);
        
        // Add the new plan to the user's profile
        if (!users[userIndex].activePlans) users[userIndex].activePlans = [];
        users[userIndex].activePlans.push({
          v2rayUsername: finalUsername,
          v2rayLink: clientLink,
          planId: order.planId,
          connId: order.connId,
          activatedAt: new Date().toISOString(),
          orderId: order.id,
        });
      }

      // Update databases and send email (common for both new and renewal)
      orders[orderIndex].status = "approved";
      orders[orderIndex].finalUsername = finalUsername;
      orders[orderIndex].approvedAt = new Date().toISOString();
      writeDb(USERS_DB_PATH, users);
      writeDb(ORDERS_DB_PATH, orders);
      
      const websiteUser = users.find(
        (u) => u.username.toLowerCase() === order.websiteUsername.toLowerCase()
      );
      if (websiteUser && websiteUser.email) {
        const mailOptions = {
          from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`,
          to: websiteUser.email,
          subject: `Your NexGuard Plan is ${order.isRenewal ? 'Renewed' : 'Activated'}!`,
          html: generateEmailTemplate(
            `Plan ${order.isRenewal ? 'Renewed' : 'Activated'}!`,
            `Your ${order.planId} plan is ready.`,
            generateApprovalEmailContent(
              websiteUser.username,
              order.planId,
              finalUsername
            )
          ),
        };
  transporter.sendMail(mailOptions)
        .then(() => {
          console.log(`✅ Approval email sent successfully to ${websiteUser.email}`);
        })
        .catch((error) => {
          console.error(`❌ FAILED to send approval email to ${websiteUser.email}:`, error);
        });
    }
    res.json({
        success: true,
        message: `Order for ${finalUsername} processed successfully.`,
        username: finalUsername,
        v2rayLink: clientLink,
      });
    } catch (error) {
      console.error("Error during order approval:", error.message, error.stack);
      res.status(500).json({
        success: false,
        message: error.message || "An error occurred.",
      });
    }
  }
);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// ---------------------------------------------------
// ---------------------------------------------------

module.exports = app;
