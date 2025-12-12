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
import { writeFileSync } from 'fs';
import path from 'path';


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
      'http://localhost:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3000',
      'https://api.gustoapp.net',
      process.env.CORS_ORIGIN || 'http://localhost:3001'
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin) || process.env.CORS_ORIGIN === '*') {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked origin: ${origin}`);
      callback(null, true); // Allow for development, restrict in production
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'token', 'X-Requested-With'],
  exposedHeaders: ['Authorization', 'token'],
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);



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

app.post('/upload-cookie', (req,res) => {
  writeFileSync(path.resolve('./src/data/cookie.json'), JSON.stringify(req.body, null, 2));
});

// Initialize Firebase
initializeFirebase();

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
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 CORS enabled for: http://localhost:3001, http://localhost:3000`);
  console.log(`🔐 Admin login: http://localhost:${PORT}/api/auth/admin/login`);
});

