import * as crypto from 'crypto';

const DEFAULT_PARAM_POS_URL = 'https://posws.param.com.tr/turkpos.ws/service_turkpos_prod.asmx';
const DEFAULT_PARAM_3D_GATEWAY_URL = 'https://test-pos.param.com.tr:4443/3D_Secure/AkilliKart_3DPay_EST.aspx';
const PARAM_NAMESPACE = 'https://turkpos.com.tr/';

export interface ParamCardPayload {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  cvc: string;
  phone?: string;
}

export interface ParamPaymentRequest {
  amount: number;
  orderId: string;
  description: string;
  successUrl: string;
  errorUrl: string;
  clientIp: string;
  refUrl?: string;
  data1?: string;
  data2?: string;
  data3?: string;
  data4?: string;
  data5?: string;
  card: ParamCardPayload;
}

export interface ParamInitResponse {
  resultCode: number;
  resultMessage: string;
  transactionId?: string;
  redirectUrl?: string;
  bankResultCode?: string;
  rawResponse: string;
}

export interface ParamCallbackPayload {
  TURKPOS_RETVAL_Sonuc?: string;
  TURKPOS_RETVAL_Sonuc_Str?: string;
  TURKPOS_RETVAL_GUID?: string;
  TURKPOS_RETVAL_Islem_Tarih?: string;
  TURKPOS_RETVAL_Dekont_ID?: string;
  TURKPOS_RETVAL_Tahsilat_Tutari?: string;
  TURKPOS_RETVAL_Odeme_Tutari?: string;
  TURKPOS_RETVAL_Siparis_ID?: string;
  TURKPOS_RETVAL_Islem_ID?: string;
  TURKPOS_RETVAL_Ext_Data?: string;
  TURKPOS_RETVAL_Banka_Sonuc_Kod?: string;
  TURKPOS_RETVAL_Hash?: string;
  [key: string]: unknown;
}

function getConfig() {
  const clientCode = process.env.PARAM_CLIENT_CODE;
  const clientUsername = process.env.PARAM_CLIENT_USERNAME;
  const clientPassword = process.env.PARAM_CLIENT_PASSWORD;
  const guid = process.env.PARAM_GUID;

  if (!clientCode || !clientUsername || !clientPassword || !guid) {
    throw new Error('Param POS yapılandırması eksik. PARAM_CLIENT_CODE, PARAM_CLIENT_USERNAME, PARAM_CLIENT_PASSWORD ve PARAM_GUID ayarlanmalıdır.');
  }

  return {
    clientCode,
    clientUsername,
    clientPassword,
    guid,
    serviceUrl: process.env.PARAM_POS_URL || DEFAULT_PARAM_POS_URL,
    gatewayUrl: process.env.PARAM_3D_GATEWAY_URL || DEFAULT_PARAM_3D_GATEWAY_URL,
  };
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXmlEntities(value?: string): string | undefined {
  if (!value) {
    return value;
  }

  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractTag(xml: string, tagName: string): string | undefined {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = xml.match(pattern);
  return match?.[1]?.trim();
}

function normalizeAmount(amount: number): string {
  return amount.toFixed(2).replace('.', ',');
}

function normalizeCallbackAmount(amount?: string): string {
  if (!amount) {
    return '0,00';
  }

  const trimmed = String(amount).trim();
  if (trimmed.includes(',')) {
    return trimmed;
  }

  const asNumber = Number(trimmed);
  if (Number.isNaN(asNumber)) {
    return trimmed;
  }

  return normalizeAmount(asNumber);
}

function normalizePhone(phone?: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  if (digits.length === 10) {
    return digits;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }

  if (digits.length === 12 && digits.startsWith('90')) {
    return digits.slice(2);
  }

  return digits.slice(-10);
}

function normalizeCardNumber(cardNumber: string): string {
  return cardNumber.replace(/\D/g, '');
}

function normalizeExpiryYear(year: string): string {
  const digits = year.replace(/\D/g, '');
  if (digits.length === 2) {
    return `20${digits}`;
  }
  return digits;
}

function sha1Base64(value: string): string {
  return crypto.createHash('sha1').update(value, 'utf8').digest('base64');
}

function buildPosOdemeEnvelope(payload: ParamPaymentRequest): string {
  const { clientCode, clientUsername, clientPassword, guid } = getConfig();
  const amount = normalizeAmount(payload.amount);
  const transactionHash = sha1Base64(
    `${clientCode}${guid}1${amount}${amount}${payload.orderId}${payload.errorUrl}${payload.successUrl}`
  );

  const values = {
    holderName: xmlEscape(payload.card.holderName),
    cardNumber: xmlEscape(normalizeCardNumber(payload.card.number)),
    expiryMonth: xmlEscape(payload.card.expiryMonth.replace(/\D/g, '').padStart(2, '0')),
    expiryYear: xmlEscape(normalizeExpiryYear(payload.card.expiryYear)),
    cvc: xmlEscape(payload.card.cvc.replace(/\D/g, '')),
    phone: xmlEscape(normalizePhone(payload.card.phone)),
    successUrl: xmlEscape(payload.successUrl),
    errorUrl: xmlEscape(payload.errorUrl),
    orderId: xmlEscape(payload.orderId),
    description: xmlEscape(payload.description),
    amount: xmlEscape(amount),
    transactionHash: xmlEscape(transactionHash),
    clientIp: xmlEscape(payload.clientIp),
    refUrl: xmlEscape(payload.refUrl || ''),
    data1: xmlEscape(payload.data1 || ''),
    data2: xmlEscape(payload.data2 || ''),
    data3: xmlEscape(payload.data3 || ''),
    data4: xmlEscape(payload.data4 || ''),
    data5: xmlEscape(payload.data5 || ''),
  };

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Pos_Odeme xmlns="${PARAM_NAMESPACE}">
      <G>
        <CLIENT_CODE>${xmlEscape(clientCode)}</CLIENT_CODE>
        <CLIENT_USERNAME>${xmlEscape(clientUsername)}</CLIENT_USERNAME>
        <CLIENT_PASSWORD>${xmlEscape(clientPassword)}</CLIENT_PASSWORD>
      </G>
      <GUID>${xmlEscape(guid)}</GUID>
      <KK_Sahibi>${values.holderName}</KK_Sahibi>
      <KK_No>${values.cardNumber}</KK_No>
      <KK_SK_Ay>${values.expiryMonth}</KK_SK_Ay>
      <KK_SK_Yil>${values.expiryYear}</KK_SK_Yil>
      <KK_CVC>${values.cvc}</KK_CVC>
      <KK_Sahibi_GSM>${values.phone}</KK_Sahibi_GSM>
      <Hata_URL>${values.errorUrl}</Hata_URL>
      <Basarili_URL>${values.successUrl}</Basarili_URL>
      <Siparis_ID>${values.orderId}</Siparis_ID>
      <Siparis_Aciklama>${values.description}</Siparis_Aciklama>
      <Taksit>1</Taksit>
      <Islem_Tutar>${values.amount}</Islem_Tutar>
      <Toplam_Tutar>${values.amount}</Toplam_Tutar>
      <Islem_Hash>${values.transactionHash}</Islem_Hash>
      <Islem_Guvenlik_Tip>3D</Islem_Guvenlik_Tip>
      <Islem_ID>${values.orderId}</Islem_ID>
      <IPAdr>${values.clientIp}</IPAdr>
      <Ref_URL>${values.refUrl}</Ref_URL>
      <Data1>${values.data1}</Data1>
      <Data2>${values.data2}</Data2>
      <Data3>${values.data3}</Data3>
      <Data4>${values.data4}</Data4>
      <Data5>${values.data5}</Data5>
      <Data6></Data6>
      <Data7></Data7>
      <Data8></Data8>
      <Data9></Data9>
      <Data10></Data10>
    </Pos_Odeme>
  </soap:Body>
</soap:Envelope>`;
}

function normalizeRedirectUrl(redirectUrl: string): string {
  const { gatewayUrl } = getConfig();

  if (/^https?:\/\//i.test(redirectUrl)) {
    return redirectUrl;
  }

  if (redirectUrl.startsWith('rURL=')) {
    return `${gatewayUrl}?${redirectUrl}`;
  }

  if (redirectUrl.startsWith('/')) {
    const serviceUrl = new URL(getConfig().serviceUrl);
    return `${serviceUrl.origin}${redirectUrl}`;
  }

  return `${gatewayUrl}?${redirectUrl}`;
}

export async function initiateParam3DPayment(payload: ParamPaymentRequest): Promise<ParamInitResponse> {
  const envelope = buildPosOdemeEnvelope(payload);
  const { serviceUrl } = getConfig();

  const response = await fetch(serviceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `${PARAM_NAMESPACE}Pos_Odeme`,
    },
    body: envelope,
  });

  const rawResponse = await response.text();

  if (!response.ok) {
    throw new Error(`Param POS isteği başarısız oldu (${response.status}).`);
  }

  const resultCode = Number(extractTag(rawResponse, 'Sonuc') || '0');
  const resultMessage = decodeXmlEntities(extractTag(rawResponse, 'Sonuc_Str')) || 'Param ödeme isteği başarısız oldu.';
  const redirectUrl = decodeXmlEntities(extractTag(rawResponse, 'UCD_URL'));
  const transactionId = decodeXmlEntities(extractTag(rawResponse, 'Islem_ID'));
  const bankResultCode = decodeXmlEntities(extractTag(rawResponse, 'Banka_Sonuc_Kod'));

  return {
    resultCode,
    resultMessage,
    transactionId,
    redirectUrl: redirectUrl ? normalizeRedirectUrl(redirectUrl) : undefined,
    bankResultCode,
    rawResponse,
  };
}

export function verifyParamCallbackHash(payload: ParamCallbackPayload): boolean {
  const { clientCode, guid } = getConfig();
  const receiptId = payload.TURKPOS_RETVAL_Dekont_ID || '0';
  const amount =
    normalizeCallbackAmount(payload.TURKPOS_RETVAL_Tahsilat_Tutari) ||
    normalizeCallbackAmount(payload.TURKPOS_RETVAL_Odeme_Tutari);
  const orderId = payload.TURKPOS_RETVAL_Siparis_ID || '';
  const transactionId = payload.TURKPOS_RETVAL_Islem_ID || '';
  const returnedHash = String(payload.TURKPOS_RETVAL_Hash || '').trim();

  const expectedHash = sha1Base64(`${clientCode}${guid}${receiptId}${amount}${orderId}${transactionId}`);
  return returnedHash === expectedHash;
}

export function getParamGuid(): string {
  return getConfig().guid;
}
