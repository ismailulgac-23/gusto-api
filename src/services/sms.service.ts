import { Netgsm } from '@netgsm/sms';

const netgsm = new Netgsm({
  username: process.env.NETGSM_USERNAME || '8503031871',
  password: process.env.NETGSM_PASSWORD || 'Vigi1Lante2*',
});

// OTP kodlarını geçici olarak saklamak için (Production'da Redis kullanılmalı)
const otpStore = new Map<string, { code: string; expiresAt: number }>();

// Rastgele 6 haneli OTP kodu üret
export const generateOTP = (): string => {
  return "123456";
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// OTP gönder
export const sendOTP = async (
  phoneNumber: string
): Promise<{ success: boolean; jobid?: string; error?: string }> => {
  try {
    // Telefon numarasını temizle (başındaki +90, 0 vb. karakterleri kaldır)
    const cleanPhone = phoneNumber.replace(/^\+?90/, '').replace(/^0/, '');

    // 6 haneli OTP kodu oluştur
    const otpCode = generateOTP();

    // OTP'yi 5 dakika süreyle sakla
    otpStore.set(cleanPhone, {
      code: otpCode,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 dakika
    });

    // Development modunda SMS göndermeden loglayalım
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SMS] Phone: ${cleanPhone}, OTP: ${otpCode}`);
      return {
        success: true,
        jobid: 'dev-' + Date.now(),
      };
    }

    // Production'da gerçek SMS gönder
    const response = await netgsm.sendRestSms({
      msgheader: process.env.NETGSM_MSGHEADER || '8503031871',
      encoding: 'TR',
      messages: [
        {
          msg: `İhale App doğrulama kodunuz: ${otpCode}`,
          no: cleanPhone,
        },
      ],
    });

    console.log(`[SMS] Sent to ${cleanPhone}, JobID: ${response.jobid}`);

    return {
      success: true,
      jobid: response.jobid,
    };
  } catch (error: any) {
    console.error('[SMS] Error:', error);
    return {
      success: false,
      error: error.message || 'SMS gönderimi başarısız',
    };
  }
};

// OTP doğrula
export const verifyOTP = (phoneNumber: string, otp: string): boolean => {
  try {
    // Telefon numarasını temizle
    const cleanPhone = phoneNumber.replace(/^\+?90/, '').replace(/^0/, '');

    const stored = otpStore.get(cleanPhone);

    if (!stored) {
      console.log(`[SMS] No OTP found for ${cleanPhone}`);
      return false;
    }

    // Süre dolmuş mu?
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(cleanPhone);
      console.log(`[SMS] OTP expired for ${cleanPhone}`);
      return false;
    }

    // OTP eşleşiyor mu?
    if (stored.code === otp) {
      otpStore.delete(cleanPhone); // Kullanıldıktan sonra sil
      console.log(`[SMS] OTP verified for ${cleanPhone}`);
      return true;
    }

    console.log(`[SMS] Invalid OTP for ${cleanPhone}`);
    return false;
  } catch (error) {
    console.error('[SMS] Verification error:', error);
    return false;
  }
};

// Sürekli kontrol için temizlik fonksiyonu
setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of otpStore.entries()) {
    if (now > data.expiresAt) {
      otpStore.delete(phone);
    }
  }
}, 60000); // Her 1 dakikada bir temizle

export default {
  sendOTP,
  verifyOTP,
  generateOTP,
};

