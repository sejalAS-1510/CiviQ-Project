# CiviQ — Community Issue Management System

CiviQ is a lightweight, production-ready system for reporting, tracking, and resolving community issues with automated classification, technician assignment, notifications, and reporting.

**Project overview**

CiviQ streamlines citizen issue reporting and operations for communities and building managers. Residents report problems (plumbing, electrical, cleaning, security, infrastructure, noise), technicians are auto-selected using a configurable matching algorithm, and admins get centralized visibility, notifications, and exportable reports.

**Why this matters**

- Reduces manual triage by automating classification and assignment.
- Centralizes communication with notifications and email for faster resolution.
- Tracks lifecycle and ratings to surface technician performance and trends.

**Key features**

- Role-based access: resident, technician, admin
- Complaint reporting: category, description, location, optional image
- Automatic classification and optional auto-assignment to technicians
- Technician decision flow: accept / reject / reschedule
- Complaint lifecycle: Pending → In Progress → Resolved → Closed
- Notifications (in-app) and email alerts (SendGrid/Gmail) for key events
- Technician ratings and feedback history
- Excel report generation per complaint (attachment-ready)
- Background scheduler for reminders

**Tech stack**

- Backend: Node.js, Express, MongoDB (Mongoose), JWT, bcrypt
- Frontend: React + TypeScript, Vite, Tailwind CSS, shadcn-ui, Zustand
- Email: SendGrid or Gmail via Nodemailer
- Other: Multer (uploads), node-cron (scheduler), ExcelJS (reports)

**Architecture & workflow (brief)**

Residents log in, submit an issue via the UI, and optionally upload an image. The server classifies the complaint, creates a DB record, optionally auto-assigns a technician, and triggers notification + email flows. Technicians update status or respond; admins manage users and reports. A scheduler sends reminder emails for pending assigned tasks.

**Live demo**

public demo URL: https://civiq-omega.vercel.app/

**Quick setup (developer)**

1. Clone the repo

```bash
# HTTPS (recommended for recruiters)
git clone https://github.com/SejalAS-1510/CiviQ.git

# OR (SSH) — for contributors with SSH keys configured
# git clone git@github.com:<your-org-or-username>/civiq.git

cd CiviQ
```

2. Install & run (root script starts both servers)

```bash
# Install dependencies for root (frontend/backend handled by scripts)
npm install

# Start both frontend and backend in development
npm run dev

# Or run single-URL mode (builds frontend and serves from backend)
npm run dev:single
```

3. Backend env

Copy the example and create a local `.env` (do not commit real secrets):

```bash
cp backend/.env.example backend/.env
# then edit backend/.env with your real values
```

Example `.env` keys (placeholders are in `backend/.env.example`):

```
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/civiq?retryWrites=true&w=majority
JWT_SECRET=replace_with_random_secret
EMAIL_PROVIDER=sendgrid # or gmail
SENDGRID_API_KEY=replace_with_sendgrid_api_key
SENDGRID_FROM_EMAIL=verified-sender@example.com
# FRONTEND_URL: for Vite dev server use http://localhost:5173
# If you run the app in single-URL mode (backend serves frontend), set http://localhost:8080
# If frontend is deployed separately (e.g. Vercel), set your live frontend URL here
FRONTEND_URL=http://localhost:5173
```

**API & file locations**

- Backend server: `backend/server.js`
- API routes: `backend/routes/*`
- Frontend app: `frontend/src/` (entry: `frontend/src/main.tsx` and `frontend/src/App.tsx`)

**Notes for evaluators**

- The repository includes a simple feature audit script: `scripts/feature-audit.js` that performs basic end-to-end API checks.
- Auto-assignment logic lives in `backend/services/technicianAssigner.js` and complaint classification in `backend/services/categoryDetector.js`.

**Contributing & license**

Contributions welcome — fork, branch, and open a pull request. Licensed under ISC (see project root `package.json`).

---
