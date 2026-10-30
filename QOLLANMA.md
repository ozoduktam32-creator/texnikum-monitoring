# Kasbiy Ta'lim: Texnikum Amaliyot Sifatini Nazorat Qilish Tizimi

Ushbu tizim kasbiy taʼlim texnikumlarida oʻquvchilar ishlab chiqarish va malakaviy amaliyotga chiqqanlarida ularning real geolokatsiyasini (GPS) kuzatish, korxona hududida yoki tashqarida ekanliklarini avtomatik aniqlash uchun yaratilgan.

---

## 📁 Loyiha manzili
`d:\texnikum_monitoring\`

---

## 🚀 Tizimning tarkibi va ishga tushirish

Hozirda tizim kompyuteringizda to'liq ishga tushirilgan va fon rejimida ishlab turibdi:

### 1. Nazoratchi (Bo‘lim boshlig‘i) Boshqaruv Paneli
- **Manzil:** [http://localhost:3000](http://localhost:3000)
- **Imkoniyatlari:**
  - **Interaktiv Xarita (OpenStreetMap):** Korxonalar zonalari va barcha o‘quvchilar real vaqtda ko‘rinadi.
  - **Yashil / Qizil indikatorlar:** Korxona zonasida (masalan 200m radiusda) bo‘lsa — **yashil**, tashqarida bo‘lsa — **qizil** belgi va masofasi ko‘rsatiladi.
  - **O‘quvchi va Korxona qo‘shish:** Xarita orqali yangi korxonalar va ularga biriktirilgan talabalarni kiritish.
  - **Eksport:** Davomat va so‘nggi lokatsiyalar ro‘yxatini bitta tugma bilan Excel (`.csv`) fayl sifatida yuklab olish.
  - **Guruhlar bo‘yicha filtr:** Guruhlar va qidiruv bo‘yicha tezkor saralash.

### 2. O‘quvchi Kabineti (Telegram WebApp / Mobil ko‘rinish)
- **Manzil:** [http://localhost:3000/student.html](http://localhost:3000/student.html)
- **Qanday ishlaydi:**
  - O‘quvchi o‘z ID raqamini kiritadi (masalan: `T-101`, `T-102`, `T-103`).
  - **"Amaliyotni Boshlash (Geolokatsiyani yoqish)"** tugmasini bosadi.
  - Brauzer/Telegram GPS ruxsatini so‘raydi. Ruxsat berilgach, tizim har 30 soniya (yoki belgilangan daqiqa) oralig‘ida o‘quvchi koordinatasini serverga uzatadi.
  - O‘quvchiga o‘zining amaliyot hududida ekanligi yoki qancha metr uzoqda ekanligi ko‘rsatiladi.

### 3. Telegram Bot (ixtiyoriy, qo‘shish uchun tayyor)
- Fayl: `d:\texnikum_monitoring\bot.js`
- `@BotFather` orqali yangi bot yaratib, uning `BOT_TOKEN`ini kiritib qo‘ysangiz, o‘quvchilar to‘g‘ridan-to‘g‘ri Telegram bot orqali bitta tugma bilan kabinetni ocha oladilar.

---

## 🛠 Tizimni qayta ishga tushirish buyrug‘i
Agar kompyuterni o‘chirib yoqsangiz, buyruqlar satrida (PowerShell):
```powershell
cd d:\texnikum_monitoring
node server.js
```
buyrug‘ini bajarishingiz kifoya.
