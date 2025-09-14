// =======================================================================
// NexGuard AI - V2Ray Usage Matrix Backend - Supabase Migration
// Version: 37.0 (Full Supabase Integration)
// =======================================================================

const express = require("express");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const cron = require("node-cron");
require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;

// =======================================================================
// SUPABASE CONFIGURATION & INITIALIZATION
// =======================================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Express middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// =======================================================================
// ENVIRONMENT VARIABLES & GLOBAL CONFIGURATION
// =======================================================================
const PANEL_URL = process.env.PANEL_URL;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = "https://app.nexguardlk.store";
const LOGO_URL = process.env.LOGO_PUBLIC_URL || `${FRONTEND_URL}/assets/logo.png`;

// Temporary storage for OTP and password reset tokens (these will remain in memory)
let tempUsers = {};
let passwordResetTokens = {};

// Plan and Inbound configuration
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

// =======================================================================
// CRON JOB FOR OLD RECEIPT CLEANUP (SUPABASE VERSION)
// =======================================================================
cron.schedule("5 0 * * *", async () => {
  console.log("Running daily task: Deleting old receipts...");
  
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

  try {
    // Find orders older than 5 days that are approved and have receipt paths
    const { data: oldOrders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'approved')
      .lt('approved_at', fiveDaysAgo.toISOString())
      .not('receipt_path', 'is', null);

    if (error) {
      console.error("Error fetching old orders:", error);
      return;
    }

    if (!oldOrders || oldOrders.length === 0) {
      console.log("No old receipts to delete.");
      return;
    }

    console.log(`Found ${oldOrders.length} old receipts to delete.`);

    // Delete each receipt file and update database
    for (const order of oldOrders) {
      const receiptPath = order.receipt_path;
      const fullPath = path.join(__dirname, "..", receiptPath);

      // Delete file from server
      if (fs.existsSync(fullPath)) {
        fs.unlink(fullPath, async (err) => {
          if (err) {
            console.error(`Error deleting file ${fullPath}:`, err);
          } else {
            console.log(`Successfully deleted receipt: ${fullPath}`);
            
            // Update database to remove receipt path
            await supabase
              .from('orders')
              .update({ receipt_path: null })
              .eq('id', order.id);
          }
        });
      } else {
        console.warn(`File not found, updating DB anyway: ${fullPath}`);
        // Update database even if file doesn't exist
        await supabase
          .from('orders')
          .update({ receipt_path: null })
          .eq('id', order.id);
      }
    }
  } catch (error) {
    console.error("Error during old receipt cleanup task:", error);
  }
});

// =======================================================================
// MULTER CONFIGURATION FOR FILE UPLOADS
// =======================================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = file.fieldname === "receipt" ? "uploads/receipts/" : "public/uploads/";
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

// =======================================================================
// EMAIL TRANSPORTER SETUP (ZOHO)
// =======================================================================
const transporter = nodemailer.createTransporter({
  host: process.env.ZOHO_HOST,
  port: parseInt(process.env.ZOHO_PORT, 10),
  secure: true,
  auth: {
    user: process.env.ZOHO_USER,
    pass: process.env.ZOHO_PASS,
  },
});

// =======================================================================
// V2RAY PANEL AUTHENTICATION & API FUNCTIONS
// =======================================================================
let cookies = "";
const LOGIN_URL = `${PANEL_URL}/login`;
const ADD_CLIENT_URL = `${PANEL_URL}/panel/api/inbounds/addClient`;
const DEL_CLIENT_BY_UUID_URL = (inboundId, uuid) =>
  `${PANEL_URL}/panel/api/inbounds/${inboundId}/delClient/${uuid}`;
const INBOUNDS_LIST_URL = `${PANEL_URL}/panel/api/inbounds/list`;

// V2Ray Panel Login Function
async function loginToPanel() {
  if (cookies) return true;

  console.log(`\n[Panel Login] Attempting to login to panel at: ${LOGIN_URL}`);

  try {
    const response = await axios.post(
      LOGIN_URL,
      { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 500,
      }
    );

    if ((response.status === 200 || response.status === 302) && response.headers["set-cookie"]) {
      cookies = response.headers["set-cookie"][0];
      console.log("✅ [Panel Login] Successfully logged into V2Ray panel and received session cookie.");
      return true;
    } else if (response.status === 401 || response.status === 403) {
      console.error(`❌ [Panel Login] FAILED. Status Code: ${response.status}. LIKELY CAUSE: Incorrect ADMIN_USERNAME or ADMIN_PASSWORD in your .env file.`);
      return false;
    } else {
      console.error(`❌ [Panel Login] FAILED. Received an unexpected status code: ${response.status}. No cookie was set.`);
      console.error("[Panel Login] Response Data:", response.data);
      return false;
    }
  } catch (error) {
    cookies = "";
    console.error("\n❌ V2Ray panel login FAILED due to a network or configuration error:");
    if (error.request) {
      console.error(`  ➡️ LIKELY CAUSE: The PANEL_URL ('${PANEL_URL}') is incorrect, the panel is offline, or a firewall is blocking the connection.`);
    } else {
      console.error("[Error Detail] Error setting up the request:", error.message);
    }
    console.log("\n");
    return false;
  }
}

// Function to find V2Ray client in panel
async function findV2rayClient(username) {
  if (typeof username !== "string" || !username) {
    return null;
  }
  if (!(await loginToPanel())) throw new Error("Panel authentication failed");
  
  try {
    let clientSettings = null, clientInbound = null, clientInboundId = null;
    const { data: inboundsData } = await axios.get(INBOUNDS_LIST_URL, {
      headers: { Cookie: cookies },
    });
    
    if (inboundsData?.success) {
      const lowerCaseUsername = username.toLowerCase();
      for (const inbound of inboundsData.obj) {
        const clients = (inbound.settings && JSON.parse(inbound.settings).clients) || [];
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

// Generate V2Ray configuration link
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
  
  if (numericInboundId === configIds.dialog) templateKey = "VLESS_TEMPLATE_DIALOG";
  else if (numericInboundId === configIds.hutch) templateKey = "VLESS_TEMPLATE_HUTCH";
  else if (numericInboundId === configIds.slt_zoom) templateKey = "VLESS_TEMPLATE_SLT_ZOOM";
  else if (numericInboundId === configIds.slt_netflix) templateKey = "VLESS_TEMPLATE_SLT_NETFLIX";
  else if (numericInboundId === configIds.dialog_sim) templateKey = "VLESS_TEMPLATE_DIALOG_SIM";
  else {
    console.error(`No VLESS template found for inbound ID: ${numericInboundId}`);
    return null;
  }
  
  const linkTemplate = process.env[templateKey];
  if (!linkTemplate) {
    console.error(`Environment variable for template key "${templateKey}" is not defined.`);
    return null;
  }
  
  return linkTemplate.replace("{uuid}", uuid).replace("{remark}", remark);
}

// =======================================================================
// EMAIL TEMPLATE FUNCTIONS
// =======================================================================
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

// =======================================================================
// AUTHENTICATION MIDDLEWARE
// =======================================================================
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

// =======================================================================
// STATIC FILE SERVING
// =======================================================================
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/admin-login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-login.html"));
});

// =======================================================================
// USER AUTHENTICATION APIs (SUPABASE INTEGRATION)
// =======================================================================

// User Registration with OTP (Supabase)
app.post("/api/auth/register", async (req, res) => {
  const { username, email, whatsapp, password } = req.body;
  if (!username || !email || !whatsapp || !password)
    return res
      .status(400)
      .json({ success: false, message: "All fields are required." });

  try {
    // Check if username or email already exists in Supabase
    const { data: existingUsers, error: checkError } = await supabase
      .from("users")
      .select("username, email")
      .or(`username.eq.${username},email.eq.${email}`);

    if (checkError) {
      console.error("Supabase check error:", checkError);
      throw checkError;
    }

    if (existingUsers && existingUsers.length > 0) {
      return res
        .status(409)
        .json({
          success: false,
          message: "Username or email is already taken.",
        });
    }

    // Generate OTP and store temporarily
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedPassword = bcrypt.hashSync(password, 10);
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    tempUsers[email] = {
      id: uuidv4(),
      username,
      email,
      whatsapp,
      password: hashedPassword,
      otp,
      otpExpiry,
    };

    // Send OTP email
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

    transporter.sendMail(mailOptions).then(() => {
      console.log(`OTP sent to ${email} via Zoho: ${otp}`);
      res.status(200).json({
        success: true,
        message: `An OTP has been sent to ${email}. Please verify to complete registration.`,
      });
    });
  } catch (error) {
    console.error("Error in /api/auth/register:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create user account." });
  }
});

// User Login (Supabase)
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  
  try {
    // Find user in Supabase by username (case-insensitive)
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', username);

    if (error) {
      console.error("Supabase login query error:", error);
      throw error;
    }

    const user = users && users.length > 0 ? users[0] : null;

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
        profilePicture: user.profile_picture
          ? user.profile_picture.replace(/\\/g, "/").replace("public/", "")
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
  } catch (error) {
    console.error("Error in login:", error);
    res.status(500).json({ success: false, message: "Login failed due to server error." });
  }
});

// OTP Verification and User Creation (Supabase)
app.post("/api/auth/verify-otp", async (req, res) => {
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

  try {
    // Create new user in Supabase
    const newUser = {
      id: tempUser.id,
      username: tempUser.username,
      email: tempUser.email,
      whatsapp: tempUser.whatsapp,
      password: tempUser.password,
      profile_picture: "public/assets/profilePhoto.jpg",
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('users')
      .insert([newUser])
      .select();

    if (error) {
      console.error("Supabase user creation error:", error);
      throw error;
    }

    // Clean up temporary storage
    delete tempUsers[email];

    // Generate JWT token
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
      profilePicture: newUser.profile_picture,
    };

    res.status(201).json({
      success: true,
      message: "Account verified and created successfully!",
      token,
      user: userPayload,
    });
  } catch (error) {
    console.error("Error creating user in Supabase:", error);
    return res
      .status(500)
      .json({ success: false, message: "Database error during registration." });
  }
});

// Forgot Password (Supabase)
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: "Email address is required." });
  }

  try {
    // Find user by email in Supabase
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', email);

    if (error) {
      console.error("Supabase forgot password query error:", error);
      throw error;
    }

    const user = users && users.length > 0 ? users[0] : null;

    if (!user) {
      // Security: Don't reveal if user exists or not
      return res.json({
        success: true,
        message: "If an account with this email exists, a password reset link has been sent.",
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

    // Send reset email
    transporter
      .sendMail(mailOptions)
      .then(() => {
        console.log(`✅ Password reset link sent successfully to ${user.email}`);
      })
      .catch((error) => {
        console.error(`❌ FAILED to send password reset email to ${user.email}:`, error);
      });

    res.json({
      success: true,
      message: "If an account with this email exists, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("Error in forgot password:", error);
    res.status(500).json({ success: false, message: "Server error occurred." });
  }
});

// Reset Password (Supabase)
app.post("/api/auth/reset-password", async (req, res) => {
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

  try {
    // Update password in Supabase
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    const { error } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', tokenData.userId);

    if (error) {
      console.error("Supabase password update error:", error);
      throw error;
    }

    delete passwordResetTokens[token];
    res.json({
      success: true,
      message: "Password has been reset successfully. You can now log in.",
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ success: false, message: "Failed to reset password." });
  }
});

// =======================================================================
// V2RAY PANEL INTEGRATION APIs
// =======================================================================

// Check V2Ray Usage
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
      return res
        .status(503)
        .json({
          success: false,
          message: "Session was renewed. Please try your request again.",
        });
    }
    console.error(`Error checking usage for ${username}:`, error.message);
    res
      .status(500)
      .json({ success: false, message: "An internal server error occurred." });
  }
});

// =======================================================================
// ORDER MANAGEMENT APIs (SUPABASE INTEGRATION)
// =======================================================================

// Create Order (Supabase)
app.post("/api/create-order", authenticateToken, upload.single("receipt"), async (req, res) => {
  const { planId, connId, pkg, whatsapp, username, isRenewal } = req.body;
  
  if (!planId || !connId || !whatsapp || !username)
    return res.status(400).json({
      success: false,
      message: "Missing required order information.",
    });

  try {
    const newOrder = {
      id: uuidv4(),
      username: username,
      website_username: req.user.username,
      plan_id: planId,
      conn_id: connId,
      pkg: pkg || null,
      whatsapp,
      receipt_path: req.file ? req.file.path : null,
      status: "pending",
      created_at: new Date().toISOString(),
      is_renewal: isRenewal === "true",
    };

    // Insert order into Supabase
    const { data, error } = await supabase
      .from('orders')
      .insert([newOrder])
      .select();

    if (error) {
      console.error("Supabase order creation error:", error);
      throw error;
    }

    // Send order confirmation email
    try {
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('email, username')
        .ilike('username', req.user.username);

      if (userError) throw userError;

      const websiteUser = users && users.length > 0 ? users[0] : null;

      if (websiteUser && websiteUser.email) {
        const mailOptions = {
          from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`,
          to: websiteUser.email,
          subject: "Your NexGuard Order Has Been Received!",
          html: generateEmailTemplate(
            "Order Received!",
            `Your order for the ${planId} plan is pending approval.`,
            generateOrderPlacedEmailContent(websiteUser.username, planId)
          ),
        };

        transporter
          .sendMail(mailOptions)
          .then(() =>
            console.log(`✅ Order placed confirmation email sent to ${websiteUser.email}`)
          )
          .catch((err) =>
            console.error(`❌ FAILED to send order placed email:`, err)
          );
      }
    } catch (emailError) {
      console.error("Error sending order confirmation email:", emailError);
    }

    res.status(201).json({ 
      success: true, 
      message: "Order submitted successfully!",
      orderId: newOrder.id
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to create order." 
    });
  }
});

// =======================================================================
// USER PROFILE & STATUS APIs (SUPABASE INTEGRATION)
// =======================================================================

// Get User Status with Plan Verification (Supabase)
app.get("/api/user/status", authenticateToken, async (req, res) => {
  try {
    // Get user from Supabase
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id);

    if (userError) {
      console.error("Supabase user fetch error:", userError);
      throw userError;
    }

    if (!users || users.length === 0) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const user = users[0];

    // Check for pending orders
    const { data: orders, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .ilike('website_username', user.username)
      .eq('status', 'pending');

    if (orderError) {
      console.error("Supabase orders fetch error:", orderError);
      throw orderError;
    }

    const pendingOrder = orders && orders.length > 0 ? orders[0] : null;

    // Get active plans from user_plans table
    const { data: activePlans, error: plansError } = await supabase
      .from('user_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (plansError) {
      console.error("Supabase active plans fetch error:", plansError);
      throw plansError;
    }

    if (pendingOrder && (!activePlans || activePlans.length === 0)) {
      return res.json({ success: true, status: "pending" });
    }

    if (!activePlans || activePlans.length === 0) {
      return res.json({ success: true, status: "no_plan" });
    }

    // Verify plans against V2Ray panel
    try {
      const verifiedActivePlans = [];
      console.log(`[Verification] Checking plans for user: ${user.username}`);

      for (const plan of activePlans) {
        const clientExists = await findV2rayClient(plan.v2ray_username);
        if (clientExists) {
          verifiedActivePlans.push({
            v2rayUsername: plan.v2ray_username,
            v2rayLink: plan.v2ray_link,
            planId: plan.plan_id,
            connId: plan.conn_id,
            activatedAt: plan.activated_at,
            orderId: plan.order_id,
          });
        } else {
          console.log(`[Verification] Plan '${plan.v2ray_username}' not found in panel. Deactivating.`);
          // Deactivate plan in database
          await supabase
            .from('user_plans')
            .update({ is_active: false })
            .eq('id', plan.id);
        }
      }

      if (verifiedActivePlans.length === 0) {
        return res.json({ success: true, status: "no_plan" });
      }

      return res.json({
        success: true,
        status: "approved",
        activePlans: verifiedActivePlans,
      });
    } catch (panelError) {
      console.warn(`[Verification Warning] Could not connect to V2Ray panel for user ${user.username}. Returning existing plans. Error: ${panelError.message}`);
      
      const formattedPlans = activePlans.map(plan => ({
        v2rayUsername: plan.v2ray_username,
        v2rayLink: plan.v2ray_link,
        planId: plan.plan_id,
        connId: plan.conn_id,
        activatedAt: plan.activated_at,
        orderId: plan.order_id,
      }));

      return res.json({
        success: true,
        status: "approved",
        activePlans: formattedPlans,
      });
    }
  } catch (error) {
    console.error("Error in user status:", error);
    res.status(500).json({ success: false, message: "Failed to get user status." });
  }
});

// Get User Orders (Supabase)
app.get("/api/user/orders", authenticateToken, async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .ilike('website_username', req.user.username)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Supabase user orders fetch error:", error);
      throw error;
    }

    // Convert snake_case to camelCase for frontend compatibility
    const formattedOrders = orders.map(order => ({
      id: order.id,
      username: order.username,
      websiteUsername: order.website_username,
      planId: order.plan_id,
      connId: order.conn_id,
      pkg: order.pkg,
      whatsapp: order.whatsapp,
      receiptPath: order.receipt_path,
      status: order.status,
      createdAt: order.created_at,
      isRenewal: order.is_renewal,
      finalUsername: order.final_username,
      approvedAt: order.approved_at,
    }));

    res.json({ success: true, orders: formattedOrders });
  } catch (error) {
    console.error("Error fetching user orders:", error);
    res.status(500).json({ success: false, message: "Could not retrieve orders." });
  }
});

// Update Profile Picture (Supabase)
app.post("/api/user/profile-picture", authenticateToken, upload.single("avatar"), async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No file was uploaded." });
  }

  try {
    // Get current user to find old profile picture
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('profile_picture')
      .eq('id', req.user.id);

    if (fetchError) {
      console.error("Supabase fetch user error:", fetchError);
      throw fetchError;
    }

    if (!users || users.length === 0) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const oldPicture = users[0].profile_picture;
    
    // Delete old profile picture if it's not the default
    if (oldPicture && oldPicture !== "public/assets/profilePhoto.jpg") {
      fs.unlink(path.join(__dirname, oldPicture), (err) => {
        if (err) console.error("Could not delete old avatar:", err.message);
      });
    }

    const filePath = req.file.path.replace(/\\/g, "/");

    // Update profile picture in Supabase
    const { error: updateError } = await supabase
      .from('users')
      .update({ profile_picture: filePath })
      .eq('id', req.user.id);

    if (updateError) {
      console.error("Supabase profile picture update error:", updateError);
      throw updateError;
    }

    res.json({
      success: true,
      message: "Profile picture updated.",
      filePath: filePath.replace("public/", ""),
    });
  } catch (error) {
    console.error("Error updating profile picture:", error);
    res.status(500).json({ success: false, message: "Failed to update profile picture." });
  }
});

// Link Existing V2Ray Account (Supabase)
app.post("/api/user/link-v2ray", authenticateToken, async (req, res) => {
  const { v2rayUsername } = req.body;
  if (!v2rayUsername) {
    return res
      .status(400)
      .json({ success: false, message: "V2Ray username is required." });
  }

  try {
    // Check if V2Ray client exists in panel
    const clientData = await findV2rayClient(v2rayUsername);
    if (!clientData || !clientData.client) {
      return res.status(404).json({
        success: false,
        message: "This V2Ray username was not found in our panel.",
      });
    }

    // Check if this V2Ray username is already linked to any user
    const { data: existingPlans, error: checkError } = await supabase
      .from('user_plans')
      .select('user_id')
      .ilike('v2ray_username', v2rayUsername)
      .eq('is_active', true);

    if (checkError) {
      console.error("Supabase existing plans check error:", checkError);
      throw checkError;
    }

    if (existingPlans && existingPlans.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This V2Ray account is already linked to another website account.",
      });
    }

    // Detect plan and connection type
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

    // Create new user plan in Supabase
    const newPlan = {
      id: uuidv4(),
      user_id: req.user.id,
      v2ray_username: clientData.client.email,
      v2ray_link: generateV2rayConfigLink(clientData.inboundId, clientData.client),
      plan_id: detectedPlanId,
      conn_id: detectedConnId,
      activated_at: new Date().toISOString(),
      order_id: "linked-" + uuidv4(),
      is_active: true,
    };

    const { error: insertError } = await supabase
      .from('user_plans')
      .insert([newPlan]);

    if (insertError) {
      console.error("Supabase user plan creation error:", insertError);
      throw insertError;
    }

    res.json({
      success: true,
      message: "Your V2Ray account has been successfully linked!",
    });
  } catch (error) {
    console.error("Error linking V2Ray account:", error);
    res.status(500).json({ 
      success: false, 
      message: "An internal server error occurred." 
    });
  }
});

// Update User Password (Supabase)
app.post("/api/user/update-password", authenticateToken, async (req, res) => {
  const { newPassword } = req.body;
  
  if (!newPassword || newPassword.length < 6) {
    return res
      .status(400)
      .json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
  }

  try {
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    
    const { error } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', req.user.id);

    if (error) {
      console.error("Supabase password update error:", error);
      throw error;
    }

    res.json({ success: true, message: "Password updated successfully!" });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ success: false, message: "Failed to update password." });
  }
});

// =======================================================================
// ADMIN APIs (SUPABASE INTEGRATION)
// =======================================================================

// Admin Login
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign(
      { username: ADMIN_USERNAME, role: "admin" },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, message: "Invalid credentials" });
  }
});

// Admin Dashboard Data (Supabase)
app.get("/api/admin/dashboard-data", authenticateAdmin, async (req, res) => {
  try {
    // Get all orders
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error("Supabase orders fetch error:", ordersError);
      throw ordersError;
    }

    // Get all users (without passwords)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, email, whatsapp, profile_picture, created_at');

    if (usersError) {
      console.error("Supabase users fetch error:", usersError);
      throw usersError;
    }

    const validOrders = orders || [];
    const validUsers = users || [];

    // Format orders for frontend compatibility
    const formattedOrders = validOrders.map(order => ({
      id: order.id,
      username: order.username,
      websiteUsername: order.website_username,
      planId: order.plan_id,
      connId: order.conn_id,
      pkg: order.pkg,
      whatsapp: order.whatsapp,
      receiptPath: order.receipt_path,
      status: order.status,
      createdAt: order.created_at,
      isRenewal: order.is_renewal,
      finalUsername: order.final_username,
      approvedAt: order.approved_at,
    }));

    const data = {
      stats: {
        pending: validOrders.filter((o) => o.status === "pending").length,
        approved: validOrders.filter((o) => o.status === "approved").length,
        rejected: validOrders.filter((o) => o.status === "rejected").length,
        users: validUsers.length,
      },
      pendingOrders: formattedOrders
        .filter((o) => o.status === "pending")
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
      allOrders: formattedOrders,
      allUsers: validUsers.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        whatsapp: user.whatsapp,
        profilePicture: user.profile_picture,
        createdAt: user.created_at,
      })),
    };
    
    res.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to load dashboard data." 
    });
  }
});

// Get Admin Stats (Supabase)
app.get("/api/admin/stats", authenticateAdmin, async (req, res) => {
  try {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('status');

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id');

    if (ordersError || usersError) {
      throw ordersError || usersError;
    }

    const validOrders = orders || [];
    const validUsers = users || [];

    const stats = {
      pending: validOrders.filter((o) => o.status === "pending").length,
      approved: validOrders.filter((o) => o.status === "approved").length,
      rejected: validOrders.filter((o) => o.status === "rejected").length,
      users: validUsers.length,
    };
    
    res.json(stats);
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    res.status(500).json({ success: false, message: "Failed to fetch stats." });
  }
});

// Get Pending Orders (Supabase)
app.get("/api/admin/orders", authenticateAdmin, async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Supabase pending orders fetch error:", error);
      throw error;
    }

    const formattedOrders = (orders || []).map(order => ({
      id: order.id,
      username: order.username,
      websiteUsername: order.website_username,
      planId: order.plan_id,
      connId: order.conn_id,
      pkg: order.pkg,
      whatsapp: order.whatsapp,
      receiptPath: order.receipt_path,
      status: order.status,
      createdAt: order.created_at,
      isRenewal: order.is_renewal,
    }));

    res.json({ success: true, orders: formattedOrders });
  } catch (error) {
    console.error("Error fetching pending orders:", error);
    res.status(500).json({ success: false, message: "Failed to fetch pending orders." });
  }
});

// Get Order History (Supabase)
app.get("/api/admin/order-history", authenticateAdmin, async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['approved', 'rejected'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Supabase order history fetch error:", error);
      throw error;
    }

    const formattedOrders = (orders || []).map(order => ({
      id: order.id,
      username: order.username,
      websiteUsername: order.website_username,
      planId: order.plan_id,
      connId: order.conn_id,
      pkg: order.pkg,
      whatsapp: order.whatsapp,
      receiptPath: order.receipt_path,
      status: order.status,
      createdAt: order.created_at,
      isRenewal: order.is_renewal,
      finalUsername: order.final_username,
      approvedAt: order.approved_at,
    }));

    res.json(formattedOrders);
  } catch (error) {
    console.error("Error fetching order history:", error);
    res.status(500).json({ success: false, message: "Failed to fetch order history." });
  }
});

// Get All Users (Supabase)
app.get("/api/admin/users", authenticateAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, email, whatsapp, profile_picture, created_at');

    if (error) {
      console.error("Supabase users fetch error:", error);
      throw error;
    }

    const safeUsers = (users || []).map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      whatsapp: user.whatsapp,
      profilePicture: user.profile_picture,
      createdAt: user.created_at,
    }));

    res.json(safeUsers);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users." });
  }
});

// Reject Order (Supabase)
app.post("/api/admin/reject-order/:orderId", authenticateAdmin, async (req, res) => {
  const { orderId } = req.params;
  
  try {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'rejected' })
      .eq('id', orderId);

    if (error) {
      console.error("Supabase order rejection error:", error);
      throw error;
    }

    res.json({ success: true, message: "Order rejected" });
  } catch (error) {
    console.error("Error rejecting order:", error);
    res.status(500).json({ success: false, message: "Failed to reject order." });
  }
});

// Ban User (Delete from website and V2Ray panel) (Supabase)
app.delete("/api/admin/ban-user", authenticateAdmin, async (req, res) => {
  const { userId, v2rayUsername } = req.body;
  
  try {
    // Delete from V2Ray panel if v2rayUsername is provided
    if (v2rayUsername) {
      if (!(await loginToPanel())) {
        throw new Error("Panel authentication failed.");
      }
      
      const clientData = await findV2rayClient(v2rayUsername);
      if (clientData) {
        await axios.post(
          DEL_CLIENT_BY_UUID_URL(clientData.inboundId, clientData.client.id),
          {},
          { headers: { Cookie: cookies } }
        );
      }
    }

    // Deactivate all user plans first
    await supabase
      .from('user_plans')
      .update({ is_active: false })
      .eq('user_id', userId);

    // Delete user from Supabase
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) {
      console.error("Supabase user deletion error:", error);
      throw error;
    }

    res.json({ 
      success: true, 
      message: `User ${userId} has been banned and removed from the system.` 
    });
  } catch (error) {
    console.error("Error banning user:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to ban user." 
    });
  }
});

// Approve Order (Main Admin Function) (Supabase)
app.post("/api/admin/approve-order/:orderId", authenticateAdmin, async (req, res) => {
  const orderId = req.params.orderId;
  
  // Ensure panel login first
  if (!(await loginToPanel())) {
    return res
      .status(500)
      .json({ success: false, message: "Panel authentication failed." });
  }

  try {
    // Get order from Supabase
    const { data: orders, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId);

    if (orderError) {
      console.error("Supabase order fetch error:", orderError);
      throw orderError;
    }

    if (!orders || orders.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found." });
    }

    const order = orders[0];

    // Get user from Supabase
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*')
      .ilike('username', order.website_username);

    if (userError) {
      console.error("Supabase user fetch error:", userError);
      throw userError;
    }

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Website user "${order.website_username}" not found.`,
      });
    }

    const user = users[0];

    // Validate plan and connection configuration
    const plan = planConfig[order.plan_id];
    let inboundId = inboundIdConfig[order.conn_id];
    
    if (["slt_fiber", "slt_router"].includes(order.conn_id)) {
      inboundId = order.pkg?.toLowerCase().includes("netflix")
        ? process.env.INBOUND_ID_SLT_NETFLIX
        : process.env.INBOUND_ID_SLT_ZOOM;
    }

    if (!inboundId || !plan) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan/connection in order.",
      });
    }

    // Common settings for new/renewed clients
    const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    const newSettings = {
      enable: true,
      totalGB: (plan.totalGB || 0) * 1024 * 1024 * 1024,
      expiryTime: expiryTime,
    };

    let clientLink;
    let finalUsername = order.username;

    // ======================= RENEWAL LOGIC =======================
    if (order.is_renewal) {
      console.log(`[Renewal] Processing renewal for: ${order.username}`);
      
      // Find the existing client in the panel
      const clientInPanel = await findV2rayClient(order.username);

      // If client exists, delete it first to reset everything
      if (clientInPanel) {
        inboundId = clientInPanel.inboundId;
        await axios.post(
          DEL_CLIENT_BY_UUID_URL(inboundId, clientInPanel.client.id),
          {},
          { headers: { Cookie: cookies } }
        );
        console.log(`[Renewal] Deleted existing client: ${order.username}`);
      }

      // Re-create the client with the same name but new settings
      const clientSettings = {
        id: uuidv4(),
        email: finalUsername,
        ...newSettings,
      };
      
      const payload = {
        id: parseInt(inboundId),
        settings: JSON.stringify({ clients: [clientSettings] }),
      };
      
      await axios.post(ADD_CLIENT_URL, payload, {
        headers: { Cookie: cookies },
      });
      
      clientLink = generateV2rayConfigLink(inboundId, clientSettings);
      console.log(`[Renewal] Re-created client: ${finalUsername}`);

      // Update existing plan in user_plans table
      const { error: updateError } = await supabase
        .from('user_plans')
        .update({
          v2ray_link: clientLink,
          activated_at: new Date().toISOString(),
          order_id: order.id,
        })
        .eq('user_id', user.id)
        .ilike('v2ray_username', finalUsername);

      if (updateError) {
        console.error("Supabase user plan update error:", updateError);
        throw updateError;
      }

    // ===================== NEW USER LOGIC ======================
    } else {
      console.log(`[New User] Processing new user: ${order.username}`);
      
      // Check if the username already exists in panel
      let clientInPanel = await findV2rayClient(finalUsername);
      if (clientInPanel) {
        let counter = 1;
        let newUsername = `${order.username}-${counter}`;
        while (await findV2rayClient(newUsername)) {
          counter++;
          newUsername = `${order.username}-${counter}`;
        }
        finalUsername = newUsername;
        console.log(`[New User] Username conflict resolved. New username: ${finalUsername}`);
      }

      // Create a new client in V2Ray panel
      const clientSettings = {
        id: uuidv4(),
        email: finalUsername,
        ...newSettings,
      };
      
      const payload = {
        id: parseInt(inboundId),
        settings: JSON.stringify({ clients: [clientSettings] }),
      };
      
      await axios.post(ADD_CLIENT_URL, payload, {
        headers: { Cookie: cookies },
      });
      
      clientLink = generateV2rayConfigLink(inboundId, clientSettings);
      console.log(`[New User] Created new client: ${finalUsername}`);

      // Add the new plan to user_plans table
      const newPlan = {
        id: uuidv4(),
        user_id: user.id,
        v2ray_username: finalUsername,
        v2ray_link: clientLink,
        plan_id: order.plan_id,
        conn_id: order.conn_id,
        activated_at: new Date().toISOString(),
        order_id: order.id,
        is_active: true,
      };

      const { error: planError } = await supabase
        .from('user_plans')
        .insert([newPlan]);

      if (planError) {
        console.error("Supabase user plan creation error:", planError);
        throw planError;
      }
    }

    // Update order status in Supabase
    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({
        status: 'approved',
        final_username: finalUsername,
        approved_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (orderUpdateError) {
      console.error("Supabase order update error:", orderUpdateError);
      throw orderUpdateError;
    }

    // Send approval email
    if (user && user.email) {
      const mailOptions = {
        from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`,
        to: user.email,
        subject: `Your NexGuard Plan is ${order.is_renewal ? "Renewed" : "Activated"}!`,
        html: generateEmailTemplate(
          `Plan ${order.is_renewal ? "Renewed" : "Activated"}!`,
          `Your ${order.plan_id} plan is ready.`,
          generateApprovalEmailContent(user.username, order.plan_id, finalUsername)
        ),
      };

      transporter
        .sendMail(mailOptions)
        .then(() => {
          console.log(`✅ Approval email sent successfully to ${user.email}`);
        })
        .catch((error) => {
          console.error(`❌ FAILED to send approval email to ${user.email}:`, error);
        });
    }

    console.log(`[Success] Order ${orderId} approved for user: ${finalUsername}`);
    
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
      message: error.message || "An error occurred during order approval.",
    });
  }
});

// =======================================================================
// FALLBACK ROUTE FOR SPA (Single Page Application)
// =======================================================================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =======================================================================
// EXPORT MODULE
// =======================================================================
module.exports = app;

