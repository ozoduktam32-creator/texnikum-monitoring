/**
 * Telegram Bot (Yozyovon 1-son texnikumi - 3 xil rol: Talaba, Guruh rahbari, Amaliyot rahbari)
 */

const https = require('https');
const http = require('http');

const BOT_TOKEN = process.env.BOT_TOKEN || '8778762356:AAFQ31Cnt3kxRip_18dCaFEFn-HUTY8OdjI';
const BASE_DOMAIN = process.env.WEBAPP_URL ? process.env.WEBAPP_URL.replace('/student.html', '') : 'https://selection-connecting-weed-learners.trycloudflare.com';
const SERVER_API_URL = 'http://localhost:3000';

const userSessions = {};

function callTelegramApi(method, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve({ ok: false }); }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function postLocalApi(endpoint, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const req = http.request(`${SERVER_API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve({ ok: false }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

let offset = 0;

async function startBot() {
  console.log('[Telegram Bot]: Rollar bilan kengaytirilgan bot ishga tushdi...');

  while (true) {
    try {
      const res = await callTelegramApi('getUpdates', { offset, timeout: 30 });
      if (res.ok && res.result.length > 0) {
        for (const update of res.result) {
          offset = update.update_id + 1;
          const msg = update.message;
          const callbackQuery = update.callback_query;

          // Inline tugma bosilganda (Rollar tanlanganda)
          if (callbackQuery) {
            const userId = callbackQuery.from.id;
            const chatId = callbackQuery.message.chat.id;
            const data = callbackQuery.data;

            if (data.startsWith('role_')) {
              const role = data.replace('role_', '');
              userSessions[userId] = { role: role, step: 'ASK_PHONE', data: {} };

              let roleTitle = "Talaba / O'quvchi";
              if (role === 'group_leader') roleTitle = "Guruh Rahbari";
              if (role === 'practice_leader') roleTitle = "Amaliyot Rahbari";

              await callTelegramApi('sendMessage', {
                chat_id: chatId,
                text: `Siz <b>"${roleTitle}"</b> vazifasini tanladingiz.\n\nIltimos, pastdagi tugmani bosib <b>telefon raqamingizni yuboring</b>:`,
                parse_mode: 'HTML',
                reply_markup: {
                  keyboard: [
                    [{ text: "📱 Telefon raqamimni yuborish", request_contact: true }]
                  ],
                  resize_keyboard: true,
                  one_time_keyboard: true
                }
              });
            }
            continue;
          }

          if (!msg) continue;
          const chatId = msg.chat.id;
          const userId = msg.from.id;
          const text = msg.text ? msg.text.trim() : '';

          // /start BOSILGANDA - ROL TANLASH
          if (text === '/start') {
            await callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: `Assalomu alaykum, <b>${msg.from.first_name}</b>!\n\n🎓 <b>Yozyovon 1-son Kasb-hunar Texnikumi</b> amaliyot monitoringi tizimiga xush kelibsiz.\n\nIltimos, tizimdan foydalanish uchun <b>o'z vazifangizni (rolingizni) tanlang</b>:`,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "👨‍🎓 Men O'quvchiman (Talaba)", callback_data: "role_student" }
                  ],
                  [
                    { text: "👨‍🏫 Men Guruh Rahbariman", callback_data: "role_group_leader" }
                  ],
                  [
                    { text: "🏭 Men Amaliyot Rahbariman", callback_data: "role_practice_leader" }
                  ]
                ]
              }
            });
            continue;
          }

          const session = userSessions[userId];
          if (!session) {
            await callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: "Iltimos, ro'yxatdan o'tish uchun /start buyrug'ini bosing va rolingizni tanlang."
            });
            continue;
          }

          // 1. TELEFON RAQAMNI QABUL QILISH
          if (session.step === 'ASK_PHONE') {
            if (msg.contact) {
              session.data.phone = msg.contact.phone_number;
            } else if (text) {
              session.data.phone = text;
            } else {
              await callTelegramApi('sendMessage', { chat_id: chatId, text: "Iltimos, telefon raqamingizni yuboring." });
              continue;
            }

            session.step = 'ASK_NAME';
            await callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: "✅ Telefon raqamingiz qabul qilindi.\n\nEndi <b>Familiyangiz, Ismingiz va Sharifingizni</b> to'liq yozing:\n<i>(Masalan: Rustamov Sanjarbek Olim o'g'li)</i>",
              parse_mode: 'HTML',
              reply_markup: { remove_keyboard: true }
            });
            continue;
          }

          // 2. F.I.SH QABUL QILISH
          if (session.step === 'ASK_NAME') {
            session.data.full_name = text;

            // AGAR GURUH RAHBARI YOKI AMALIYOT RAHBARI BO'LSA:
            if (session.role === 'group_leader' || session.role === 'practice_leader') {
              try {
                await postLocalApi('/api/staff/register', {
                  telegram_user_id: userId,
                  full_name: session.data.full_name,
                  phone: session.data.phone,
                  role: session.role
                });
              } catch (e) {
                console.error(e);
              }

              const leaderKabinetUrl = `${BASE_DOMAIN}/leader.html?tg_id=${userId}`;
              const roleTitle = session.role === 'group_leader' ? 'Guruh Rahbari' : 'Amaliyot Rahbari';

              await callTelegramApi('sendMessage', {
                chat_id: chatId,
                text: `🎉 <b>Hurmatli ${session.data.full_name}!</b>\n\nSiz <b>"${roleTitle}"</b> sifatida muvaffaqiyatli ro'yxatdan o'tdingiz!\n\nSuper Admin sizni tegishli guruhlarga biriktirgach, o'z guruhingizdagi talabalarning real vaqtdagi amaliyot lokatsiyalarini quyidagi tugma orqali ko'rib turishingiz mumkin:`,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: "📊 Guruhim Monitoringi (Xarita)", web_app: { url: leaderKabinetUrl } }
                    ],
                    [
                      { text: "🌐 Brauzerda ochish", url: leaderKabinetUrl }
                    ]
                  ]
                }
              });
              delete userSessions[userId];
              continue;
            }

            // AGAR TALABA BO'LSA - GURUHINI SO'RAYMIZ
            session.step = 'ASK_GROUP';
            await callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: "✅ Qabul qilindi.\n\nO'qiydigan <b>Guruhingiz nomini</b> kiriting:\n<i>(Masalan: AT-21 yoki AVTO-11)</i>",
              parse_mode: 'HTML'
            });
            continue;
          }

          // 3. TALABA UCHUN: GURUH
          if (session.step === 'ASK_GROUP') {
            session.data.group_name = text;
            session.step = 'ASK_HOME';
            await callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: "✅ Guruhingiz qabul qilindi.\n\nEndi <b>Doimiy yashash (Uy) manzilingizni</b> yozing:\n<i>(Masalan: Yozyovon t., Guliston QFY, Navoiy ko'chasi 15-uy)</i>",
              parse_mode: 'HTML'
            });
            continue;
          }

          // 4. TALABA UCHUN: UY MANZILI
          if (session.step === 'ASK_HOME') {
            session.data.home_address = text;
            session.step = 'ASK_COMPANY';
            await callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: "✅ Manzilingiz qabul qilindi.\n\nEndi <b>Amaliyot o'tayotgan korxona / tashkilot nomini</b> yozing:\n<i>(Masalan: Yozyovon Agrotexservis MCHJ)</i>",
              parse_mode: 'HTML'
            });
            continue;
          }

          // 5. TALABA UCHUN: AMALIYOT KORXONASI VA TUGATISH
          if (session.step === 'ASK_COMPANY') {
            session.data.company_name = text;

            try {
              await postLocalApi('/api/students/register', {
                telegram_user_id: userId,
                full_name: session.data.full_name,
                group_name: session.data.group_name,
                phone: session.data.phone,
                home_address: session.data.home_address,
                company_name: session.data.company_name
              });
            } catch (err) {
              console.error(err);
            }

            const miniAppUrlWithUser = `${BASE_DOMAIN}/student.html?tg_id=${userId}&name=${encodeURIComponent(session.data.full_name)}&group=${encodeURIComponent(session.data.group_name)}`;

            await callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: `🎉 <b>Tabriklaymiz, ma'lumotlaringiz saqlandi va guruhga biriktirildi!</b>\n\n👤 F.I.SH: <b>${session.data.full_name}</b>\n👥 Guruh: <b>${session.data.group_name}</b>\n📞 Tel: <b>${session.data.phone}</b>\n🏠 Uy: <b>${session.data.home_address}</b>\n🏢 Korxona: <b>${session.data.company_name}</b>\n\n📍 Endi amaliyot joyida geolokatsiyangizni yoqish uchun pastdagi tugmani bosing:`,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "🚀 Amaliyot Lokatsiyasini Yoqish (GPS)", web_app: { url: miniAppUrlWithUser } }
                  ],
                  [
                    { text: "🌐 Brauzerda ochish", url: miniAppUrlWithUser }
                  ]
                ]
              }
            });
            delete userSessions[userId];
            continue;
          }
        }
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 4000));
    }
  }
}

startBot();
