// File Path: src/controllers/authController.js

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const supabase = require("../config/supabaseClient");
const transporter = require("../config/mailer");
const { generateEmailTemplate, generateOtpEmailContent, generatePasswordResetEmailContent } = require("../services/emailService");

const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 15 * 60 * 1000; 

exports.register = async (req, res) => {
    const { username, email, whatsapp, password } = req.body;
    
    if (!username || !email || !whatsapp || !password)
        return res.status(400).json({ success: false, message: "All fields are required." });

    if (whatsapp === "94" || whatsapp.length !== 11) {
        return res.status(400).json({ success: false, message: "A valid 11-digit WhatsApp number (e.g., 947XXXXXXXX) is strictly required." });
    }

    try {
        const { data: existingUsers, error: findError } = await supabase
            .from("users")
            .select("id, email, whatsapp, username, status, otp_code")
            .or(`email.eq.${email},whatsapp.eq.${whatsapp},username.eq.${username}`);

        if (findError && findError.code !== 'PGRST116') { 
             console.error("DB Check Error:", findError);
        }

        if (existingUsers && existingUsers.length > 0) {
            for (const user of existingUsers) {
                if (user.status === 'banned') {
                    if (user.email === email) return res.status(403).json({ success: false, message: "Your Email Address is Banned by Admin." });
                    if (user.whatsapp === whatsapp) return res.status(403).json({ success: false, message: "Your Phone Number is Banned by Admin." });
                    if (user.username === username) return res.status(403).json({ success: false, message: "This Username is Banned by Admin." });
                    return res.status(403).json({ success: false, message: "This account has been banned by Admin." });
                }
                if (!user.otp_code) {
                    if (user.email === email) return res.status(409).json({ success: false, message: "Email is already registered." });
                    if (user.username === username) return res.status(409).json({ success: false, message: "Username is already taken." });
                }
            }
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = bcrypt.hashSync(password, 10);
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); 

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
        
        let targetUserId = uuidv4();
        const unverifiedUser = existingUsers?.find(u => u.email === email && u.otp_code !== null);
        if (unverifiedUser) targetUserId = unverifiedUser.id;

        const { error } = await supabase
            .from("users")
            .upsert({ id: targetUserId, ...userData }, { onConflict: 'email' });
        
        if (error) throw error;

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
            return res.status(429).json({ success: false, message: `Too many failed attempts. Try again in ${waitMinutes} mins.` });
        }

        if (!user.otp_code || new Date() > new Date(user.otp_expiry)) {
            return res.status(400).json({ success: false, message: "OTP has expired. Please register again." });
        }

        if (user.otp_code !== otp) {
            const newAttempts = (user.otp_attempts || 0) + 1;
            let updateData = { otp_attempts: newAttempts };
            if (newAttempts >= MAX_OTP_ATTEMPTS) {
                updateData.otp_lockout_until = new Date(Date.now() + LOCKOUT_TIME_MS).toISOString();
                message = "Too many failed attempts. Account locked for 15 minutes.";
            } else {
                message = `Invalid OTP. You have ${MAX_OTP_ATTEMPTS - newAttempts} attempts remaining.`;
            }
            await supabase.from("users").update(updateData).eq("id", user.id);
            return res.status(400).json({ success: false, message });
        }

        await supabase.from("users").update({ otp_code: null, otp_expiry: null, otp_attempts: 0, otp_lockout_until: null }).eq("id", user.id);
        
        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "1d" });
        res.status(201).json({ 
            success: true, 
            message: "Account Verified Successfully!",
            token, 
            user: { id: user.id, username: user.username, email: user.email, whatsapp: user.whatsapp, profilePicture: user.profile_picture } 
        });

    } catch (error) {
        console.error("Verify OTP Error:", error);
        return res.status(500).json({ success: false, message: "Verification failed." });
    }
};

exports.login = async (req, res) => {
    const { email: loginInput, password } = req.body;

    try {
        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .or(`email.eq.${loginInput},username.eq.${loginInput}`)
            .single();

        if (error || !user) {
            return res.status(401).json({ success: false, message: "Invalid username/email or password." });
        }

        if (user.status === 'banned') {
            return res.status(403).json({ success: false, message: "Your account has been banned. Please contact support." });
        }

        const isMatch = bcrypt.compareSync(password, user.password);
        if (isMatch) {
            const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "1d" });
            const userPayload = {
                id: user.id,
                username: user.username,
                email: user.email,
                whatsapp: user.whatsapp,
                profilePicture: user.profile_picture ? user.profile_picture.replace(/\\/g, "/").replace("public/", "") : "assets/profilePhoto.jpg",
            };
            return res.json({ success: true, message: "Logged in successfully!", token, user: userPayload });
        } else {
            return res.status(401).json({ success: false, message: "Invalid username/email or password." });
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

        if (error || !adminUser) return res.status(401).json({ success: false, message: "Invalid credentials." });

        if (bcrypt.compareSync(password, adminUser.password)) {
            const token = jwt.sign({ id: adminUser.id, username: adminUser.username, role: "admin" }, process.env.JWT_SECRET, { expiresIn: rememberMe ? "7d" : "8h" });
            res.json({ success: true, token });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials." });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
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

        if (error || !reseller) return res.status(401).json({ success: false, message: "Invalid credentials." });

        if (bcrypt.compareSync(password, reseller.password)) {
            const token = jwt.sign({ id: reseller.id, username: reseller.username, role: "reseller" }, process.env.JWT_SECRET, { expiresIn: "8h" });
            res.json({ success: true, token });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials." });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
};

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    const genericResponse = { message: 'If an account exists, a reset link has been sent.' };

    try {
        const { data: user, error } = await supabase.from("users").select("*").eq("email", email).single();
        if (!user || error) return res.json(genericResponse);

        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const resetExpiry = new Date(Date.now() + 10 * 60 * 1000); 

        await supabase.from("users").update({ password_reset_token: hashedToken, password_reset_expires: resetExpiry.toISOString() }).eq("id", user.id);

        const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        const mailOptions = {
             from: `NexGuard <${process.env.EMAIL_SENDER}>`,
             to: user.email,
             subject: 'Password Reset Link',
             html: generateEmailTemplate('Reset Request', 'Link inside.', generatePasswordResetEmailContent(user.username, resetURL)),
        };

        await transporter.sendMail(mailOptions);
        res.json(genericResponse);
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 6) return res.status(400).json({ success: false, message: "Invalid data." });

    try {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const { data: user, error } = await supabase.from("users").select("*").eq("password_reset_token", hashedToken).single();

        if (error || !user || new Date() > new Date(user.password_reset_expires)) {
            return res.status(400).json({ success: false, message: "Link invalid or expired." });
        }

        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        await supabase.from("users").update({ password: hashedPassword, password_reset_token: null, password_reset_expires: null }).eq("id", user.id);

        res.json({ success: true, message: "Password reset successful." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
};

// --- GOOGLE LOGIN CONTROLLER ---
exports.googleLogin = async (req, res) => {
    const { credential } = req.body; 

    if (!credential) {
        return res.status(400).json({ success: false, message: "Google token is missing." });
    }

    try {
        if (!process.env.GOOGLE_CLIENT_ID) {
            throw new Error("GOOGLE_CLIENT_ID is not defined in server environment.");
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        
        const payload = ticket.getPayload();
        const email = payload['email'];
        const username = payload['name'] || email.split('@')[0];
        const profilePicture = payload['picture'];

        const { data: user, error: findError } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .single();

        let finalUser = user;

        if (!user) {
            const randomPassword = crypto.randomBytes(16).toString('hex');
            const hashedPassword = bcrypt.hashSync(randomPassword, 10);

            const newUserData = {
                id: uuidv4(), 
                username: username.replace(/\s+/g, '_') + Math.floor(Math.random() * 1000), 
                email: email,
                whatsapp: "94000000000", 
                password: hashedPassword,
                status: "active",
                profile_picture: profilePicture,
                otp_code: null,
                otp_expiry: null,
                otp_attempts: 0,
                otp_lockout_until: null,
                active_plans: [] 
            };

            const { data: newUser, error: createError } = await supabase
                .from("users")
                .insert([newUserData])
                .select()
                .single();

            if (createError) {
                console.error("Google Auth DB Create Error:", createError);
                return res.status(500).json({ success: false, message: "Database creation failed: " + createError.message });
            }
            finalUser = newUser;
        } else if (user.status === 'banned') {
            return res.status(403).json({ success: false, message: "Your account has been banned." });
        }

        const token = jwt.sign({ id: finalUser.id, username: finalUser.username }, process.env.JWT_SECRET, { expiresIn: "1d" });
        
        const userPayload = {
            id: finalUser.id,
            username: finalUser.username,
            email: finalUser.email,
            whatsapp: finalUser.whatsapp,
            profilePicture: finalUser.profile_picture || "assets/profilePhoto.jpg",
        };

        return res.json({ success: true, message: "Logged in successfully with Google!", token, user: userPayload });

    } catch (error) {
        console.error("Google Login Catch Error:", error);
        return res.status(500).json({ success: false, message: "Server Error: " + (error.message || "Unknown error") });
    }
};

// --- UPDATE WHATSAPP AND USERNAME FOR GOOGLE USERS ---
exports.updateWhatsapp = async (req, res) => {
    const { email, whatsapp, username } = req.body;

    if (!email || !whatsapp || whatsapp === "94" || whatsapp.length !== 11) {
        return res.status(400).json({ success: false, message: "A valid 11-digit WhatsApp number is required." });
    }
    if (!username || username.trim() === "") {
        return res.status(400).json({ success: false, message: "A valid username is required." });
    }

    try {
        const { data: existingUser } = await supabase
            .from("users")
            .select("id")
            .ilike("username", username)
            .neq("email", email)
            .single();

        if (existingUser) {
            return res.status(400).json({ success: false, message: "This username is already taken. Please try checking a new one." });
        }

        const { data: updatedUser, error } = await supabase
            .from("users")
            .update({ whatsapp: whatsapp, username: username })
            .eq("email", email)
            .select()
            .single(); 

        if (error) {
            console.error("Update Profile Error:", error);
            return res.status(500).json({ success: false, message: "Database error while updating profile." });
        }

        const token = jwt.sign({ id: updatedUser.id, username: updatedUser.username }, process.env.JWT_SECRET, { expiresIn: "1d" });
        
        const userPayload = {
            id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email,
            whatsapp: updatedUser.whatsapp,
            profilePicture: updatedUser.profile_picture || "assets/profilePhoto.jpg",
        };

        res.json({ success: true, message: "Profile updated successfully!", token, user: userPayload });
    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).json({ success: false, message: "Server error." });
    }
};

// --- අලුත් WEBSITE USERNAME CHECK CONTROLLER ---
exports.checkWebsiteUsername = async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "Username is required" });
    
    try {
        const { data: existingUser } = await supabase
            .from("users")
            .select("id")
            .ilike("username", username)
            .single();
        
        if (existingUser) {
            const randomNum = Math.floor(Math.random() * 9000) + 1000;
            const suggestion = `${username}${randomNum}`;
            return res.json({ available: false, suggestion: suggestion });
        }
        return res.json({ available: true });
    } catch (error) {
        console.error("Error checking website username:", error.message);
        return res.status(500).json({ error: "Database Error." });
    }
};