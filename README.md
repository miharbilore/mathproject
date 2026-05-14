# Math Test Book Generator

Bu proje, birden fazla API anahtarıyla matematik test kitapları üretmek ve JSON çıktılarından PDF oluşturmak için hazırlanmış bir Node.js betik setidir.

## Amaç ve Akış
- **Test üretimi (JSON):** LLM ile konu/kazanım bazlı 10 soruluk testler oluşturur.
- **PDF üretimi:** JSON testlerini LaTeX ile tek sayfalık PDF’e dönüştürür.
- **Kontrol yardımcıları:** Eksik testler, JSON doğrulama, dağılım analizi vb. araçlar içerir.

## Gereksinimler
- **Node.js 18+** (fetch ve modern JS özellikleri için)
- **LaTeX (pdflatex)** (PDF üretimi için)
- **API anahtarları** (aşağıda)

## Bağımlılıklar
Projede `package.json` yok. Çalıştırmadan önce:
```
npm init -y
npm i groq-sdk dotenv @google/generative-ai
```

## Ortam Değişkenleri (.env)
```
GROQ_API_KEY=...
GROQ_API_KEY_1=...
GROQ_API_KEY_2=...
GROQ_API_KEY_3=...
OPENROUTER_API_KEY=...
GEMINI_API_KEY=...
PDFLATEX_PATH=pdflatex
```

## Kullanım
- **Groq/OpenRouter ile tüm testleri üret:**  
  `node index.js`
- **Gemini ile eksikleri tamamla:**  
  `node fill_math_gaps.js`
- **PDF üretimi (json_files → pdf_files):**  
  `node generate-pdf.js`
- **Eksik test raporu:**  
  `node check_gaps.js`
- **Gemini model listesi:**  
  `node check-models.js`

### Scratch araçları
- JSON doğrulama: `node scratch/validate_jsons.js`
- Dağılım analizi: `node scratch/analyze_distribution.js`
- Hatalı isimli dosyaları temizleme: `node scratch/cleanup_wrong_files.js`

## Çıktı Yapısı
```
Unit_*/<Subtopic>/json_files/*.json
Unit_*/<Subtopic>/pdf_files/*.pdf
```

## Aynı İşi Yapan / Benzer Dosyalar
- `index.js` ve `fill_math_gaps.js`: Aynı müfredat okuma, seviye eşleme ve test üretim akışını iki farklı LLM sağlayıcısıyla yapıyor. Ortak modüle taşınabilir.
- `test_sanitizer.js` ve `fill_math_gaps.js`: Aynı klasör adı temizleme mantığı tekrarlanıyor.
- `check_gaps.js` ile `scratch/validate_jsons.js`/`scratch/analyze_distribution.js`: Hepsi klasör tarama ve raporlama işi yapıyor; ortak bir “scan” yardımcı fonksiyonu paylaşılabilir.

## Deploy Öncesi Öneriler
1. **`.env` dosyasını gitignore’a ekleyin** ve `.env.example` oluşturun.
2. **package.json ve kilit dosyası** ekleyerek bağımlılıkları sabitleyin.
3. **Node sürümü sabitleme** (örn. `.nvmrc`/`engines`).
4. **JSON şema doğrulaması** (üretim öncesi kalite kontrol).
5. **Ortak yardımcı modül** (sanitize, parseCurriculum, getTestMeta).
6. **API kota/limit izleme** ve başarısız istekler için geri çekilme stratejisi.
7. **PDF üretim bağımlılığı** (pdflatex) için Docker veya CI imajı hazırlayın.
8. **Loglama/raporlama** standardı belirleyin (hata ve başarı kayıtları).

## Gemini Önerileri Değerlendirme
**Uygun ve değerli öneriler:**
- **Wolfram Alpha / Newton API:** Üretilen soruların cevap doğrulaması için iyi bir “doğrulama katmanı”.
- **KaTeX / MathJax (lokal):** LaTeX çıktısının hızlı önizlemesi için maliyetsiz.
- **ChartLink API:** Fonksiyon grafikleri gerekiyorsa hızlı görsel üretim için uygun.

**Opsiyonel veya sınırlı fayda:**
- **Numbers API:** Matematik testlerinde “ilginç bilgi” isteniyorsa eklenebilir; çekirdek akış için şart değil.
- **MathPix:** Görsel/PDF’den formül okuma odaklı; bu projede üretim tarafına doğrudan ihtiyaç yok.
- **Google Books / Open Library:** Kaynakça/bibliyografya gerekiyorsa kullanılabilir.

## Projeyi İyileştirmek İçin Öneriler
1. **LLM soyutlama katmanı** (Groq/OpenRouter/Gemini tek arayüz).
2. **Yanıt doğrulama** (mathjs veya dış API ile cevap kontrolü).
3. **JSON Schema + otomatik düzeltme** (bozuk JSON’ları yeniden üretme).
4. **Çoklu anahtar rotasyonu ve oran sınırı** (tek yapılandırma ile).
5. **Tekrarlı prompt parçalarını şablonlaştırma** (bakım kolaylığı).
6. **PDF üretim kuyruğu** (büyük hacimde üretim performansı için).
7. **CI pipeline** (JSON doğrulama + PDF üretim testi).
