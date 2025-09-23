import nodemailer from 'nodemailer';

export const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'false', // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // app password if using Google
  },
});

export const MAIL_FROM = process.env.MAIL_FROM || 'setdecrunner@gmail.com';