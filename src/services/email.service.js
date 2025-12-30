import nodemailer from "nodemailer";
import logger from "../utils/logger.js";

/* -------------------- Create Transporter -------------------- */
const createTransporter = () => {
  if (!process.env.EMAIL_USERNAME || !process.env.EMAIL_PASSWORD) {
    logger.warn("SMTP credentials missing. Email service disabled.");
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

/* -------------------- Test Connection -------------------- */
export const testEmailConnection = async () => {
  console.log("Testing email connection...");

  const transporter = createTransporter();
  if (!transporter) return false;

  try {
    await transporter.verify();
    console.log("Email connection test successful");
    logger.info("Email service connected successfully");
    return true;
  } catch (error) {
    console.log("Email connection test failed:", error.message);
    logger.error("Email service connection failed:", error);
    return false;
  }
};

/* -------------------- Send Password Reset Email -------------------- */
export const sendPasswordResetEmail = async (email, resetToken, userName) => {
  const transporter = createTransporter();
  if (!transporter) {
    throw new Error("Email service not configured");
  }

  const resetUrl = `${
    process.env.FRONTEND_URL || "http://localhost:5173"
  }/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.EMAIL_USERNAME,
    to: email,
    subject: "Password Reset Request - EWPM Platform",
    html: `
      <h2>Password Reset</h2>
      <p>Hello ${userName},</p>
      <p>You requested to reset your password.</p>
      <p>
        <a href="${resetUrl}" 
           style="padding:10px 20px;background:#667eea;color:#fff;text-decoration:none;border-radius:5px;">
          Reset Password
        </a>
      </p>
      <p>This link will expire in <b>15 minutes</b>.</p>
      <p>If you didn't request this, ignore this email.</p>
    `,
    text: `
Password Reset - EWPM Platform

Hello ${userName},

Reset your password using the link below:
${resetUrl}

This link expires in 15 minutes.
`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Password reset email sent: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error("Failed to send password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
};

/* -------------------- Send Welcome Email -------------------- */
export const sendWelcomeEmail = async (email, userName) => {
  const transporter = createTransporter();
  if (!transporter) {
    throw new Error("Email service not configured");
  }

  const loginUrl = `${
    process.env.FRONTEND_URL || "http://localhost:5173"
  }/login`;

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.EMAIL_USERNAME,
    to: email,
    subject: "Welcome to EWPM Platform",
    html: `
      <h2>Welcome ${userName} 👋</h2>
      <p>Your account has been created successfully.</p>
      <p>
        <a href="${loginUrl}"
           style="padding:10px 20px;background:#667eea;color:#fff;text-decoration:none;border-radius:5px;">
          Login
        </a>
      </p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Welcome email sent: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error("Failed to send welcome email:", error);
    throw new Error("Failed to send welcome email");
  }
};

export default {
  testEmailConnection,
  sendPasswordResetEmail,
  sendWelcomeEmail,
};
