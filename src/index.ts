import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

// Routes
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import demandsRouter from './routes/demands';
import offersRouter from './routes/offers';
import notificationsRouter from './routes/notifications';
import reviewsRouter from './routes/reviews';
import categoriesRouter from './routes/categories';
import charityActivitiesRouter from './routes/charity_activities';
import adminRouter from './routes/admin';
import settingsRouter from './routes/settings';
import adminNotificationsRouter from './routes/admin_notifications';
import { initializeFirebase } from './services/fcm.service';
import locationRoutes from './routes/location-routes';
import providerWebRouter from './routes/web/provider';
import { writeFileSync } from 'fs';
import path from 'path';
import transactionsRouter from './routes/transactions';
import bankAccountsRouter from './routes/bank-accounts';
import invoiceSettingsRouter from './routes/invoice-settings';
import paymentNotificationsRouter from './routes/payment-notifications';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
      'http://127.0.0.1:3000',
      'http://192.168.1.171:3002',
      'https://gustoapp.net',
      'https://www.gustoapp.net',
      'https://api.gustoapp.net',
      'https://blog.gustoapp.net',
      process.env.CORS_ORIGIN
    ].filter(Boolean);

    if (allowedOrigins.includes(origin) || !origin || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked origin: ${origin}`);
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'token', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Authorization', 'token'],
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Serve static files from uploads folder
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.use('/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/demands', demandsRouter);
app.use('/api/offers', offersRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/charity-activities', charityActivitiesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin/notifications', adminNotificationsRouter);
app.use('/api/locations', locationRoutes);
app.use('/api/web/provider', providerWebRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/bank-accounts', bankAccountsRouter);
app.use('/api/invoice-settings', invoiceSettingsRouter);
app.use('/api/payment-notifications', paymentNotificationsRouter);

app.post('/upload-cookie', (req, res) => {
  writeFileSync(path.resolve('./src/data/cookie.json'), JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

// Initialize Firebase
initializeFirebase();

// Review/DEMO modu cache'ini ısıt
import('./services/settings.service').then((m) => m.refreshReviewModeCache());

// Hayır aktiviteleri: bitişe yakın / sona erdi bildirimleri
import('./services/charity-scheduler.service').then((m) => m.startCharityScheduler());

// 404 handler
app.use('*', (_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: ${process.env.APP_URL || `http://localhost:${PORT}`}/health`);
  console.log(`🌐 Frontend URL: ${process.env.WEB_URL || 'http://localhost:3001'}`);
  console.log(`🔐 Admin login: ${(process.env.APP_URL || `http://localhost:${PORT}`)}/api/auth/admin/login`);
});

