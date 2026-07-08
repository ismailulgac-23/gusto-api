import https from 'https';
import { exit } from 'process';
import { getReviewMode } from './settings.service';

const NETGSM_CONFIG = {
  username: '8503031871',
  password: 'D99-763',
  header: 'B.Yukselcan',
};

// OTP kodlarını geçici olarak saklamak için (Production'da Redis kullanılmalı)
const otpStore = new Map<string, { code: string; expiresAt: number }>();

export const TEST_OTP_CODE = '123456';

// Her zaman aktif geliştirme/QA numarası (admin toggle'ından bağımsız).
const ALWAYS_ON_PHONES = ['5318706998'];
// App Store inceleme hesapları — yalnızca admin panel "Review/DEMO Modu" AÇIK iken aktif.
const REVIEW_ACCOUNTS = ['5555555555', '6666666666'];

export function cleanPhoneNumber(phone: string): string {
  return String(phone || '').replace(/^\+?90/, '').replace(/^0/, '');
}

// Sabit-OTP girişinin bu an için aktif olup olmadığı (review toggle'ına bağlı).
export function isReviewActivePhone(rawOrClean: string): boolean {
  const clean = cleanPhoneNumber(rawOrClean);
  if (ALWAYS_ON_PHONES.includes(clean)) return true;
  if (REVIEW_ACCOUNTS.includes(clean) && getReviewMode()) return true;
  return false;
}

// Bu numaralar demo/QA hesabı olduğundan kalıcı silinmez (toggle'dan bağımsız korunur).
export function isProtectedTestPhone(rawOrClean: string): boolean {
  const clean = cleanPhoneNumber(rawOrClean);
  return ALWAYS_ON_PHONES.includes(clean) || REVIEW_ACCOUNTS.includes(clean);
}

// Rastgele 6 haneli OTP kodu üret
export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const ERROR_CODES: Record<string, string> = {
  '20': 'Mesaj metni ya da mesaj boyunu kontrol ediniz.',
  '30': 'Geçersiz kullanıcı adı, şifre veya API erişim yetkisi hatası.',
  '40': 'Gönderici adını (msgheader) kontrol ediniz.',
  '41': 'Gönderici adını kontrol ediniz.',
  '50': 'Gönderilen numarayı kontrol ediniz.',
  '60': 'Hesabınızda OTP SMS Paketi tanımlı değildir.',
  '70': 'Input parametrelerini kontrol ediniz.',
  '80': 'Sorgulama sınır aşımı (dakikada max 100 adet).',
  '100': 'Sistem hatası.',
};

// OTP gönder
export const sendOTP = async (
  phoneNumber: string
): Promise<{ success: boolean; jobid?: string; error?: string }> => {
  try {
    const cleanPhone = phoneNumber.replace(/^\+?90/, '').replace(/^0/, '');

    const isTestPhone = isReviewActivePhone(cleanPhone);
    const otpCode = isTestPhone ? TEST_OTP_CODE : generateOTP();

    // OTP'yi 5 dakika süreyle sakla
    otpStore.set(cleanPhone, {
      code: otpCode,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    if (isTestPhone) {
      return {
        success: true,
      };
    }

    const message = `GustoApp doğrulama kodunuz: ${otpCode}, kimseyle paylaşmayın!`;

    const xmlData = `<?xml version="1.0"?>
<mainbody>
   <header>
       <usercode>${NETGSM_CONFIG.username}</usercode>
       <password>${NETGSM_CONFIG.password}</password>
       <msgheader>${NETGSM_CONFIG.header}</msgheader>
   </header>
   <body>
       <msg>${message}</msg>
       <no>${cleanPhone}</no>
   </body>
</mainbody>`;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.netgsm.com.tr',
        path: '/sms/send/otp',
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          'Content-Length': Buffer.byteLength(xmlData),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            // Basit XML parsing
            const codeMatch = data.match(/<code>(.*?)<\/code>/);
            const jobidMatch = data.match(/<jobID>(.*?)<\/jobID>/);

            const code = codeMatch ? codeMatch[1] : null;
            const jobid = jobidMatch ? jobidMatch[1] : null;

            if (code && ERROR_CODES[code]) {
              console.error(`[SMS] Netgsm Error ${code}: ${ERROR_CODES[code]}`);
              resolve({
                success: false,
                error: ERROR_CODES[code],
              });
            } else {
              console.log(`[SMS] Sent to ${cleanPhone}, JobID: ${jobid}`);
              resolve({
                success: true,
                jobid: jobid || undefined,
              });
            }
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.write(xmlData);
      req.end();
    });
  } catch (error: any) {
    console.error('[SMS] Error:', error);
    return {
      success: false,
      error: error.message || 'SMS gönderimi başarısız',
    };
  }
};

export const verifyOTP = (phoneNumber: string, otp: string): boolean => {
  try {
    // Telefon numarasını temizle
    const cleanPhone = phoneNumber.replace(/^\+?90/, '').replace(/^0/, '');

    // Test/review numaraları sabit OTP (123456) ile doğrulanır (review aktifse)
    if (isReviewActivePhone(cleanPhone) && otp === TEST_OTP_CODE) {
      console.log(`[SMS] Test OTP verified for ${cleanPhone}`);
      return true;
    }

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

