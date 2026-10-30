const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'monitoring.db');
const PUBLIC_DIR = path.join(__dirname, 'public');

// --- DATABASE INITIALIZATION ---
const db = new DatabaseSync(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    direction TEXT,
    group_leader_id INTEGER,
    practice_leader_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL, -- 'group_leader' yoki 'practice_leader'
    telegram_user_id TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radius_meters REAL DEFAULT 200,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    group_name TEXT NOT NULL,
    group_id INTEGER,
    phone TEXT,
    home_address TEXT,
    company_name_manual TEXT,
    company_id INTEGER,
    telegram_user_id TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(group_id) REFERENCES groups(id)
  );

  CREATE TABLE IF NOT EXISTS attendance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    distance_meters REAL,
    is_inside_zone INTEGER, -- 1 = inside, 0 = outside
    battery_level INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES students(id)
  );
`);

// Add columns if table already existed
try { db.exec('ALTER TABLE students ADD COLUMN group_id INTEGER;'); } catch(e){}
try { db.exec('ALTER TABLE students ADD COLUMN home_address TEXT;'); } catch(e){}
try { db.exec('ALTER TABLE students ADD COLUMN company_name_manual TEXT;'); } catch(e){}

// Pre-populate sample groups if empty
const countGroups = db.prepare('SELECT count(*) as count FROM groups').get();
if (countGroups.count === 0) {
  const insertGrp = db.prepare('INSERT OR IGNORE INTO groups (name, direction) VALUES (?, ?)');
  insertGrp.run('AT-21', 'Axborot texnologiyalari');
  insertGrp.run('AT-22', 'Axborot texnologiyalari');
  insertGrp.run('AVTO-11', 'Avtomobilsozlik');
}
const countStmt = db.prepare('SELECT count(*) as count FROM companies');
const { count } = countStmt.get();
if (count === 0) {
  const insertComp = db.prepare(`
    INSERT INTO companies (name, address, latitude, longitude, radius_meters)
    VALUES (?, ?, ?, ?, ?)
  `);
  // Example 1: Yozyovon markazi / Texnikum va Korxonalar
  insertComp.run('Yozyovon 1-sonli Kasb-hunar Texnikumi bazasi', 'Farg‘ona vil., Yozyovon t., Markaziy ko‘cha', 40.661900, 71.743100, 300);
  insertComp.run('Yozyovon Agrotexservis MCHJ', 'Farg‘ona vil., Yozyovon tumani', 40.658200, 71.738500, 250);

  const insertStud = db.prepare(`
    INSERT INTO students (student_id, full_name, group_name, phone, company_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertStud.run('T-101', 'Aliyev Valijon Karim o‘g‘li', 'AT-21', '+998901234567', 1);
  insertStud.run('T-102', 'Karimova Dilnoza Akbar qizi', 'AT-21', '+998902345678', 1);
  insertStud.run('T-103', 'Sobirov Jamshid Rustam o‘g‘li', 'AT-22', '+998903456789', 2);
  insertStud.run('T-104', 'Nazarov Bobur Sherzod o‘g‘li', 'AT-22', '+998904567890', 2);
  console.log('Boshlang‘ich namunaviy maʼlumotlar kiritildi.');
}

// --- HELPER FUNCTIONS ---
// Haversine formula: calculates distance between two points in meters
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const toRad = deg => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// --- HTTP SERVER ---
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  try {
    // --- API ROUTES ---

    // 0. POST /api/admin/login
    if (req.method === 'POST' && pathname === '/api/admin/login') {
      const data = await parseJsonBody(req);
      if (data.username === 'superadmin' && data.password === 'yozyovon1') {
        const token = 'token_' + Buffer.from('superadmin:' + Date.now()).toString('base64');
        return sendJson(res, 200, { success: true, token, role: 'superadmin' });
      } else {
        return sendJson(res, 401, { success: false, message: 'Login yoki parol noto‘g‘ri!' });
      }
    }

    // --- GROUPS CRUD ---
    // GET /api/groups
    if (req.method === 'GET' && pathname === '/api/groups') {
      const stmt = db.prepare(`
        SELECT 
          g.*,
          gl.full_name as group_leader_name, gl.phone as group_leader_phone,
          pl.full_name as practice_leader_name, pl.phone as practice_leader_phone,
          (SELECT COUNT(*) FROM students s WHERE s.group_id = g.id OR s.group_name = g.name) as student_count
        FROM groups g
        LEFT JOIN staff gl ON g.group_leader_id = gl.id
        LEFT JOIN staff pl ON g.practice_leader_id = pl.id
        ORDER BY g.name
      `);
      const groups = stmt.all();
      return sendJson(res, 200, { success: true, groups });
    }

    // POST /api/groups
    if (req.method === 'POST' && pathname === '/api/groups') {
      const data = await parseJsonBody(req);
      if (!data.name) return sendJson(res, 400, { success: false, message: 'Guruh nomi kiritilishi shart' });
      try {
        const stmt = db.prepare('INSERT INTO groups (name, direction, group_leader_id, practice_leader_id) VALUES (?, ?, ?, ?)');
        const result = stmt.run(data.name, data.direction || '', data.group_leader_id || null, data.practice_leader_id || null);
        return sendJson(res, 201, { success: true, id: result.lastInsertRowid });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: 'Bu guruh allaqachon mavjud' });
      }
    }

    // PUT /api/groups - assign leaders or rename
    if (req.method === 'PUT' && pathname === '/api/groups') {
      const data = await parseJsonBody(req);
      if (!data.id) return sendJson(res, 400, { success: false, message: 'Guruh ID talab qilinadi' });
      db.prepare(`
        UPDATE groups 
        SET name = ?, direction = ?, group_leader_id = ?, practice_leader_id = ?
        WHERE id = ?
      `).run(data.name, data.direction || '', data.group_leader_id || null, data.practice_leader_id || null, data.id);
      return sendJson(res, 200, { success: true, message: 'Guruh yangilandi' });
    }

    // DELETE /api/groups
    if (req.method === 'DELETE' && pathname === '/api/groups') {
      const id = parsedUrl.searchParams.get('id');
      if (!id) return sendJson(res, 400, { success: false, message: 'ID kerak' });
      db.prepare('DELETE FROM groups WHERE id = ?').run(id);
      return sendJson(res, 200, { success: true, message: 'Guruh o‘chirildi' });
    }

    // --- STAFF CRUD (Guruh rahbari / Amaliyot rahbari) ---
    // GET /api/staff
    if (req.method === 'GET' && pathname === '/api/staff') {
      const role = parsedUrl.searchParams.get('role');
      let query = 'SELECT * FROM staff';
      if (role) query += ' WHERE role = ' + (role === 'group_leader' ? "'group_leader'" : "'practice_leader'");
      query += ' ORDER BY full_name';
      const staffList = db.prepare(query).all();
      return sendJson(res, 200, { success: true, staff: staffList });
    }

    // POST /api/staff/register - From telegram bot
    if (req.method === 'POST' && pathname === '/api/staff/register') {
      const data = await parseJsonBody(req);
      const { full_name, phone, role, telegram_user_id } = data;
      const existing = db.prepare('SELECT id FROM staff WHERE telegram_user_id = ?').get(String(telegram_user_id));
      if (existing) {
        db.prepare('UPDATE staff SET full_name = ?, phone = ?, role = ? WHERE id = ?')
          .run(full_name, phone || '', role, existing.id);
        return sendJson(res, 200, { success: true, id: existing.id, message: 'Rahbar maʼlumotlari yangilandi' });
      } else {
        const result = db.prepare('INSERT INTO staff (full_name, phone, role, telegram_user_id) VALUES (?, ?, ?, ?)')
          .run(full_name, phone || '', role, String(telegram_user_id));
        return sendJson(res, 201, { success: true, id: result.lastInsertRowid, message: 'Rahbar ro‘yxatga olindi' });
      }
    }

    // GET /api/staff/my-students - Rahbar o'ziga biriktirilgan guruh talabalarini ko'rishi uchun
    if (req.method === 'GET' && pathname === '/api/staff/my-students') {
      const tgUserId = parsedUrl.searchParams.get('tg_id');
      if (!tgUserId) return sendJson(res, 400, { success: false, message: 'tg_id kerak' });

      const staffMember = db.prepare('SELECT * FROM staff WHERE telegram_user_id = ?').get(String(tgUserId));
      if (!staffMember) {
        return sendJson(res, 404, { success: false, message: 'Siz rahbar sifatida tizimda topilmadingiz' });
      }

      // Find groups assigned to this leader
      const assignedGroups = db.prepare(`
        SELECT * FROM groups WHERE group_leader_id = ? OR practice_leader_id = ?
      `).all(staffMember.id, staffMember.id);

      const groupNames = assignedGroups.map(g => g.name);
      const groupIds = assignedGroups.map(g => g.id);

      let students = [];
      if (groupNames.length > 0) {
        const placeholders = groupNames.map(() => '?').join(',');
        students = db.prepare(`
          SELECT 
            s.id, s.student_id, s.full_name, s.group_name, s.phone, s.home_address,
            COALESCE(c.name, s.company_name_manual, 'Biriktirilmagan') as company_name,
            c.latitude as company_lat, c.longitude as company_lng, c.radius_meters,
            l.latitude as last_lat, l.longitude as last_lng, l.distance_meters,
            l.is_inside_zone, l.created_at as last_seen
          FROM students s
          LEFT JOIN companies c ON s.company_id = c.id
          LEFT JOIN (
            SELECT * FROM attendance_logs 
            WHERE id IN (SELECT MAX(id) FROM attendance_logs GROUP BY student_id)
          ) l ON s.id = l.student_id
          WHERE s.group_name IN (${placeholders})
          ORDER BY s.full_name
        `).all(...groupNames);
      }

      return sendJson(res, 200, {
        success: true,
        staff: staffMember,
        assigned_groups: assignedGroups,
        students: students
      });
    }
    if (req.method === 'GET' && pathname === '/api/companies') {
      const stmt = db.prepare('SELECT * FROM companies ORDER BY name');
      const companies = stmt.all();
      return sendJson(res, 200, { success: true, companies });
    }

    // 2. POST /api/companies - add company
    if (req.method === 'POST' && pathname === '/api/companies') {
      const data = await parseJsonBody(req);
      if (!data.name || !data.latitude || !data.longitude) {
        return sendJson(res, 400, { success: false, message: 'Nomi va koordinatalar kiritilishi shart' });
      }
      const radius = parseFloat(data.radius_meters) || 200;
      const stmt = db.prepare(`
        INSERT INTO companies (name, address, latitude, longitude, radius_meters)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = stmt.run(data.name, data.address || '', parseFloat(data.latitude), parseFloat(data.longitude), radius);
      return sendJson(res, 201, { success: true, id: result.lastInsertRowid });
    }

    // 3. GET /api/students - list students with their companies and latest status
    if (req.method === 'GET' && pathname === '/api/students') {
      const stmt = db.prepare(`
        SELECT 
          s.id, s.student_id, s.full_name, s.group_name, s.phone, s.home_address, s.company_name_manual, s.company_id,
          COALESCE(c.name, s.company_name_manual, 'Biriktirilmagan') as company_name, 
          c.latitude as company_lat, c.longitude as company_lng, c.radius_meters,
          l.latitude as last_lat, l.longitude as last_lng, l.accuracy, l.distance_meters,
          l.is_inside_zone, l.battery_level, l.created_at as last_seen
        FROM students s
        LEFT JOIN companies c ON s.company_id = c.id
        LEFT JOIN (
          SELECT * FROM attendance_logs 
          WHERE id IN (SELECT MAX(id) FROM attendance_logs GROUP BY student_id)
        ) l ON s.id = l.student_id
        ORDER BY s.group_name, s.full_name
      `);
      const students = stmt.all();
      return sendJson(res, 200, { success: true, students });
    }

    // 4. POST /api/students/register - Telegram bot auto register
    if (req.method === 'POST' && pathname === '/api/students/register') {
      const data = await parseJsonBody(req);
      const { telegram_user_id, full_name, group_name, phone, home_address, company_name } = data;

      if (!full_name || !group_name) {
        return sendJson(res, 400, { success: false, message: 'F.I.SH va guruh talab qilinadi' });
      }

      // Check if student exists by telegram_user_id
      const existing = db.prepare('SELECT id FROM students WHERE telegram_user_id = ?').get(String(telegram_user_id));
      if (existing) {
        db.prepare(`
          UPDATE students 
          SET full_name = ?, group_name = ?, phone = ?, home_address = ?, company_name_manual = ?
          WHERE id = ?
        `).run(full_name, group_name, phone || '', home_address || '', company_name || '', existing.id);
        return sendJson(res, 200, { success: true, id: existing.id, message: 'Maʼlumotlar yangilandi' });
      } else {
        const student_id = 'Y-' + Math.floor(1000 + Math.random() * 9000);
        const result = db.prepare(`
          INSERT INTO students (student_id, full_name, group_name, phone, home_address, company_name_manual, telegram_user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(student_id, full_name, group_name, phone || '', home_address || '', company_name || '', String(telegram_user_id));
        return sendJson(res, 201, { success: true, id: result.lastInsertRowid, student_id, message: 'Ro‘yxatdan o‘tdi' });
      }
    }

    // 4. POST /api/students - add student
    if (req.method === 'POST' && pathname === '/api/students') {
      const data = await parseJsonBody(req);
      if (!data.student_id || !data.full_name || !data.group_name) {
        return sendJson(res, 400, { success: false, message: 'Oʻquvchi ID, F.I.SH va guruh talab qilinadi' });
      }
      const stmt = db.prepare(`
        INSERT INTO students (student_id, full_name, group_name, phone, company_id)
        VALUES (?, ?, ?, ?, ?)
      `);
      try {
        const result = stmt.run(data.student_id, data.full_name, data.group_name, data.phone || '', data.company_id || null);
        return sendJson(res, 201, { success: true, id: result.lastInsertRowid });
      } catch (err) {
        return sendJson(res, 400, { success: false, message: 'Bu o‘quvchi ID si allaqachon mavjud' });
      }
    }

    // PUT /api/students - edit student
    if (req.method === 'PUT' && pathname === '/api/students') {
      const data = await parseJsonBody(req);
      if (!data.id || !data.full_name || !data.group_name) {
        return sendJson(res, 400, { success: false, message: 'ID, F.I.SH va guruh talab qilinadi' });
      }
      db.prepare(`
        UPDATE students
        SET full_name = ?, group_name = ?, phone = ?, home_address = ?, company_name_manual = ?, company_id = ?
        WHERE id = ?
      `).run(data.full_name, data.group_name, data.phone || '', data.home_address || '', data.company_name_manual || '', data.company_id || null, data.id);
      return sendJson(res, 200, { success: true, message: 'O‘quvchi maʼlumotlari yangilandi' });
    }

    // PUT /api/companies - edit company
    if (req.method === 'PUT' && pathname === '/api/companies') {
      const data = await parseJsonBody(req);
      if (!data.id || !data.name || !data.latitude || !data.longitude) {
        return sendJson(res, 400, { success: false, message: 'ID, nom va koordinatalar talab qilinadi' });
      }
      db.prepare(`
        UPDATE companies
        SET name = ?, address = ?, latitude = ?, longitude = ?, radius_meters = ?
        WHERE id = ?
      `).run(data.name, data.address || '', parseFloat(data.latitude), parseFloat(data.longitude), parseFloat(data.radius_meters) || 200, data.id);
      return sendJson(res, 200, { success: true, message: 'Korxona maʼlumotlari yangilandi' });
    }
    if (req.method === 'DELETE' && pathname === '/api/students') {
      const id = parsedUrl.searchParams.get('id');
      if (!id) return sendJson(res, 400, { success: false, message: 'ID ko‘rsatilmadi' });
      db.prepare('DELETE FROM attendance_logs WHERE student_id = ?').run(id);
      db.prepare('DELETE FROM students WHERE id = ?').run(id);
      return sendJson(res, 200, { success: true, message: 'O‘quvchi o‘chirildi' });
    }

    // DELETE /api/companies
    if (req.method === 'DELETE' && pathname === '/api/companies') {
      const id = parsedUrl.searchParams.get('id');
      if (!id) return sendJson(res, 400, { success: false, message: 'ID ko‘rsatilmadi' });
      db.prepare('UPDATE students SET company_id = NULL WHERE company_id = ?').run(id);
      db.prepare('DELETE FROM companies WHERE id = ?').run(id);
      return sendJson(res, 200, { success: true, message: 'Korxona o‘chirildi' });
    }

    // 5. POST /api/location - Student submits location (Telegram WebApp or Bot calls this)
    if (req.method === 'POST' && pathname === '/api/location') {
      const data = await parseJsonBody(req);
      const { student_id_code, telegram_user_id, latitude, longitude, accuracy, battery_level } = data;

      if ((!student_id_code && !telegram_user_id) || latitude === undefined || longitude === undefined) {
        return sendJson(res, 400, { success: false, message: 'Koordinatalar yoki student_id yetarli emas' });
      }

      // Find student by student_id or telegram_user_id
      let student = null;
      if (telegram_user_id) {
        student = db.prepare(`
          SELECT s.id, s.company_id, c.latitude as c_lat, c.longitude as c_lng, c.radius_meters
          FROM students s
          LEFT JOIN companies c ON s.company_id = c.id
          WHERE s.telegram_user_id = ?
        `).get(String(telegram_user_id));
      }
      if (!student && student_id_code) {
        student = db.prepare(`
          SELECT s.id, s.company_id, c.latitude as c_lat, c.longitude as c_lng, c.radius_meters
          FROM students s
          LEFT JOIN companies c ON s.company_id = c.id
          WHERE s.student_id = ?
        `).get(student_id_code);
      }

      if (!student) {
        return sendJson(res, 404, { success: false, message: 'O‘quvchi topilmadi' });
      }

      let distance = null;
      let isInside = 0;

      if (student.company_id && student.c_lat && student.c_lng) {
        distance = getDistanceMeters(latitude, longitude, student.c_lat, student.c_lng);
        isInside = distance <= student.radius_meters ? 1 : 0;
      }

      const logStmt = db.prepare(`
        INSERT INTO attendance_logs (student_id, latitude, longitude, accuracy, distance_meters, is_inside_zone, battery_level)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      logStmt.run(student.id, latitude, longitude, accuracy || 0, distance, isInside, battery_level || null);

      return sendJson(res, 200, {
        success: true,
        is_inside_zone: isInside === 1,
        distance_meters: distance,
        message: isInside ? 'Amaliyot hududi tasdiqlandi' : (distance ? `Siz amaliyot zonasidan ${distance} metr uzoqdasiz!` : 'Koordinatangiz qabul qilindi')
      });
    }

    // 6. GET /api/history - student trace history
    if (req.method === 'GET' && pathname === '/api/history') {
      const studentId = parsedUrl.searchParams.get('student_id');
      if (!studentId) return sendJson(res, 400, { success: false, message: 'student_id kerak' });

      const stmt = db.prepare(`
        SELECT l.*, s.full_name
        FROM attendance_logs l
        JOIN students s ON l.student_id = s.id
        WHERE s.id = ? OR s.student_id = ?
        ORDER BY l.created_at DESC
        LIMIT 50
      `);
      const logs = stmt.all(studentId, studentId);
      return sendJson(res, 200, { success: true, logs });
    }

    // 7. GET /api/export-csv - Download attendance as Excel-compatible CSV
    if (req.method === 'GET' && pathname === '/api/export-csv') {
      const stmt = db.prepare(`
        SELECT 
          s.student_id, s.full_name, s.group_name, s.phone, s.home_address,
          COALESCE(c.name, s.company_name_manual, '') as company_name,
          l.latitude, l.longitude, l.distance_meters,
          CASE WHEN l.is_inside_zone = 1 THEN 'Hududda (Amaliyotda)' ELSE 'Hududdan tashqarida' END as status,
          l.created_at as time
        FROM attendance_logs l
        JOIN students s ON l.student_id = s.id
        LEFT JOIN companies c ON s.company_id = c.id
        ORDER BY l.created_at DESC
      `);
      const rows = stmt.all();

      let csv = '\uFEFF'; // UTF-8 BOM for Microsoft Excel
      csv += 'O\'quvchi ID;F.I.SH;Guruhi;Telefon;Uy manzili;Amaliyot korxonasi;Kenglik;Uzunlik;Masofa (metr);Holati;Vaqt\n';
      for (const r of rows) {
        csv += `"${r.student_id}";"${r.full_name}";"${r.group_name}";"${r.phone}";"${r.home_address || ''}";"${r.company_name || ''}";"${r.latitude}";"${r.longitude}";"${r.distance_meters || ''}";"${r.status}";"${r.time}"\n`;
      }

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="amaliyot_monitoring_hisobot.csv"'
      });
      return res.end(csv);
    }

    // --- STATIC FILES SERVING ---
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);

  } catch (error) {
    console.error('Server xatolik:', error);
    sendJson(res, 500, { success: false, message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Texnikum Amaliyot Monitoring Tizimi ishga tushdi!`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`====================================================`);

  // Telegram botni server bilan birga ishga tushirish (Hostingda 24/7 ishlashi uchun)
  try {
    require('./bot.js');
    console.log('[Telegram Bot]: Server ichida parallel ishga tushirildi.');
  } catch (err) {
    console.error('[Telegram Bot Error]:', err);
  }
});
