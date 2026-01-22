// File Path: src/controllers/authController.js

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const supabase = require("../config/supabaseClient");
const transporter = require("../config/mailer");
const { generateEmailTemplate, generateOtpEmailContent, generatePasswordResetEmailContent } = require("../services/emailService");

// උපරිම වැරදි උත්සාහයන් ගණන
const MAX_OTP_ATTEMPTS = 5;
// Lock කරන කාලය (විනාඩි 15)
const LOCKOUT_TIME_MS = 15 * 60 * 1000; 

// --- REGISTER CONTROLLER (Fixed with Specific Ban Messages) ---
exports.register = async (req, res) => {
    const { username, email, whatsapp, password } = req.body;
    
    if (!username || !email || !whatsapp || !password)
        return res.status(400).json({ success: false, message: "All fields are required." });

    try {
        // 1. Check if user exists (checking email OR whatsapp OR username)
        const { data: existingUsers, error: findError } = await supabase
            .from("users")
            .select("id, email, whatsapp, username, status, otp_code")
            .or(`email.eq.${email},whatsapp.eq.${whatsapp},username.eq.${username}`);

        if (findError && findError.code !== 'PGRST116') { 
             console.error("DB Check Error:", findError);
        }

        if (existingUsers && existingUsers.length > 0) {
            // Loop through results to find specific match
            for (const user of existingUsers) {
                // --- BAN CHECK LOGIC ---
                if (user.status === 'banned') {
                    if (user.email === email) {
                        return res.status(403).json({ success: false, message: "Your Email Address is Banned." });
                    }
                    if (user.whatsapp === whatsapp) {
                        return res.status(403).json({ success: false, message: "Your Phone Number is Banned." });
                    }
                    if (user.username === username) {
                        return res.status(403).json({ success: false, message: "This Username is Banned." });
                    }
                    // Generic ban message fallback
                    return res.status(403).json({ success: false, message: "This account details are banned." });
                }

                // --- NORMAL DUPLICATE CHECK ---
                // If not banned, but verified (otp_code is null), prevent duplicate
                if (!user.otp_code) {
                    if (user.email === email) return res.status(409).json({ success: false, message: "Email is already registered." });
                    if (user.username === username) return res.status(409).json({ success: false, message: "Username is already taken." });
                }
            }
        }

        // --- PROCEED WITH REGISTRATION ---
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = bcrypt.hashSync(password, 10);
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        const userData = {
            username, 
            email, 
            whatsapp,
            password: hashedPassword,
            otp_code: otp,
            otp_expiry: otpExpiry.toISOString(),
            otp_attempts: 0,
            otp_lockout_until: null,
            profile_picture: "assets/profilePhoto.jpg",
            status: "active",
            active_plans: [],
        };
        
        // Use an existing ID if found (unverified user update), or generate new UUID
        let targetUserId = uuidv4();
        // Try to find if there is a pending verification user to update instead of creating new
        const pendingUser = existingUsers?.find(u => u.otp_code !== null);
        if (pendingUser) targetUserId = pendingUser.id;

        const { error } = await supabase
            .from("users")
            .upsert({ id: targetUserId, ...userData }, { onConflict: 'email' });
        
        if (error) throw error;

        // Send Email logic
        const mailOptions = {
            from: `NexGuard <${process.env.EMAIL_SENDER}>`,
            to: email,
            subject: "Your NexGuard Verification Code",
            html: generateEmailTemplate(
                "Verify Your Email", 
                "Your OTP is inside.", 
                generateOtpEmailContent(username, otp)
            ),
        };

        try {
            await transporter.sendMail(mailOptions);
            res.status(200).json({ success: true, message: `An OTP has been sent to ${email}. Please verify.` });
        } catch (emailError) {
            console.error("Email send failed:", emailError);
            return res.status(500).json({ success: false, message: "Failed to send verification email." });
        }

    } catch (error) {
        console.error("Register Error:", error);
        return res.status(500).json({ success: false, message: "Registration failed due to server error." });
    }
};

exports.verifyOtp = async (req, res) => {
    const { email, otp } = req.body;
    
    try {
        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .single();
        
        if (error || !user) {
            return res.status(400).json({ success: false, message: "Invalid request or user not found." });
        }

        if (user.otp_lockout_until && new Date() < new Date(user.otp_lockout_until)) {
            const waitMinutes = Math.ceil((new Date(user.otp_lockout_until) - new Date()) / 60000);
            return res.status(429).json({ 
                success: false, 
                message: `Too many failed attempts. Please try again in ${waitMinutes} minutes.` 
            });
        }

        if (!user.otp_code || new Date() > new Date(user.otp_expiry)) {
            return res.status(400).json({ success: false, message: "OTP has expired. Please register again." });
        }

        if (user.otp_code !== otp) {
            const newAttempts = (user.otp_attempts || 0) + 1;
            let updateData = { otp_attempts: newAttempts };
            let message = "Invalid OTP code.";

            if (newAttempts >= MAX_OTP_ATTEMPTS) {
                updateData.otp_lockout_until = new Date(Date.now() + LOCKOUT_TIME_MS).toISOString();
                message = "Too many failed attempts. Account locked for 15 minutes.";
            } else {
                message = `Invalid OTP. You have ${MAX_OTP_ATTEMPTS - newAttempts} attempts remaining.`;
            }

            await supabase.from("users").update(updateData).eq("id", user.id);
            return res.status(400).json({ success: false, message: message });
        }

        const { error: updateError } = await supabase
            .from("users")
            .update({ 
                otp_code: null, 
                otp_expiry: null,
                otp_attempts: 0,
                otp_lockout_until: null 
            })
            .eq("id", user.id);

        if (updateError) throw updateError;
        
        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "1d" });
        const userPayload = {
            id: user.id,
            username: user.username,
            email: user.email,
            whatsapp: user.whatsapp,
            profilePicture: user.profile_picture,
        };
        res.status(201).json({ success: true, message: "Account verified successfully!", token, user: userPayload });

    } catch (error) {
        console.error("Error in /api/auth/verify-otp:", error);
        return res.status(500).json({ success: false, message: "Database error during verification." });
    }
};

// --- LOGIN CONTROLLER (Corrected) ---
exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .single();

        if (error || !user) {
            return res.status(401).json({ success: false, message: "Invalid username or password." });
        }

        // Ban Check Logic
        if (user.status === 'banned') {
            return res.status(403).json({ 
                success: false, 
                message: "Your account has been banned. Please contact support." 
            });
        }

        if (bcrypt.compareSync(password, user.password)) {
            const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "1d" });
            const userPayload = {
                id: user.id,
                username: user.username,
                email: user.email,
                whatsapp: user.whatsapp,
                profilePicture: user.profile_picture ? user.profile_picture.replace(/\\/g, "/").replace("public/", "") : "assets/profilePhoto.jpg",
            };
            res.json({ success: true, message: "Logged in successfully!", token, user: userPayload });
        } else {
            res.status(401).json({ success: false, message: "Invalid username or password." });
        }
    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({ success: false, message: "Login failed due to server error." });
    }
};

exports.adminLogin = async (req, res) => {
    const { username, password, rememberMe } = req.body;
    try {
        const { data: adminUser, error } = await supabase
            .from("users")
            .select("*")
            .ilike("username", username)
            .eq("role", "admin")
            .single();

        if (error || !adminUser) {
            return res.status(401).json({ success: false, message: "Invalid credentials or not an admin." });
        }
        const isPasswordValid = bcrypt.compareSync(password, adminUser.password);
        if (isPasswordValid) {
            const expiresIn = rememberMe ? "7d" : "8h";
            const token = jwt.sign({ id: adminUser.id, username: adminUser.username, role: "admin" }, process.env.JWT_SECRET, { expiresIn });
            res.json({ success: true, token });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials." });
        }
    } catch (err) {
        console.error("Admin login error:", err);
        res.status(500).json({ success: false, message: "An internal server error occurred." });
    }
};

exports.resellerLogin = async (req, res) => {
    const { username, password } = req.body;
    try {
        const { data: reseller, error } = await supabase
            .from("users")
            .select("*")
            .ilike("username", username)
            .eq("role", "reseller")
            .single();

        if (error || !reseller) {
            return res.status(401).json({ success: false, message: "Invalid credentials or not a reseller." });
        }
        const isPasswordValid = bcrypt.compareSync(password, reseller.password);
        if (isPasswordValid) {
            const token = jwt.sign({ id: reseller.id, username: reseller.username, role: "reseller" }, process.env.JWT_SECRET, { expiresIn: "8h" });
            res.json({ success: true, token });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials." });
        }
    } catch (err) {
        console.error("Reseller login error:", err);
        res.status(500).json({ success: false, message: "An internal server error occurred." });
    }
};

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    const genericResponse = { message: 'If an account with that email exists, a password reset link has been sent.' };

    try {
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .single();

        if (!user || userError) {
            return res.json(genericResponse);
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const resetExpiry = new Date(Date.now() + 10 * 60 * 1000); 

        const { error: updateError } = await supabase
            .from("users")
            .update({
                password_reset_token: hashedToken,
                password_reset_expires: resetExpiry.toISOString(),
            })
            .eq("id", user.id);

        if (updateError) {
             console.error('Failed to update user record with reset token:', updateError);
             return res.json(genericResponse);
        }

        const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        const mailOptions = {
             from: `NexGuard <${process.env.EMAIL_SENDER}>`,
             to: user.email,
             subject: 'Your Password Reset Link (Valid for 10 mins)',
             html: generateEmailTemplate('Password Reset Request', 'Use the link inside to reset your password.', generatePasswordResetEmailContent(user.username, resetURL)),
        };

        try {
            await transporter.sendMail(mailOptions);
            res.json(genericResponse);
        } catch (emailError) {
            console.error(`FAILED to send password reset email to ${user.email}:`, emailError);
            res.json(genericResponse);
        }

    } catch (error) {
        console.error("Forgot Password Error:", error);
        res.status(500).json({ message: 'Server error occurred during forgot password process.' });
    }
};

exports.resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 6) {
        return res.status(400).json({
            success: false,
            message: "Token is required and password must be at least 6 characters.",
        });
    }

    try {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .eq("password_reset_token", hashedToken)
            .single();

        if (error || !user) {
            return res.status(400).json({ success: false, message: "This reset link is invalid." });
        }

        if (new Date() > new Date(user.password_reset_expires)) {
            return res.status(400).json({ success: false, message: "This reset link has expired." });
        }

        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        
        const { error: updateError } = await supabase
            .from("users")
            .update({ password: hashedPassword, password_reset_token: null, password_reset_expires: null })
            .eq("id", user.id);

        if (updateError) throw updateError;

        res.json({ success: true, message: "Password has been reset successfully." });
    } catch (err) {
        console.error("Password reset error:", err);
        res.status(500).json({ success: false, message: "Error updating password." });
    }
};