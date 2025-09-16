// File Path: src/controllers/authController.js

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const supabase = require("../config/supabaseClient");
const transporter = require("../config/mailer");
const { generateEmailTemplate, generateOtpEmailContent, generatePasswordResetEmailContent } = require("../services/emailService");

exports.register = async (req, res) => {
    const { username, email, whatsapp, password } = req.body;
    if (!username || !email || !whatsapp || !password)
        return res.status(400).json({ success: false, message: "All fields are required." });

    try {
        const { data: existingUser } = await supabase
            .from("users")
            .select("id, otp_code")
            .or(`username.eq.${username},email.eq.${email}`)
            .single();

        if (existingUser && !existingUser.otp_code) {
            return res.status(409).json({ success: false, message: "Username or email is already taken." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = bcrypt.hashSync(password, 10);
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        const userData = {
            username,
            email,
            whatsapp,
            password: hashedPassword,
            otp_code: otp,
            otp_expiry: otpExpiry.toISOString(),
            profile_picture: "assets/profilePhoto.jpg",
            active_plans: [],
        };
        
        const { error } = await supabase.from("users").upsert({ id: existingUser?.id || uuidv4(), ...userData }, { onConflict: 'email' });
        if (error) throw error;

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
        return res.status(500).json({ success: false, message: "Database error during registration." });
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
        
        if (error || !user || !user.otp_code) {
            return res.status(400).json({ success: false, message: "Invalid request or user not found." });
        }

        if (new Date() > new Date(user.otp_expiry)) {
            return res.status(400).json({ success: false, message: "OTP has expired. Please register again." });
        }

        if (user.otp_code !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP." });
        }

        const { error: updateError } = await supabase
            .from("users")
            .update({ otp_code: null, otp_expiry: null })
            .eq("id", user.id);

        if (updateError) throw updateError;
        
        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "1d" });
        
        // ===== FIX START: 'newUser' changed to 'user' =====
        const userPayload = {
            id: user.id,
            username: user.username,
            email: user.email,
            whatsapp: user.whatsapp,
            profilePicture: user.profile_picture,
        };
        // ===== FIX END =====

        res.status(201).json({ success: true, message: "Account verified successfully!", token, user: userPayload });
    } catch (error) {
        console.error("Error in /api/auth/verify-otp:", error);
        return res.status(500).json({ success: false, message: "Database error during verification." });
    }
};

exports.login = async (req, res) => {
    const { username, password } = req.body;
    try {
        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .ilike("username", username)
            .single();

        if (error || !user) {
            return res.status(401).json({ success: false, message: "Invalid username or password." });
        }

        if (bcrypt.compareSync(password, user.password)) {
            const token = jwt.sign(
                { id: user.id, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: "1d" }
            );
            const userPayload = {
                id: user.id,
                username: user.username,
                email: user.email,
                whatsapp: user.whatsapp,
                profilePicture: user.profile_picture ? user.profile_picture.replace(/\\/g, "/").replace("public/", "") : "assets/profilePhoto.jpg",
            };
            res.json({
                success: true,
                message: "Logged in successfully!",
                token,
                user: userPayload,
            });
        } else {
            res.status(401).json({ success: false, message: "Invalid username or password." });
        }
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, message: "An internal server error occurred." });
    }
};

exports.adminLogin = async (req, res) => {
    const { username, password } = req.body;
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
            const token = jwt.sign(
                { id: adminUser.id, username: adminUser.username, role: "admin" },
                process.env.JWT_SECRET,
                { expiresIn: "8h" }
            );
            res.json({ success: true, token });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials." });
        }
    } catch (err) {
        console.error("Admin login error:", err);
        res.status(500).json({ success: false, message: "An internal server error occurred." });
    }
};

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, message: "Email address is required." });
    }
  
    const { data: user } = await supabase.from("users").select("id, username, email").eq("email", email).single();

    if (user) {
        const token = crypto.randomBytes(32).toString("hex");
        const expiry = new Date(Date.now() + 3600000); // 1 hour

        await supabase
            .from("users")
            .update({ reset_token: token, reset_token_expiry: expiry.toISOString() })
            .eq("id", user.id);

        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
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

    res.json({ success: true, message: "If an account exists, a reset link has been sent." });
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
        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .eq("reset_token", token)
            .single();

        if (error || !user) {
            return res.status(400).json({ success: false, message: "This reset link is invalid." });
        }

        if (new Date() > new Date(user.reset_token_expiry)) {
            return res.status(400).json({ success: false, message: "This reset link has expired." });
        }

        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        
        const { error: updateError } = await supabase
            .from("users")
            .update({ password: hashedPassword, reset_token: null, reset_token_expiry: null })
            .eq("id", user.id);

        if (updateError) throw updateError;

        res.json({ success: true, message: "Password has been reset successfully." });
    } catch (err) {
        console.error("Password reset error:", err);
        res.status(500).json({ success: false, message: "Error updating password." });
    }
};