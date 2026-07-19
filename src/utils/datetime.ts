// Türkiye saati (UTC+3) — ülke genelinde yaz saati uygulaması yok, sabit ofset.
const TR_OFFSET = '+03:00';

// Saat dilimi eki taşıyan ISO metinleri: "...Z" veya "...+03:00" / "...-05:00"
const HAS_TIMEZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * İstemciden gelen tarih/saat metnini DOĞRU saat diliminde ayrıştırır.
 *
 * Mobil uygulama `DateTime.toIso8601String()` kullandığında saat dilimi eki
 * OLMAYAN bir metin üretir ("2026-07-20T00:30:00.000"). Sunucu UTC olduğu için
 * Node bunu UTC sanıp kaydediyordu ve tüm saatler 3 saat ileri kayıyordu
 * (hayır dağıtımının bitişine "3 sa 19 dk kaldı" görünmesinin sebebi buydu).
 *
 * Kural: ek varsa olduğu gibi güvenilir; yoksa Türkiye saati kabul edilir.
 */
export function parseClientDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  // Yalnızca tarih ("2026-07-20") -> Türkiye'de günün başlangıcı
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00${TR_OFFSET}`);
    return isNaN(d.getTime()) ? null : d;
  }

  const normalized = HAS_TIMEZONE.test(raw) ? raw : `${raw}${TR_OFFSET}`;
  const parsed = new Date(normalized);
  return isNaN(parsed.getTime()) ? null : parsed;
}
