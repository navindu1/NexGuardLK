// =======================================================================
// NexGuard AI - V2Ray Usage Matrix Backend
// Version: 36.0 (Supabase Integration)
// =======================================================================

const express = require("express");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const cron = require("node-cron"); // cron job සඳහා
require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;

// --- Supabase Client එක Initialize කිරීම ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// --- Environment & Global Variables ---
const PANEL_URL = process.env.PANEL_URL;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = "https://app.nexguardlk.store";
const LOGO_URL =
  process.env.LOGO_PUBLIC_URL || `${FRONTEND_URL}/assets/logo.png`;

let tempUsers = {};
let passwordResetTokens = {};

// --- Plan & Inbound Configuration ---

// Supabase සමඟ ක්‍රියාත්මක වන පරිදි යාවත්කාලීන කළ Cron Job එක
cron.schedule("5 0 * * *", async () => {
  console.log("Running daily task: Deleting old receipts...");
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

  try {
    // 1. දවස් 5කට වඩා පරණ, approve කරපු orders Supabase වෙතින් ලබාගැනීම
    const { data: oldOrders, error } = await supabase
      .from("orders")
      .select("id, receipt_path")
      .eq("status", "approved")
      .not("receipt_path", "is", null)
      .lte("approved_at", fiveDaysAgo.toISOString());

    if (error) throw error;

    if (!oldOrders || oldOrders.length === 0) {
      console.log("No old receipts to delete.");
      return;
    }

    console.log(`Found ${oldOrders.length} old receipts to delete.`);

    for (const order of oldOrders) {
      const receiptPath = order.receipt_path;
      const fullPath = path.join(process.cwd(), receiptPath);

      // 2. File එක server එකෙන් මකා දැමීම
      if (fs.existsSync(fullPath)) {
        fs.unlink(fullPath, async (err) => {
          if (err) {
            console.error(`Error deleting file ${fullPath}:`, err);
          } else {
            console.log(`Successfully deleted receipt file: ${fullPath}`);
          }
        });
      } else {
        console.warn(`File not found, but proceeding to update DB: ${fullPath}`);
      }

      // 3. Database එකෙන් receipt_path එක ඉවත් කිරීම
      const { error: updateError } = await supabase
        .from("orders")
        .update({ receipt_path: null })
        .eq("id", order.id);

      if (updateError) {
        console.error(`Error updating order ${order.id} in DB:`, updateError);
      }
    }
  } catch (error) {
    console.error("Error during old receipt cleanup task:", error);
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
// පැරණි fs-based readDb, writeDb සහ DB_PATH constants සියල්ල ඉවත් කර ඇත.
// Supabase client එක ඉහතින් initialize කර ඇත.

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
  port: parseInt(process.env.ZOHO_PORT, 10),
  secure: true,
  auth: {
    user: process.env.ZOHO_USER,
    pass: process.env.ZOHO_PASS,
  },
});

// --- V2Ray Panel Logic (වෙනස් වී නැත) ---
let cookies = "";
const LOGIN_URL = `${PANEL_URL}/login`;
const ADD_CLIENT_URL = `${PANEL_URL}/panel/api/inbounds/addClient`;
const DEL_CLIENT_BY_UUID_URL = (inboundId, uuid) =>
  `${PANEL_URL}/panel/api/inbounds/${inboundId}/delClient/${uuid}`;
const INBOUNDS_LIST_URL = `${PANEL_URL}/panel/api/inbounds/list`;

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
    if (
      (response.status === 200 || response.status === 302) &&
      response.headers["set-cookie"]
    ) {
      cookies = response.headers["set-cookie"][0];
      console.log(
        "✅ [Panel Login] Successfully logged into V2Ray panel and received session cookie."
      );
      return true;
    } else if (response.status === 401 || response.status === 403) {
      console.error(
        `❌ [Panel Login] FAILED. Status Code: ${response.status}. LIKELY CAUSE: Incorrect ADMIN_USERNAME or ADMIN_PASSWORD in your .env file.`
      );
      return false;
    } else {
      console.error(
        `❌ [Panel Login] FAILED. Received an unexpected status code: ${response.status}. No cookie was set.`
      );
      console.error("[Panel Login] Response Data:", response.data);
      return false;
    }
  } catch (error) {
    cookies = "";
    console.error(
      "\n❌ V2Ray panel login FAILED due to a network or configuration error:"
    );
    if (error.request) {
      console.error(
        ` ➡️ LIKELY CAUSE: The PANEL_URL ('${PANEL_URL}') is incorrect, the panel is offline, or a firewall is blocking the connection.`
      );
    } else {
      console.error(
        "[Error Detail] Error setting up the request:",
        error.message
      );
    }
    console.log("\n");
    return false;
  }
}

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

// --- Email Templates ---
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


// --- AUTH MIDDLEWARE (වෙනස් වී නැත) ---
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

// --- Static File Routes (වෙනස් වී නැත) ---
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/admin-login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-login.html"));
});

// ===================================================
// --- API Endpoints (Supabase සමඟ යාවත්කාලීන කර ඇත) ---
// ===================================================

app.post("/api/auth/register", async (req, res) => {
  const { username, email, whatsapp, password } = req.body;
  if (!username || !email || !whatsapp || !password)
    return res
      .status(400)
      .json({ success: false, message: "All fields are required." });

  try {
    const { data: existingUsers, error: checkError } = await supabase
      .from("users")
      .select("username, email")
      .or(`username.eq.${username},email.eq.${email}`);

    if (checkError) throw checkError;

    if (existingUsers && existingUsers.length > 0) {
      return res
        .status(409)
        .json({
          success: false,
          message: "Username or email is already taken.",
        });
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
    await transporter.sendMail(mailOptions);
    console.log(`OTP sent to ${email}: ${otp}`);
    res.status(200).json({
      success: true,
      message: `An OTP has been sent to ${email}. Please verify to complete registration.`,
    });
  } catch (error) {
    console.error("Error in /api/auth/register:", error);
    return res
      .status(500)
      .json({ success: false, message: "Database error during registration." });
  }
});

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
    const newUser = {
      id: tempUser.id,
      username: tempUser.username,
      email: tempUser.email,
      whatsapp: tempUser.whatsapp,
      password: tempUser.password,
      profile_picture: "assets/profilePhoto.jpg",
      active_plans: [],
    };

    const { error } = await supabase.from("users").insert([newUser]);
    if (error) throw error;

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
      profilePicture: newUser.profile_picture,
    };
    res.status(201).json({
      success: true,
      message: "Account verified and created successfully!",
      token,
      user: userPayload,
    });
  } catch (error) {
    console.error("Error in /api/auth/verify-otp:", error);
    return res
      .status(500)
      .json({ success: false, message: "Database error during user creation." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .ilike("username", username)
      .single();

    if (error || !user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password." });
    }

    if (bcrypt.compareSync(password, user.password)) {
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
  } catch (err) {
    console.error("Login error:", err);
    res
      .status(500)
      .json({ success: false, message: "An internal server error occurred." });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: "Email address is required." });
  }
  
  const { data: user } = await supabase
    .from("users")
    .select("id, username, email")
    .ilike("email", email)
    .single();

  if (user) {
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
    transporter.sendMail(mailOptions).catch((err) => console.error("Failed to send reset email:", err));
  }

  res.json({
    success: true,
    message: "If an account with this email exists, a password reset link has been sent.",
  });
});

app.post("/api/auth/reset-password", async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 6)
      return res.status(400).json({
        success: false,
        message: "Token is required and password must be at least 6 characters.",
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
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      const { error } = await supabase
        .from("users")
        .update({ password: hashedPassword })
        .eq("id", tokenData.userId);
  
      if (error) throw error;
  
      delete passwordResetTokens[token];
      res.json({
        success: true,
        message: "Password has been reset successfully. You can now log in.",
      });
    } catch (err) {
      console.error("Password reset error:", err);
      res.status(500).json({ success: false, message: "Error updating password." });
    }
});
  
app.get("/api/check-usage/:username", async (req, res) => {
    const username = req.params.username;
    if (!username) {
        return res.status(400).json({ success: false, message: "Username is required." });
    }
    try {
        const clientData = await findV2rayClient(username);
        if (clientData && clientData.client) {
            res.json({ success: true, data: clientData.client });
        } else {
            res.status(404).json({ success: false, message: "User not found in the panel." });
        }
    } catch (error) {
        console.error(`Error checking usage for ${username}:`, error.message);
        res.status(500).json({ success: false, message: "An internal server error occurred." });
    }
});
  
app.post(
    "/api/create-order",
    authenticateToken,
    upload.single("receipt"),
    async (req, res) => {
        const { planId, connId, pkg, whatsapp, username, isRenewal } = req.body;
        if (!planId || !connId || !whatsapp || !username || !req.file)
          return res.status(400).json({
            success: false,
            message: "Missing required order information or receipt file.",
          });
    
        const newOrder = {
          id: uuidv4(),
          username: username,
          website_username: req.user.username,
          plan_id: planId,
          conn_id: connId,
          pkg: pkg || null,
          whatsapp,
          receipt_path: req.file.path.replace(/\\/g, "/"),
          status: "pending",
          is_renewal: isRenewal === "true",
        };
    
        try {
          const { error: orderError } = await supabase.from("orders").insert([newOrder]);
          if (orderError) throw orderError;
    
          const { data: websiteUser } = await supabase
            .from("users")
            .select("email, username")
            .eq("username", req.user.username)
            .single();
    
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
            transporter.sendMail(mailOptions).catch(err => console.error(`FAILED to send order placed email:`, err));
          }
          res.status(201).json({ success: true, message: "Order submitted successfully!" });
        } catch (error) {
          console.error("Error creating order:", error);
          res.status(500).json({ success: false, message: "Failed to create order." });
        }
    }
);
  
app.get("/api/user/status", authenticateToken, async (req, res) => {
    try {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", req.user.id)
        .single();
  
      if (userError || !user) {
        return res.status(404).json({ success: false, message: "User not found." });
      }
  
      const { data: pendingOrders } = await supabase
        .from("orders")
        .select("id", { count: 'exact' })
        .eq("website_username", user.username)
        .eq("status", "pending");
  
      if (pendingOrders.length > 0 && (!user.active_plans || user.active_plans.length === 0)) {
        return res.json({ success: true, status: "pending" });
      }
  
      if (!user.active_plans || user.active_plans.length === 0) {
        return res.json({ success: true, status: "no_plan" });
      }
  
      // Verification logic remains the same
      const verifiedActivePlans = [];
      for (const plan of user.active_plans) {
        const clientExists = await findV2rayClient(plan.v2rayUsername);
        if (clientExists) {
          verifiedActivePlans.push(plan);
        } else {
          console.log(`[Verification] Plan '${plan.v2rayUsername}' not found. Removing.`);
        }
      }
  
      if (verifiedActivePlans.length !== user.active_plans.length) {
        await supabase
          .from("users")
          .update({ active_plans: verifiedActivePlans })
          .eq("id", user.id);
      }
  
      if (verifiedActivePlans.length === 0) {
        return res.json({ success: true, status: "no_plan" });
      }
  
      return res.json({
        success: true,
        status: "approved",
        activePlans: verifiedActivePlans,
      });
    } catch (error) {
      console.warn(`[Status Check Warning] Could not verify plans for user ${req.user.username}. Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "Server error during status check."});
    }
});
  
app.get("/api/user/orders", authenticateToken, async (req, res) => {
    try {
      const { data: userOrders, error } = await supabase
        .from("orders")
        .select("*")
        .eq("website_username", req.user.username)
        .order("created_at", { ascending: false });
  
      if (error) throw error;
  
      res.json({ success: true, orders: userOrders || [] });
    } catch (error) {
      console.error("Error fetching user orders:", error);
      res.status(500).json({ success: false, message: "Could not retrieve orders." });
    }
});
  
app.post(
    "/api/user/profile-picture",
    authenticateToken,
    upload.single("avatar"),
    async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file was uploaded." });
        }
        try {
            const { data: user } = await supabase
              .from("users")
              .select("profile_picture")
              .eq("id", req.user.id)
              .single();
      
            if (user && user.profile_picture && user.profile_picture !== 'assets/profilePhoto.jpg') {
                fs.unlink(path.join(process.cwd(), 'public', user.profile_picture), (err) => {
                    if (err) console.error("Could not delete old avatar:", err.message);
                });
            }
      
            const filePath = `uploads/${req.file.filename}`;
            const { error: updateError } = await supabase
              .from("users")
              .update({ profile_picture: filePath })
              .eq("id", req.user.id);
      
            if (updateError) throw updateError;
      
            res.json({
              success: true,
              message: "Profile picture updated.",
              filePath: filePath,
            });
        } catch (error) {
            console.error("Profile picture update error:", error);
            res.status(500).json({ success: false, message: "Error updating profile picture." });
        }
    }
);
  
app.post("/api/user/link-v2ray", authenticateToken, async (req, res) => {
    const { v2rayUsername } = req.body;
    if (!v2rayUsername) {
        return res.status(400).json({ success: false, message: "V2Ray username is required." });
    }
    try {
        const clientData = await findV2rayClient(v2rayUsername);
        if (!clientData || !clientData.client) {
            return res.status(404).json({
                success: false,
                message: "This V2Ray username was not found in our panel.",
            });
        }

        const { data: existingLink } = await supabase
            .from("users")
            .select("id")
            .contains("active_plans", [{ v2rayUsername: v2rayUsername }]);

        if (existingLink && existingLink.length > 0) {
            return res.status(409).json({
                success: false,
                message: "This V2Ray account is already linked to another website account.",
            });
        }

        const { data: currentUser } = await supabase
            .from("users")
            .select("active_plans")
            .eq("id", req.user.id)
            .single();
            
        let currentPlans = currentUser.active_plans || [];
        // Plan detection logic remains the same
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
            v2rayLink: generateV2rayConfigLink(clientData.inboundId, clientData.client),
            planId: detectedPlanId,
            connId: detectedConnId,
            activatedAt: new Date().toISOString(),
            orderId: "linked-" + uuidv4(),
        };
        currentPlans.push(newPlan);

        await supabase
            .from("users")
            .update({ active_plans: currentPlans })
            .eq("id", req.user.id);

        res.json({
            success: true,
            message: "Your V2Ray account has been successfully linked!",
        });
    } catch (error) {
        console.error("Error linking V2Ray account:", error);
        res.status(500).json({ success: false, message: "An internal server error occurred." });
    }
});

// Admin Login (unchanged)
app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = jwt.sign({ username: ADMIN_USERNAME, role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: "Invalid credentials" });
    }
});

app.get("/api/admin/dashboard-data", authenticateAdmin, async (req, res) => {
    try {
        const ordersPromise = supabase.from("orders").select("*");
        const usersPromise = supabase.from("users").select("*");

        const [{ data: orders, error: oError }, { data: users, error: uError }] = await Promise.all([ordersPromise, usersPromise]);

        if (oError || uError) throw oError || uError;

        const safeUsers = users.map(({ password, ...user }) => user);
        const data = {
            stats: {
                pending: orders.filter((o) => o.status === "pending").length,
                approved: orders.filter((o) => o.status === "approved").length,
                rejected: orders.filter((o) => o.status === "rejected").length,
                users: users.length,
            },
            pendingOrders: orders.filter((o) => o.status === "pending").sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
            allOrders: orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
            allUsers: safeUsers,
        };
        res.json({ success: true, data });
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.status(500).json({ success: false, message: "Failed to load dashboard data." });
    }
});

app.post("/api/user/update-password", authenticateToken, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }
    try {
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        const { error } = await supabase
            .from("users")
            .update({ password: hashedPassword })
            .eq("id", req.user.id);
        if (error) throw error;
        res.json({ success: true, message: "Password updated successfully!" });
    } catch (error) {
        console.error("Password update error:", error);
        res.status(500).json({ success: false, message: "Error updating password." });
    }
});

app.post("/api/admin/reject-order/:orderId", authenticateAdmin, async (req, res) => {
    const { orderId } = req.params;
    try {
        const { error } = await supabase.from("orders").update({ status: "rejected" }).eq("id", orderId);
        if (error) throw error;
        res.json({ success: true, message: "Order rejected" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

app.delete("/api/admin/ban-user", authenticateAdmin, async (req, res) => {
    const { userId, v2rayUsername } = req.body;
    try {
        if (v2rayUsername) {
            // V2Ray panel logic remains
            const clientData = await findV2rayClient(v2rayUsername);
            if (clientData) {
                await axios.post(DEL_CLIENT_BY_UUID_URL(clientData.inboundId, clientData.client.id), {}, { headers: { Cookie: cookies } });
            }
        }
        const { error } = await supabase.from("users").delete().eq("id", userId);
        if (error) throw error;
        res.json({ success: true, message: `User ${userId} has been banned.` });
    } catch (error) {
        console.error("Error banning user:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post("/api/admin/approve-order/:orderId", authenticateAdmin, async (req, res) => {
    const orderId = req.params.orderId;
    if (!(await loginToPanel()))
        return res.status(500).json({ success: false, message: "Panel authentication failed." });

    try {
        const { data: order, error: orderError } = await supabase.from("orders").select("*").eq("id", orderId).single();
        if (orderError || !order) return res.status(404).json({ success: false, message: "Order not found." });

        const { data: websiteUser, error: userError } = await supabase.from("users").select("*").ilike("username", order.website_username).single();
        if (userError || !websiteUser) return res.status(404).json({ success: false, message: `Website user "${order.website_username}" not found.` });

        const plan = planConfig[order.plan_id];
        let inboundId = inboundIdConfig[order.conn_id];
        if (["slt_fiber", "slt_router"].includes(order.conn_id)) {
            inboundId = order.pkg?.toLowerCase().includes("netflix") ? process.env.INBOUND_ID_SLT_NETFLIX : process.env.INBOUND_ID_SLT_ZOOM;
        }
        if (!inboundId || !plan) return res.status(400).json({ success: false, message: "Invalid plan/connection in order." });

        const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;
        const newSettings = { enable: true, totalGB: (plan.totalGB || 0) * 1024 * 1024 * 1024, expiryTime };
        let clientLink, finalUsername = order.username;
        let updatedActivePlans = websiteUser.active_plans || [];

        if (order.is_renewal) {
            const clientInPanel = await findV2rayClient(order.username);
            if (clientInPanel) {
                inboundId = clientInPanel.inboundId;
                await axios.post(DEL_CLIENT_BY_UUID_URL(inboundId, clientInPanel.client.id), {}, { headers: { Cookie: cookies } });
            }
            const clientSettings = { id: uuidv4(), email: finalUsername, ...newSettings };
            const payload = { id: parseInt(inboundId), settings: JSON.stringify({ clients: [clientSettings] }) };
            await axios.post(ADD_CLIENT_URL, payload, { headers: { Cookie: cookies } });
            clientLink = generateV2rayConfigLink(inboundId, clientSettings);

            const planIndex = updatedActivePlans.findIndex(p => p.v2rayUsername.toLowerCase() === finalUsername.toLowerCase());
            if (planIndex !== -1) {
                updatedActivePlans[planIndex].activatedAt = new Date().toISOString();
                updatedActivePlans[planIndex].v2rayLink = clientLink;
                updatedActivePlans[planIndex].orderId = order.id;
            }
        } else {
            let clientInPanel = await findV2rayClient(finalUsername);
            if (clientInPanel) {
                let counter = 1, newUsername;
                do { newUsername = `${order.username}-${counter++}`; }
                while (await findV2rayClient(newUsername));
                finalUsername = newUsername;
            }
            const clientSettings = { id: uuidv4(), email: finalUsername, ...newSettings };
            const payload = { id: parseInt(inboundId), settings: JSON.stringify({ clients: [clientSettings] }) };
            await axios.post(ADD_CLIENT_URL, payload, { headers: { Cookie: cookies } });
            clientLink = generateV2rayConfigLink(inboundId, clientSettings);
            updatedActivePlans.push({
                v2rayUsername: finalUsername,
                v2rayLink: clientLink,
                planId: order.plan_id,
                connId: order.conn_id,
                activatedAt: new Date().toISOString(),
                orderId: order.id,
            });
        }

        await Promise.all([
            supabase.from("users").update({ active_plans: updatedActivePlans }).eq("id", websiteUser.id),
            supabase.from("orders").update({ status: "approved", final_username: finalUsername, approved_at: new Date().toISOString() }).eq("id", orderId)
        ]);
        
              if (websiteUser && websiteUser.email) {
        const mailOptions = {
          from: `NexGuard Orders <${process.env.EMAIL_SENDER}>`,
          to: websiteUser.email,
          subject: `Your NexGuard Plan is ${
            order.isRenewal ? "Renewed" : "Activated"
          }!`,
          html: generateEmailTemplate(
            `Plan ${order.isRenewal ? "Renewed" : "Activated"}!`,
            `Your ${order.planId} plan is ready.`,
            generateApprovalEmailContent(
              websiteUser.username,
              order.planId,
              finalUsername
            )
          ),
        };
        transporter
          .sendMail(mailOptions)
          .then(() => {
            console.log(
              `✅ Approval email sent successfully to ${websiteUser.email}`
            );
          })
          .catch((error) => {
            console.error(
              `❌ FAILED to send approval email to ${websiteUser.email}:`,
              error
            );
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

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
// ---------------------------------------------------
// ---------------------------------------------------

module.exports = app;