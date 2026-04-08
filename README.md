# CiviQ - Community Issue Management System

A modern web application for managing community complaints and issues, built with Node.js, Express, MongoDB, and vanilla JavaScript.

## 🚀 Quick Start (One Command)

```bash
npm run dev
```

This automatically starts both frontend and backend servers!

## Single URL Mode

To run frontend and backend on one URL, use:

```bash
npm run dev:single
```

This builds the frontend and serves it from the backend at `http://localhost:5000`.

## 📋 Manual Setup (Alternative)

### Backend

```bash
cd backend
npm install
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## 🔑 Test Account

- **Email:** test@example.com
- **Password:** password123

## 🌐 URLs

- **Frontend:** http://localhost:8080
- **Backend:** http://localhost:5000

3. **Environment Configuration**
   - Copy `.env` file and update the values:

   ```env
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_secure_jwt_secret
   EMAIL_PROVIDER=sendgrid
   SENDGRID_API_KEY=your_sendgrid_api_key
   SENDGRID_FROM_EMAIL=no-reply@yourdomain.com
   SENDGRID_FROM_NAME=CiviQ Support
   FRONTEND_URL=http://localhost:8080
   ```

### Email Provider Setup

The app can send email through either SendGrid or Gmail. For production, use SendGrid. Gmail is mainly for local development.

### SendGrid Setup

1. Create a free account at https://sendgrid.com.
2. Open **Settings -> API Keys** and create a new API key.
3. Copy the key into `SENDGRID_API_KEY`.
4. Verify your sender address in SendGrid, then set it in `SENDGRID_FROM_EMAIL`.
5. Leave `EMAIL_PROVIDER=sendgrid` in `backend/.env`.

### Gmail Setup

If you want to use Gmail instead, set `EMAIL_PROVIDER=gmail` and use a Google App Password instead of your normal Gmail password.

1. Turn on 2-Step Verification for the Google account.
2. Open https://myaccount.google.com/apppasswords.
3. Create an app password for `Mail` and your device.
4. Copy the 16-character password into `GMAIL_APP_PASSWORD`.
5. Keep `GMAIL_USER` set to the exact Gmail address that owns the app password.

If you are just testing locally and do not want emails sent yet, leave the Gmail values blank. The app will keep working and will log the failure instead of breaking complaint flow.

4. **Start MongoDB**
   - Make sure MongoDB is running locally or update MONGO_URI for cloud instance

5. **Run the Backend**

   ```bash
   npm start
   ```

   Server will start on http://localhost:5000

6. **Frontend Setup**
   - Open `frontend/pages/index.html` in your browser
   - Or serve the frontend files using a local server

## API Endpoints

### Authentication

- `POST /api/users/register` - Register new user
- `POST /api/users/login` - User login
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile

### Complaints

- `GET /api/complaints` - Get all complaints (filtered by role)
- `POST /api/complaints` - Create new complaint
- `GET /api/complaints/:id` - Get single complaint
- `PUT /api/complaints/:id` - Update complaint
- `DELETE /api/complaints/:id` - Delete complaint (admin only)
- `PUT /api/complaints/:id/assign` - Assign technician (admin only)

### User Management (Admin Only)

- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

## User Roles

1. **Resident/User**
   - Submit complaints
   - View their own complaints
   - Update complaint details
   - Track complaint status

2. **Technician**
   - View assigned complaints
   - Update complaint status
   - Access complaints in their specialization area

3. **Administrator**
   - Full system access
   - Manage users and complaints
   - View analytics and reports
   - Assign technicians to complaints

## Project Structure

```
CiviQ/
├── backend/
│   ├── config/
│   │   └── db.js                 # Database connection
│   ├── controllers/
│   │   ├── userController.js     # User authentication & management
│   │   └── complaintController.js # Complaint CRUD operations
│   ├── middleware/
│   │   └── authMiddleware.js     # Authentication middleware
│   ├── models/
│   │   ├── User.js              # User schema
│   │   └── Complaint.js         # Complaint schema
│   ├── routes/
│   │   ├── userRoutes.js        # User API routes
│   │   └── complaintRoutes.js   # Complaint API routes
│   ├── server.js                # Main server file
│   ├── package.json
│   └── .env                     # Environment variables
├── frontend/
│   ├── pages/
│   │   └── index.html           # Main application page
│   ├── js/
│   │   └── main.js              # Frontend JavaScript
│   └── css/
│       └── style.css            # Application styles
└── README.md
```

## Development

### Running in Development Mode

```bash
# Backend
cd backend
npm run dev  # If you add nodemon to dev script

# Frontend
# Open index.html in browser or use a local server
# Example with Python: python -m http.server 8000
```

### Testing the API

Use tools like Postman or Insomnia to test API endpoints. Include the JWT token in the Authorization header for protected routes:

```
Authorization: Bearer <your_jwt_token>
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For questions or issues, please create an issue in the repository or contact the development team.
