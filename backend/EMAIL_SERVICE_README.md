# Email Service Setup & Configuration

## Overview

The CiviQ system uses **Nodemailer** with **Gmail SMTP** to send email notifications:

- ✉️ Assignment notifications (when technician is assigned)
- 📢 Status update notifications (when issue status changes)
- ✅ Resolution notifications (when issue is resolved)
- ⏰ Technician reminders (pending issues)

## Quick Start

### 1. Set Up Gmail App Password

Gmail doesn't allow regular passwords for third-party apps. You need to generate an **App Password**.

⚠️ **SECURITY NOTICE:** App passwords are less secure than modern OAuth2. This approach works for development/small deployments. For production, consider OAuth2 (see "Production Deployment" section below).

**Steps:**

1. Go to: https://myaccount.google.com/apppasswords
2. Sign in with your Google account (requires 2FA enabled)
3. Select **Mail** → **Windows Computer** (choose your device type)
4. Google generates a 16-character password (looks like: `abcd efgh ijkl mnop`)
5. Copy the password **without spaces**: `abcdeFghijklmnop`
6. Store securely in `.env` (never commit to git)

### 2. Create .env File

Copy `.env.example` to `.env`:

```bash
cp backend/.env.example backend/.env
```

### 3. Update .env with Email Configuration

```env
EMAIL_PROVIDER=gmail
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx  # 16-char password from step 1

FRONTEND_URL=http://localhost:3000
```

If you need compatibility with older env files, `GMAIL_PASS` is also accepted, but `GMAIL_APP_PASSWORD` is the preferred variable.

### 4. Test the Email Service

Once configured, emails will automatically send when:

- ✅ A complaint is created with `autoAssign: true`
- ✅ A technician is assigned to a complaint
- ✅ A complaint status is updated
- ✅ A complaint is marked as resolved

---

## 🔐 Security Considerations

### App Password vs OAuth2

| Approach         | Pros                                                                                            | Cons                                                                    | Use Case                         |
| ---------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------- |
| **App Password** | ✅ Simple setup<br>✅ Works immediately<br>✅ No callback URLs                                  | ❌ Less secure<br>❌ Single password<br>❌ No revocation per app        | Development<br>Small deployments |
| **OAuth2**       | ✅ Industry standard<br>✅ User grants permission<br>✅ Revoke per app<br>✅ No password stored | ❌ Complex setup<br>❌ Requires redirect URL<br>❌ Token refresh needed | Production<br>Enterprise         |

### Best Practices

✅ **DO:**

- Store app password in `.env` file (never in code)
- Add `.env` to `.gitignore`
- Rotate app password periodically
- Use different app password per environment (dev/staging/prod)
- Enable 2FA on Google account (required for app passwords)
- Use HTTPS in production
- Audit email logs regularly

❌ **DON'T:**

- Hardcode credentials in source code
- Share `.env` files across systems
- Use same app password for multiple services
- Commit `.env` to git repository
- Use regular Gmail password with Nodemailer
- Print credentials in logs

---

## Production Deployment Recommendations

### Option 1: OAuth2 (Recommended)

For production, implement OAuth2 with service accounts:

```javascript
const { google } = require("googleapis");

// Use service account key file
const auth = new google.auth.GoogleAuth({
  keyFile: "service-account-key.json",
  scopes: ["https://www.googleapis.com/auth/gmail.send"],
});

const gmail = google.gmail({ version: "v1", auth });
```

**Setup Steps:**

1. Create Google Cloud Project
2. Enable Gmail API
3. Create Service Account
4. Download service account key JSON
5. Share email with service account (if external)

### Option 2: Environment-Specific Passwords

Use different app passwords per environment:

```env
# .env.development
GMAIL_APP_PASSWORD=dev-password-xxxx

# .env.staging
GMAIL_APP_PASSWORD=staging-password-xxxx

# .env.production
GMAIL_APP_PASSWORD=prod-password-xxxx
```

### Option 3: Third-Party Email Service

Consider using SendGrid, Mailgun, or AWS SES:

```javascript
const mailgun = require("mailgun.js");
const FormData = require("form-data");
const mg = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY,
});
```

**Advantages:**

- ✅ Better deliverability
- ✅ Built-in analytics
- ✅ Better spam filtering
- ✅ Support for templates
- ✅ Higher sending limits

## API Endpoints That Trigger Emails

### 1. Create Complaint with Auto-Assignment

```bash
POST /api/complaints
{
  "description": "Broken water pipe",
  "location": "Main Street",
  "category": "Utilities",
  "priority": "High",
  "autoAssign": true
}
```

**Triggers:** Assignment email → user & technician

### 2. Assign Technician

```bash
PUT /api/complaints/{id}/assign
{
  "useAI": true  # or technicianId: "#{id}"
}
```

**Triggers:** Assignment email → user & technician

### 3. Update Complaint Status

```bash
PUT /api/complaints/{id}
{
  "status": "In Progress",
  "statusMessage": "We've started working on fixing the water pipe."
}
```

**Triggers:** Status update email → user

### 4. Mark as Resolved

```bash
PUT /api/complaints/{id}
{
  "status": "Resolved",
  "resolutionDetails": "The water pipe has been replaced and tested. Water pressure is normal."
}
```

**Triggers:** Resolution email → user

## Email Templates

### 1. Assignment Notification

**Sent to:** User & Technician  
**When:** Issue is assigned to technician  
**Contains:**

- Issue ID, category, location, priority
- Brief description
- Link to dashboard
- Technician name (to user only)

### 2. Status Update Notification

**Sent to:** User  
**When:** Status changes (Pending → In Progress, etc.)  
**Contains:**

- Current status with color indicator
- Latest status message
- Link to view full details

### 3. Resolution Notification

**Sent to:** User  
**When:** Status changes to "Resolved"  
**Contains:**

- Confirmation of resolution
- Resolution details
- Technician who resolved it
- Request for feedback
- Thank you message

### 4. Technician Reminder

**Sent to:** Technician  
**When:** Scheduled by reminder scheduler (next phase)  
**Contains:**

- List of all pending assigned issues
- Issue summaries (ID, category, location)
- Link to dashboard

## Available Functions

### In Code

```javascript
const emailService = require("../services/emailService");

// Send assignment notification
await emailService.sendAssignmentNotification(complaint);

// Send status update
await emailService.sendStatusUpdateNotification(complaint, statusMessage);

// Send resolution
await emailService.sendResolutionNotification(complaint, resolutionDetails);

// Send with attachment (Excel, PDF, etc.)
await emailService.sendEmailWithAttachment(
  "user@example.com",
  "Issue Report",
  htmlContent,
  { filename: "report.xlsx", content: buffer },
);

// Send technician reminder
await emailService.sendTechnicianReminder(technician, pendingComplaints);
```

## Troubleshooting

### Enable 2-Step Verification (Required for App Passwords)

App passwords **only work** if you have 2-Step Verification enabled on your Google Account.

**Steps:**

1. Go to: https://myaccount.google.com/security
2. Look for **"2-Step Verification"** section
3. Click **"Enable"** (if not already enabled)
4. Follow Google's prompts (SMS or authenticator app)
5. Once enabled, app passwords page will be available

### Common Issues & Solutions

#### ❌ "App passwords" option not available

**Cause:** 2-Step Verification not enabled

**Solution:**

1. Go to: https://myaccount.google.com/security
2. Find **"2-Step Verification"**
3. Click **"Get Started"**
4. Complete the setup process
5. Try again

#### ❌ Email not sending, error: "Invalid credentials"

**Possible causes & solutions:**

| Error Message       | Cause                        | Fix                                                           |
| ------------------- | ---------------------------- | ------------------------------------------------------------- |
| Invalid credentials | Using regular password       | Generate app password (steps above)                           |
| 535 5.7.8           | App password has spaces      | Remove all spaces: `abcd efgh ijkl mnop` → `abcdeFghijklmnop` |
| 535 5.7.1           | Apps with less secure access | Use app password (not regular password)                       |
| Connection timeout  | Firewall blocking SMTP       | Check firewall, use port 587                                  |

#### ❌ .env file not being read

**Solution:**

```bash
# Verify .env exists
ls -la backend/.env

# Check server is using correct path
echo $GMAIL_USER

# If empty, restart server:
npm start
```

#### ❌ Emails sending but not received by user

**Checked:**

1. Verify recipient email is correct in complaint
2. Check Gmail spam folder
3. Check email logs in server console
4. Verify FRONTEND_URL is correct in .env

#### ❌ "Email service not configured" warning in logs

**Cause:** Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env

**Solution:**

```bash
# Verify .env has both variables
grep GMAIL_ backend/.env

# Output should show:
# GMAIL_USER=your-email@gmail.com
# GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

#### ❌ Error: "Connect ECONNREFUSED"

**Cause:** Gmail server not reachable / network issue

**Solution:**

```bash
# Test Gmail SMTP connectivity
telnet smtp.gmail.com 587

# Or use curl to test
curl -v telnet://smtp.gmail.com:587
```

### Check Server Logs

Look for these messages:

```
✅ Email service initialized for your-email@gmail.com
  → Email service is ready

⚠️ Email service not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env
  → Missing credentials - add to .env

✅ Assignment emails sent - User: x@y.com, Technician: a@b.com
  → Emails successfully queued
```

### Test Email Manually

```bash
# Create a complaint with auto-assign
curl -X POST http://localhost:5000/api/complaints \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "description": "Test water leak",
    "location": "Building A",
    "category": "Utilities",
    "priority": "High",
    "autoAssign": true
  }'

# Check logs for "Email service initialized"
# and "Assignment emails sent" messages
```

### Get Help

For detailed Gmail setup issues:

- [Enable 2-Step Verification](https://myaccount.google.com/security)
- [Create App Password](https://myaccount.google.com/apppasswords)
- [Nodemailer Gmail Guide](https://nodemailer.com/smtp/gmail/)
- [Gmail Security Help](https://support.google.com/accounts/answer/185833)

## Email Content Customization

### Modify Email Templates

Edit `/backend/services/emailService.js` and update the template functions:

- `getAssignmentEmailTemplate()` - Assignment emails
- `getStatusUpdateEmailTemplate()` - Status updates
- `getResolutionEmailTemplate()` - Resolutions
- `getTechnicianReminderTemplate()` - Reminders

### Add Custom Styling

Templates use inline CSS. Modify the `style` attributes in the template functions.

### Change Email Subject

Update the `subject` field in the `mailOptions` object in each send function.

## Next Steps

1. ✅ Email Service (Current - DONE)
2. 🔄 Google Calendar Integration
3. 📊 Excel Report Generation
4. ⏰ Reminder Scheduler

---

## Support

For issues with Gmail setup, see:

- [Gmail App Passwords Help](https://support.google.com/accounts/answer/185833)
- [Nodemailer Gmail Guide](https://nodemailer.com/smtp/gmail/)
