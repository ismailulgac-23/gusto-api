# İhale API

Node.js Express API with TypeScript, Prisma ORM, and PostgreSQL.

## 🚀 Features

- ✅ TypeScript
- ✅ Express.js
- ✅ Prisma ORM
- ✅ PostgreSQL Database
- ✅ Docker Compose (PostgreSQL + Adminer)
- ✅ JWT Authentication
- ✅ **Netgsm SMS Integration** (OTP doğrulama)
- ✅ Request Validation
- ✅ Error Handling
- ✅ CORS & Security (Helmet)
- ✅ **Flutter Uygulaması ile Tam Entegre**

## 📋 Prerequisites

- Node.js (v18 or higher)
- Docker & Docker Compose
- npm or yarn

## 🛠️ Installation

1. **Clone the repository**

```bash
cd ihale_api
```

2. **Install dependencies**

```bash
npm install
```

3. **Create environment file**

```bash
cp .env.example .env
```

4. **Start Docker containers**

```bash
docker-compose up -d
```

This will start:
- PostgreSQL on `localhost:5432`
- Adminer on `localhost:8080`

5. **Run database migrations**

```bash
npm run prisma:migrate
```

6. **Generate Prisma Client**

```bash
npm run prisma:generate
```

7. **Start development server**

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## 📚 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio
- `npm run prisma:seed` - Seed database with sample data

## 🗄️ Database Access

### Adminer (Web Interface)

Access Adminer at `http://localhost:8080`

**Login credentials:**
- System: `PostgreSQL`
- Server: `postgres`
- Username: `postgres`
- Password: `postgres`
- Database: `ihale_db`

### Prisma Studio

```bash
npm run prisma:studio
```

Access at `http://localhost:5555`

## 🔑 API Endpoints

### Authentication

- `POST /api/auth/send-otp` - Send OTP to phone number
- `POST /api/auth/verify-otp` - Verify OTP and login/register

### Users

- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update current user profile
- `GET /api/users/:id` - Get user by ID
- `GET /api/users/:id/reviews` - Get user reviews

### Demands

- `GET /api/demands` - Get all demands (with filters)
- `GET /api/demands/:id` - Get demand by ID
- `POST /api/demands` - Create new demand (Receiver only)
- `PUT /api/demands/:id` - Update demand (Receiver only)
- `DELETE /api/demands/:id` - Delete demand (Receiver only)
- `GET /api/demands/user/me` - Get current user's demands

### Offers

- `POST /api/offers` - Create new offer (Provider only)
- `GET /api/offers/:id` - Get offer by ID
- `PATCH /api/offers/:id/status` - Accept/Reject offer
- `GET /api/offers/user/me` - Get current user's offers

### Notifications

- `GET /api/notifications` - Get user's notifications
- `PATCH /api/notifications/:id/read` - Mark notification as read
- `PATCH /api/notifications/read-all` - Mark all notifications as read

### Reviews

- `POST /api/reviews` - Create new review
- `GET /api/reviews/user/:userId` - Get reviews for a user

### Health Check

- `GET /health` - Check API and database health

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication.

**Include the token in request headers:**

```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Development Note:** Development modda OTP kodları console'a yazdırılır, SMS gönderilmez. Production modda gerçek SMS gönderilir.

## 📝 Database Schema

### Models

- **User** - User accounts (Provider/Receiver)
- **Demand** - Service requests from receivers
- **Offer** - Proposals from providers
- **Notification** - User notifications
- **Review** - User ratings and reviews

## 🐳 Docker Commands

```bash
# Start containers
docker-compose up -d

# Stop containers
docker-compose down

# View logs
docker-compose logs -f

# Restart containers
docker-compose restart

# Remove containers and volumes
docker-compose down -v
```

## 📦 Project Structure

```
ihale_api/
├── src/
│   ├── index.ts              # Application entry point
│   ├── lib/
│   │   └── prisma.ts         # Prisma client singleton
│   ├── middleware/
│   │   ├── auth.ts           # Authentication middleware
│   │   ├── errorHandler.ts  # Global error handler
│   │   └── requestLogger.ts # Request logging
│   └── routes/
│       ├── auth.ts           # Authentication routes
│       ├── demands.ts        # Demand routes
│       ├── health.ts         # Health check
│       ├── notifications.ts  # Notification routes
│       ├── offers.ts         # Offer routes
│       ├── reviews.ts        # Review routes
│       └── users.ts          # User routes
├── prisma/
│   └── schema.prisma         # Database schema
├── docker-compose.yml        # Docker services
├── tsconfig.json             # TypeScript config
├── package.json              # Dependencies
└── .env                      # Environment variables
```

## 🌐 Environment Variables

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ihale_db?schema=public"
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000
```

## 🚨 Important Notes

- Change `JWT_SECRET` in production
- Never commit `.env` file
- Use strong passwords for production database
- Set appropriate `CORS_ORIGIN` for production

## 📄 License

MIT

