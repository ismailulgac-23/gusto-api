import { Router, Response } from 'express';
import { Transaction, TransactionStatus, TransactionType } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  getParamGuid,
  initiateParam3DPayment,
  ParamCallbackPayload,
  verifyParamCallbackHash,
} from '../services/param.service';

const router = Router();

interface DepositInitiateBody {
  amount?: number | string;
  description?: string;
  cardHolderName?: string;
  cardNumber?: string;
  expiryMonth?: string;
  expiryYear?: string;
  cvc?: string;
  phone?: string;
}

function parseAmount(value: unknown): number {
  const amount = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('Geçerli bir yükleme tutarı giriniz.', 400);
  }
  return Number(amount.toFixed(2));
}

function normalizeCardNumber(value: string): string {
  return value.replace(/\D/g, '');
}

function getBaseUrl(req: AuthRequest): string {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

function getWebUrl(): string {
  return process.env.WEB_URL || process.env.FRONTEND_URL || 'http://localhost:3001';
}

function getClientIp(req: AuthRequest): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0];
  const rawIp = forwardedIp || req.socket.remoteAddress || '127.0.0.1';
  return rawIp.replace('::ffff:', '').replace('::1', '127.0.0.1');
}

function buildWalletRedirectUrl(status: 'success' | 'error', orderId?: string, message?: string): string {
  const redirectUrl = new URL('/provider/wallet', getWebUrl());
  redirectUrl.searchParams.set('payment', status);
  if (orderId) {
    redirectUrl.searchParams.set('orderId', orderId);
  }
  if (message) {
    redirectUrl.searchParams.set('message', message);
  }
  return redirectUrl.toString();
}

function resolveTopUpStatus(success: boolean): TransactionStatus {
  return success ? TransactionStatus.COMPLETED : TransactionStatus.FAILED;
}

async function getDepositTransaction(orderId: string): Promise<Transaction | null> {
  return prisma.transaction.findFirst({
    where: {
      referenceId: orderId,
      type: TransactionType.DEPOSIT,
    },
  });
}

async function finalizeTopUp(transaction: Transaction, payload: ParamCallbackPayload) {
  if (transaction.status === TransactionStatus.COMPLETED) {
    return {
      status: transaction.status,
      message: 'Bakiye yükleme zaten tamamlandı.',
      orderId: transaction.referenceId || undefined,
    };
  }

  const resultCode = Number(payload.TURKPOS_RETVAL_Sonuc || '0');
  const receiptId = String(payload.TURKPOS_RETVAL_Dekont_ID || '0');
  const hashVerified = verifyParamCallbackHash(payload);
  const guidMatches = String(payload.TURKPOS_RETVAL_GUID || '').toUpperCase() === getParamGuid().toUpperCase();
  const success = hashVerified && guidMatches && resultCode > 0 && Number(receiptId) > 0;
  const status = resolveTopUpStatus(success);
  const resultMessage = String(payload.TURKPOS_RETVAL_Sonuc_Str || (success ? 'Ödeme başarılı.' : 'Ödeme başarısız.'));

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status,
        description: success
          ? `Param POS ile bakiye yükleme (${transaction.amount.toFixed(2)} TL)`
          : `Başarısız Param POS bakiye yükleme (${transaction.amount.toFixed(2)} TL) - ${resultMessage}`,
      },
    });

    if (success) {
      await tx.user.update({
        where: { id: transaction.userId },
        data: {
          balance: {
            increment: transaction.amount,
          },
        },
      });
    }
  });

  return {
    status,
    message: resultMessage,
    orderId: transaction.referenceId || undefined,
  };
}

router.get('/my', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/balance', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { balance: true },
    });

    res.json({
      success: true,
      balance: user?.balance || 0,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/deposit/initiate', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const {
      amount: rawAmount,
      description,
      cardHolderName,
      cardNumber,
      expiryMonth,
      expiryYear,
      cvc,
      phone,
    } = req.body as DepositInitiateBody;

    const amount = parseAmount(rawAmount);
    const normalizedCardNumber = normalizeCardNumber(cardNumber || '');

    if (!cardHolderName || cardHolderName.trim().length < 2) {
      throw new AppError('Kart üzerindeki ad soyad zorunludur.', 400);
    }

    if (normalizedCardNumber.length !== 16) {
      throw new AppError('Kart numarası 16 haneli olmalıdır.', 400);
    }

    if (!expiryMonth || !/^\d{1,2}$/.test(expiryMonth) || Number(expiryMonth) < 1 || Number(expiryMonth) > 12) {
      throw new AppError('Kart son kullanma ayı geçersiz.', 400);
    }

    if (!expiryYear || !/^\d{2,4}$/.test(expiryYear)) {
      throw new AppError('Kart son kullanma yılı geçersiz.', 400);
    }

    if (!cvc || !/^\d{3,4}$/.test(cvc)) {
      throw new AppError('Kart güvenlik kodu geçersiz.', 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, phoneNumber: true },
    });

    if (!user) {
      throw new AppError('Kullanıcı bulunamadı.', 404);
    }

    const orderId = `WLT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const successUrl = `${getBaseUrl(req)}/api/transactions/deposit/callback`;
    const errorUrl = `${getBaseUrl(req)}/api/transactions/deposit/callback`;
    const walletDescription = description?.trim() || 'Param POS ile bakiye yükleme';

    const pendingTransaction = await prisma.transaction.create({
      data: {
        userId: user.id,
        amount,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        description: walletDescription,
        referenceId: orderId,
      },
    });

    try {
      const paymentResponse = await initiateParam3DPayment({
        amount,
        orderId,
        description: walletDescription,
        successUrl,
        errorUrl,
        clientIp: getClientIp(req),
        refUrl: `${getWebUrl()}/provider/wallet`,
        data1: 'wallet_topup',
        data2: user.id,
        data3: user.name || '',
        data4: String(amount),
        data5: 'provider_wallet',
        card: {
          holderName: cardHolderName.trim(),
          number: normalizedCardNumber,
          expiryMonth,
          expiryYear,
          cvc,
          phone: phone || user.phoneNumber,
        },
      });

      if (paymentResponse.resultCode <= 0 || !paymentResponse.redirectUrl) {
        await prisma.transaction.update({
          where: { id: pendingTransaction.id },
          data: {
            status: TransactionStatus.FAILED,
            description: `Başarısız Param POS bakiye yükleme (${amount.toFixed(2)} TL) - ${paymentResponse.resultMessage}`,
          },
        });

        throw new AppError(paymentResponse.resultMessage || 'Param POS ödeme başlatılamadı.', 400);
      }

      res.status(201).json({
        success: true,
        data: {
          orderId,
          redirectUrl: paymentResponse.redirectUrl,
        },
      });
    } catch (paymentError) {
      if (paymentError instanceof AppError) {
        throw paymentError;
      }

      await prisma.transaction.update({
        where: { id: pendingTransaction.id },
        data: {
          status: TransactionStatus.FAILED,
          description: `Başarısız Param POS bakiye yükleme (${amount.toFixed(2)} TL) - ${paymentError instanceof Error ? paymentError.message : 'Ödeme başlatılamadı.'}`,
        },
      });

      throw paymentError;
    }
  } catch (error) {
    next(error);
  }
});

router.get('/deposit/status/:orderId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const transaction = await getDepositTransaction(req.params.orderId);

    if (!transaction || transaction.userId !== req.userId) {
      throw new AppError('Ödeme kaydı bulunamadı.', 404);
    }

    const message =
      transaction.status === TransactionStatus.COMPLETED
        ? 'Bakiye yükleme tamamlandı.'
        : transaction.status === TransactionStatus.FAILED
          ? 'Bakiye yükleme başarısız oldu.'
          : 'Ödeme doğrulaması bekleniyor.';

    res.json({
      success: true,
      data: {
        orderId: transaction.referenceId,
        amount: transaction.amount,
        status: transaction.status,
        message,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

async function handleCallback(req: AuthRequest, res: Response, next: (error?: unknown) => void) {
  try {
    const payload = ((req.method === 'GET' ? req.query : req.body) || {}) as ParamCallbackPayload;
    const orderId = String(payload.TURKPOS_RETVAL_Siparis_ID || '');

    if (!orderId) {
      throw new AppError('Param callback sipariş bilgisi içermiyor.', 400);
    }

    const transaction = await getDepositTransaction(orderId);

    if (!transaction) {
      throw new AppError('Ödeme oturumu bulunamadı.', 404);
    }

    const finalizedTopUp = await finalizeTopUp(transaction, payload);
    const redirectUrl = buildWalletRedirectUrl(
      finalizedTopUp.status === TransactionStatus.COMPLETED ? 'success' : 'error',
      finalizedTopUp.orderId,
      finalizedTopUp.message
    );

    res.redirect(302, redirectUrl);
  } catch (error) {
    if (error instanceof AppError) {
      const callbackSource = req.method === 'GET' ? req.query : req.body;
      const orderId = typeof callbackSource?.TURKPOS_RETVAL_Siparis_ID === 'string'
        ? callbackSource.TURKPOS_RETVAL_Siparis_ID
        : undefined;
      res.redirect(302, buildWalletRedirectUrl('error', orderId, error.message));
      return;
    }

    next(error);
  }
}

router.post('/deposit/callback', async (req: AuthRequest, res, next) => {
  await handleCallback(req, res, next);
});

router.get('/deposit/callback', async (req: AuthRequest, res, next) => {
  await handleCallback(req, res, next);
});

router.post('/deposit', authenticate, async (_req: AuthRequest, _res, next) => {
  next(new AppError('Doğrudan bakiye yükleme kapatıldı. Lütfen Param POS akışını kullanınız.', 410));
});

export default router;
