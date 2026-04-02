# CiviQ Backend Security Checklist

## 🔐 Credentials & Secrets Management

### .env File Security

**CRITICAL: Never commit .env to git!**

**Steps to ensure .env is ignored:**

1. Verify `.gitignore` includes `.env`:

```bash
echo ".env" >> backend/.gitignore
echo ".env.local" >> backend/.gitignore
```

2. Check if .env is already tracked:

```bash
git ls-files | grep -E "\.env"
# If it shows .env, remove it:
git rm --cached backend/.env
git commit -m "Remove .env from tracking"
```

3. Verify it's properly ignored:

```bash
git check-ignore -v backend/.env
# Should output: backend/.env	.gitignore:line_X
```

### Environment Variables Checklist

✅ **Development Setup**

- [ ] Create `backend/.env` from `.env.example`
- [ ] Add `GMAIL_USER` (your email)
- [ ] Add `GMAIL_APP_PASSWORD` (16-char app password)
- [ ] Add `JWT_SECRET` (generate random: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- [ ] Add `MONGODB_URI` (local or Atlas)
- [ ] Add `FRONTEND_URL` (http://localhost:3000 for dev)
- [ ] Verify `.env` is in `.gitignore`

✅ **Staging Setup**

- [ ] Create separate `.env.staging`
- [ ] Use staging-specific credentials only
- [ ] Use staging MongoDB instance
- [ ] Use staging Gmail account or SendGrid

✅ **Production Setup**

- [ ] Deploy .env via CI/CD secrets or environment manager
- [ ] NEVER store .env in git repository
- [ ] Use OAuth2 instead of app passwords (see README)
- [ ] Use managed service (SendGrid, AWS SES, etc.)
- [ ] Enable encryption for credentials in transit
- [ ] Use separate production Gmail/email account
- [ ] Audit access logs regularly

---

## 🔒 Gmail Security

### App Password vs Regular Password

| Aspect          | App Password       | Regular Password |
| --------------- | ------------------ | ---------------- |
| Modern          | ✅ Yes             | ❌ No            |
| Requires 2FA    | ✅ Yes             | ❌ No            |
| Revoke per app  | ✅ Yes             | ❌ No            |
| Better security | ✅ Yes             | ❌ No            |
| Easier setup    | ❌ No (more steps) | ✅ Yes           |

**Apple password is REQUIRED.** Regular passwords will NOT work.

### App Password Setup

**Prerequisites:**

- ✅ Google Account
- ✅ 2-Step Verification enabled
- ✅ Internet access

**Steps:**

1. Go to: https://myaccount.google.com/apppasswords
2. Select **Mail** → **Your Device Type** (Windows Computer, Mac, etc.)
3. Google generates 16-character password
4. Copy password **exactly as shown** (with spaces: `abcd efgh ijkl mnop`)
5. In .env, paste **WITHOUT spaces**: `GMAIL_APP_PASSWORD=abcdeFghijklmnop`

### Security Best Practices for App Passwords

✅ **DO:**

- Create one app password per environment (dev/staging/prod)
- Store only in .env (never share, never commit to git)
- Rotate app passwords quarterly
- Delete unused app passwords from Google Account
- Monitor "Recent activity" at: https://myaccount.google.com/security

❌ **DON'T:**

- Share app password with team members
- Use one app password for multiple services
- Commit to git repository
- Paste in chat/email/documents
- Use regular Gmail password
- Reuse in other applications

---

## 🛡️ JWT Security

### Generate Strong JWT Secret

```bash
# Generate random 32-byte hex string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Example: 4a5f3b8c9e1d2f4a6b8c0e1f3a5b7c9d1e3f5a7b
```

Add to `.env`:

```env
JWT_SECRET=4a5f3b8c9e1d2f4a6b8c0e1f3a5b7c9d1e3f5a7b
JWT_EXPIRE=7d
```

### JWT Best Practices

✅ **DO:**

- Use strong random secret (32+ bytes)
- Set reasonable expiration (3-7 days)
- Rotate secret periodically (with grace period)
- Store in environment variable
- Use HTTPS for all JWT transmission
- Implement token refresh mechanism

❌ **DON'T:**

- Use simple/predictable secrets
- Store token in URL query parameters
- Extend JWTs indefinitely
- Share secret with client-side code
- Hardcode secret in source code

---

## 🗄️ Database Security

### MongoDB Atlas (Cloud)

✅ **Security Checklist:**

- [ ] Create dedicated user (not admin)
- [ ] Use strong password (16+ chars, symbols)
- [ ] Enable IP whitelist (allow only server IPs)
- [ ] Use connection string instead of username/password in URI
- [ ] Enable encryption at rest and in transit
- [ ] Regular backups enabled

### Local MongoDB

✅ **Security Checklist:**

- [ ] Change default port from 27017
- [ ] Enable authentication
- [ ] Create dedicated database user
- [ ] Use strong password
- [ ] Bind to localhost only (not 0.0.0.0)
- [ ] Enable firewall rules

---

## 🔑 API Security

### Authentication

✅ **Email Verification:**

- Implement email verification for user registration
- Don't allow access until email verified

✅ **Rate Limiting:**

```javascript
const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use("/api/", limiter);
```

✅ **Password Policy:**

- Minimum 8 characters
- Require mix of uppercase, lowercase, numbers
- No common passwords
- Hash with bcrypt (minimum 10 rounds)

### Authorization

✅ **Role-Based Access Control (RBAC):**

- User: Only their own data
- Technician: Assigned complaints only
- Admin: All data

### Validation

✅ **Input Validation:**

```javascript
// Validate before processing
if (!description || description.length < 10) {
  return res.status(400).json({ error: "Invalid description" });
}
```

✅ **SQL Injection Protection:**

- MongoDB uses document queries (not SQL)
- Still validate/sanitize inputs

---

## 📋 Data Protection

### Personally Identifiable Information (PII)

✅ **Protection:**

- Hash passwords with bcrypt
- Don't log PII (emails, phone numbers)
- Don't send in error messages
- Minimize data stored (collect only what's needed)
- Implement data retention policies (delete old data)

### Email Communication

✅ **Best Practices:**

- Use HTTPS for all email links
- Include unsubscribe links in emails
- Don't attach sensitive data
- Use DKIM/SPF/DMARC for sender verification
- Monitor delivery and bounces

---

## 🔍 Logging & Monitoring

### What NOT to Log

❌ **Never log:**

- Passwords or app passwords
- JWT tokens
- Credit card information
- Personal identification numbers
- API keys or secrets
- Full email addresses in combination with behavior

### What TO Log

✅ **Log for debugging:**

- API endpoint calls (without sensitive data)
- Error types and stack traces
- Authentication attempts (failed only)
- Email sending status (success/fail)
- Database operations (CRUD count, not data)

### Log Example

```javascript
// ❌ BAD - Logs password
console.log(`Login attempt: ${email} / ${password}`);

// ✅ GOOD - Logs safely
console.log(`Login attempt for: ${email.split("@")[0]}@***`);
console.log(`Password reset email sent to: ${email.substring(0, 3)}***`);
```

---

## 🚀 Production Deployment

### Pre-Deployment Checklist

- [ ] All credentials in environment variables (never in code)
- [ ] .env file in .gitignore
- [ ] HTTPS enabled for all endpoints
- [ ] CORS configured for specific origins (not \* for production)
- [ ] Rate limiting implemented
- [ ] Error messages don't expose stack traces in production
- [ ] Database backups configured
- [ ] Logging enabled
- [ ] Monitoring alerts set up
- [ ] API documentation updated
- [ ] Security headers configured (HSTS, X-Frame-Options, etc.)

### Recommended Security Headers

```javascript
const helmet = require("helmet");

// Adds various security headers
app.use(helmet());

// Specific headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});
```

### HTTPS Configuration

**Install helmet:**

```bash
npm install helmet
```

**Use in server:**

```javascript
const helmet = require("helmet");
app.use(helmet());
```

---

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security](https://expressjs.com/en/advanced/best-practice-security.html)
- [Gmail App Passwords Help](https://support.google.com/accounts/answer/185833)
- [MongoDB Security](https://docs.mongodb.com/manual/security/)
- [JWT.io Guide](https://jwt.io/introduction)

---

## 🆘 Security Incident Response

### If Credentials Leaked

1. **Immediately:**
   - [ ] Delete app password from Google Account
   - [ ] Generate new app password
   - [ ] Update .env with new password
   - [ ] Restart application
   - [ ] Check email sending logs for unauthorized use

2. **Within 1 hour:**
   - [ ] Rotate JWT_SECRET (with grace period for existing tokens)
   - [ ] Change database password
   - [ ] Review access logs

3. **Within 24 hours:**
   - [ ] Send security incident notice to users
   - [ ] Audit all account activities
   - [ ] Implement additional monitoring

### If Git History Exposed

1. Immediately rewrite git history:

```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch backend/.env" \
  --prune-empty --tag-name-filter cat -- --all
```

2. Push force update:

```bash
git push origin --force --all
```

3. Rotate ALL credentials (passwords, API keys, etc.)

---

## 🎯 Regular Security Tasks

### Weekly

- [ ] Review application error logs
- [ ] Monitor email delivery status
- [ ] Check for failed authentication attempts

### Monthly

- [ ] Review access logs
- [ ] Audit user accounts (especially admin/technician)
- [ ] Update dependencies: `npm audit`

### Quarterly

- [ ] Rotate JWT secret (with migration period)
- [ ] Rotate app password
- [ ] Security code review
- [ ] Penetration testing (if applicable)

### Annually

- [ ] Full security audit
- [ ] Disaster recovery drill
- [ ] Update security policies
