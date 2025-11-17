import * as admin from 'firebase-admin';
import { AppError } from '../middleware/errorHandler';

// Firebase Admin SDK'yı başlat
let firebaseApp: admin.app.App | null = null;

export const initializeFirebase = () => {
  try {
    if (firebaseApp) {
      return firebaseApp;
    }

    // Firebase Admin SDK credentials
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!serviceAccount) {
      console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT not found. Push notifications will be disabled.');
      return null;
    }

    try {
      const serviceAccountJson = JSON.parse(serviceAccount);
      
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccountJson as admin.ServiceAccount),
      });

      console.log('✅ Firebase Admin SDK initialized');
      return firebaseApp;
    } catch (parseError) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:', parseError);
      return null;
    }
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    return null;
  }
};

// Tek kullanıcıya bildirim gönder
export const sendNotificationToUser = async (
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    if (!firebaseApp) {
      firebaseApp = initializeFirebase();
    }

    if (!firebaseApp) {
      return {
        success: false,
        error: 'Firebase not initialized',
      };
    }

    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      data: data || {},
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'default',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    
    return {
      success: true,
      messageId: response,
    };
  } catch (error: any) {
    console.error('FCM send error:', error);
    
    // Invalid token hatası
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      return {
        success: false,
        error: 'Invalid or expired FCM token',
      };
    }

    return {
      success: false,
      error: error.message || 'Failed to send notification',
    };
  }
};

// Çoklu kullanıcıya bildirim gönder
export const sendNotificationToMultipleUsers = async (
  fcmTokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; successCount: number; failureCount: number; errors?: string[] }> => {
  try {
    if (!firebaseApp) {
      firebaseApp = initializeFirebase();
    }

    if (!firebaseApp) {
      return {
        success: false,
        successCount: 0,
        failureCount: fcmTokens.length,
        errors: ['Firebase not initialized'],
      };
    }

    if (fcmTokens.length === 0) {
      return {
        success: true,
        successCount: 0,
        failureCount: 0,
      };
    }

    // Batch gönderim için (max 500 token)
    const batchSize = 500;
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < fcmTokens.length; i += batchSize) {
      const batch = fcmTokens.slice(i, i + batchSize);
      
      const message: admin.messaging.MulticastMessage = {
        tokens: batch,
        notification: {
          title,
          body,
        },
        data: data || {},
        android: {
          priority: 'high' as const,
          notification: {
            channelId: 'default',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      try {
        const response = await admin.messaging().sendEachForMulticast(message);
        successCount += response.successCount;
        failureCount += response.failureCount;

        // Hataları topla
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            errors.push(`Token ${batch[idx]}: ${resp.error?.message || 'Unknown error'}`);
          }
        });
      } catch (batchError: any) {
        failureCount += batch.length;
        errors.push(`Batch error: ${batchError.message}`);
      }
    }

    return {
      success: failureCount === 0,
      successCount,
      failureCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error: any) {
    console.error('FCM multicast send error:', error);
    return {
      success: false,
      successCount: 0,
      failureCount: fcmTokens.length,
      errors: [error.message || 'Failed to send notifications'],
    };
  }
};

// Topic'e bildirim gönder
export const sendNotificationToTopic = async (
  topic: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    if (!firebaseApp) {
      firebaseApp = initializeFirebase();
    }

    if (!firebaseApp) {
      return {
        success: false,
        error: 'Firebase not initialized',
      };
    }

    const message: admin.messaging.Message = {
      topic,
      notification: {
        title,
        body,
      },
      data: data || {},
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'default',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    
    return {
      success: true,
      messageId: response,
    };
  } catch (error: any) {
    console.error('FCM topic send error:', error);
    return {
      success: false,
      error: error.message || 'Failed to send notification',
    };
  }
};

