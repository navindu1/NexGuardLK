const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const supabase = require("../config/supabaseClient");
// Transporter එක මෙතැනට Import කිරීම අවශ්‍ය නැත. Service එක හරහා යවමු.
const { sendEmail, generateEmailTemplate, generateOtpEmailContent, generatePasswordResetEmailContent } = require("../services/emailService");

const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 15 * 60 * 1000; 

exports.register = async (req, res) => {
    const { username, email, whatsapp, password } = req.body;
    
    // 1. Validation
    if (!username || !email || !whatsapp || !password)
        return res.status(400).json({ success: false, message: "All fields are required." });

    try {
        // 2. Check Existing User
        const { data: existingUser } = await supabase
            .from("users")
            .select("id, otp_code")
            .or(`username.eq.${username},email.eq.${email}`)
            .single();

        if (existingUser && !existingUser.otp_code) {
            return res.status(409).json({ success: false, message: "Username or email is already taken." });
        }

        // 3. Prepare User Data
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
            active_plans: [],
        };
        
        // 4. Save to Database
        const { error } = await supabase.from("users").upsert({ id: existingUser?.id || uuidv4(), ...userData }, { onConflict: 'email' });
        if (error) throw error;

        // 5. Send Email (Using Service Function)
        // මෙම ක්‍රමය Vercel මත වඩාත් ආරක්ෂිතයි
        try {
            const subject = "Your NexGuard Verification Code";
            const htmlContent = generateEmailTemplate(
                "Verify Your Email",
                "Your OTP is inside.",
                generateOtpEmailContent(username, otp)
            );

            // sendEmail function එක await කර ප්‍රතිචාරය එනතුරු රැඳී සිටින්න
            await sendEmail(email, subject, htmlContent);
            
            console.log(`OTP Process Complete for ${email}`);

            return res.status(200).json({
                success: true,
                message: `An OTP has been sent to ${email}. Please check your Inbox and Spam folder.`,
            });

        } catch (emailError) {
            console.error(`CRITICAL: FAILED to send OTP to ${email}:`, emailError);
            // Email යැවීම අසාර්ථක වුවහොත් User ට ඒ බව දන්වන්න
            return res.status(500).json({ success: false, message: "Registration successful, but failed to send OTP email. Please try logging in or resending OTP." });
        }

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
        
        if (error || !user) {
            return res.status(400).json({ success: false, message: "Invalid request or user not found." });
        }

        if (user.otp_lockout_until && new Date() < new Date(user.otp_lockout_until)) {
            const waitMinutes = Math.ceil((new Date(user.otp_lockout_until) - new Date()) / 60000);
            return res.status(429).json({ success: false, message: `Too many failed attempts. Please try again in ${waitMinutes} minutes.` });
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
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, message: "An internal server error occurred." });
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
        const subject = 'Your Password Reset Link (Valid for 10 mins)';
        const html = generateEmailTemplate('Password Reset Request', 'Use the link inside to reset your password.', generatePasswordResetEmailContent(user.username, resetURL));

        // Using sendEmail service
        try {
            await sendEmail(user.email, subject, html);
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