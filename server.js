const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { randomBytes } = require('crypto');
const session = require('express-session');
const Excel = require('exceljs');
const bcrypt = require('bcrypt'); // Şifreleme için

const app = express();
const PORT = 3000;

const REGISTRATION_SECRET_KEY = "T9v$kL@82z!Qm#Xr5Wf^aJ6u*NbE+YcZ0Hd";

// --- OKUL KONUMU AYARLARI ---
const SCHOOL_LOCATION = { latitude: 40.32770084941743, longitude: 36.52636843116625};
const MAX_DISTANCE_METERS = 200; 

// --- VERİTABANI BAĞLANTISI ---
const db = new sqlite3.Database('./yoklama.db', (err) => {
    if (err) return console.error('Veritabanına bağlanırken hata:', err.message);
    
    console.log('SQLite veritabanına başarıyla bağlanıldı.');
    db.exec('PRAGMA journal_mode = WAL;', (err) => {
        if (err) console.error("PRAGMA WAL hatası:", err.message);

        // Öğretmenler tablosu
        db.run(`CREATE TABLE IF NOT EXISTS teachers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            fullName TEXT NOT NULL
        )`, (err) => { if (err) console.error("teachers tablosu oluşturulamadı:", err.message); });

        // Oturumlar tablosu (teacherId'ye bağlı)
        db.run(`CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY, 
            courseName TEXT NOT NULL, 
            createdAt DATETIME NOT NULL, 
            isActive BOOLEAN NOT NULL,
            teacherId INTEGER NOT NULL,
            FOREIGN KEY (teacherId) REFERENCES teachers (id)
        )`, (err) => { if (err) console.error("sessions tablosu oluşturulamadı:", err.message); });
        
        // Katılımcı tablosu (deviceId'li)
        db.run(`CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, studentId TEXT NOT NULL, 
            timestamp DATETIME NOT NULL, sessionId TEXT NOT NULL, deviceId TEXT NOT NULL, 
            FOREIGN KEY (sessionId) REFERENCES sessions (id)
        )`, (err) => { if (err) console.error("attendance tablosu oluşturulamadı:", err.message); });
    });
});

// --- ARA KATMANLAR (MIDDLEWARE) ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// express-session yapılandırması
app.use(session({
    secret: 'bu-cok-gizli-bir-anahtar-olmalı-artik',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, 
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 8 // 8 Saatlik "Beni Hatırla"
    }
}));

// Giriş kontrolü middleware
function isTeacherAuth(req, res, next) {
    if (req.session.isLoggedIn && req.session.teacherId) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Yetkiniz yok. Lütfen giriş yapın.' });
    }
}
// ------------------------------------

// --- GİRİŞ / ÇIKIŞ API'LERİ ---

// Login API (bcrypt'li)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Kullanıcı adı ve şifre gereklidir.' });
    }

    const query = `SELECT * FROM teachers WHERE username = ?`;
    db.get(query, [username], (err, teacher) => {
        if (err) {
            console.error("Login DB hatası:", err.message);
            return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
        }
        if (!teacher) {
            return res.status(401).json({ success: false, message: 'Kullanıcı adı veya şifre yanlış.' });
        }

        bcrypt.compare(password, teacher.password, (err, isMatch) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Şifre kontrol hatası.' });
            }
            if (isMatch) {
                req.session.isLoggedIn = true;
                req.session.teacherId = teacher.id;
                req.session.teacherName = teacher.fullName;
                res.status(200).json({ success: true, message: 'Giriş başarılı.' });
            } else {
                res.status(401).json({ success: false, message: 'Kullanıcı adı veya şifre yanlış.' });
            }
        });
    });
});

// Logout API'si
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Çıkış yapılamadı.' });
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ success: true, message: 'Çıkış başarılı.' });
    });
});

// Öğretmen bilgisini alma API'si
app.get('/api/get-teacher-info', isTeacherAuth, (req, res) => {
    res.status(200).json({ success: true, name: req.session.teacherName });
});

// Oturum kontrol API'si
app.get('/api/check-auth', (req, res) => {
    if (req.session.isLoggedIn && req.session.teacherId) {
        res.status(200).json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

// YENİ: Web'den yeni öğretmen kaydı API'si
app.post('/api/register-teacher', (req, res) => {
    // 1. Gelen verileri al
    const { fullName, username, password, secretKey } = req.body;

    // 2. Gizli anahtarı kontrol et
    if (secretKey !== REGISTRATION_SECRET_KEY) {
        return res.status(401).json({ success: false, message: 'Geçersiz Gizli Anahtar. Yetkiniz yok.' });
    }

    // 3. Bilgiler tam mı diye kontrol et
    if (!fullName || !username || !password) {
        return res.status(400).json({ success: false, message: 'Tüm alanlar zorunludur.' });
    }

    // 4. Şifreyi hash'le (add_teacher.js'deki gibi)
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) {
            console.error('Kayıt sırasında şifre hashlenemedi:', err.message);
            return res.status(500).json({ success: false, message: 'Sunucu hatası (hash).' });
        }

        // 5. Veritabanına ekle
        const query = `INSERT INTO teachers (username, password, fullName) VALUES (?, ?, ?)`;
        db.run(query, [username, hash, fullName], function(err) {
            if (err) {
                // Hata 'UNIQUE constraint failed' ise bu kullanıcı adı zaten alınmıştır
                if (err.message.includes('UNIQUE')) {
                    return res.status(409).json({ success: false, message: 'Bu kullanıcı adı zaten alınmış.' });
                }
                return res.status(500).json({ success: false, message: 'Veritabanı hatası.' });
            }
            
            // Başarılı!
            console.log(`YENİ ÖĞRETMEN EKLENDİ (Web): ${fullName} (ID: ${this.lastID})`);
            res.status(201).json({ success: true, message: `Öğretmen '${fullName}' başarıyla oluşturuldu.` });
        });
    });
});

// --- SÜPER ADMİN API'LERİ (Gizli Anahtar Korumalı) ---

// 1. (LIST) Tüm öğretmenleri listele
app.post('/api/admin/get-teachers', (req, res) => {
    const { secretKey } = req.body;
    
    // Gizli anahtarı kontrol et
    if (secretKey !== REGISTRATION_SECRET_KEY) {
        return res.status(401).json({ success: false, message: 'Geçersiz Gizli Anahtar.' });
    }

    // ÖNEMLİ: Asla şifre hash'ini gönderme!
    const query = `SELECT id, username, fullName FROM teachers ORDER BY fullName ASC`;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error("Admin öğretmen listesi hatası:", err.message);
            return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
        }
        res.status(200).json({ success: true, teachers: rows });
    });
});

// 2. (DELETE) Bir öğretmeni ve tüm verilerini sil
app.post('/api/admin/delete-teacher', (req, res) => {
    const { secretKey, teacherId } = req.body;

    if (secretKey !== REGISTRATION_SECRET_KEY) {
        return res.status(401).json({ success: false, message: 'Geçersiz Gizli Anahtar.' });
    }
    if (!teacherId) {
        return res.status(400).json({ success: false, message: 'Öğretmen ID gerekli.' });
    }

    // Bu, tehlikeli bir işlemdir. Bu öğretmene ait her şeyi sileceğiz (Kademeli silme).
    console.log(`SÜPER ADMİN: ${teacherId} ID'li öğretmeni silme işlemi başlatıldı...`);

    db.serialize(() => {
        // 1. Öğretmenin oturumlarına ait tüm KATILIMCILARI sil
        db.run(`DELETE FROM attendance WHERE sessionId IN (SELECT id FROM sessions WHERE teacherId = ?)`, [teacherId], function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Katılımcı kayıtları silinemedi.' });
            console.log(`... ${this.changes} katılımcı kaydı silindi.`);
            
            // 2. Öğretmene ait tüm OTURUMLARI (dersleri) sil
            db.run(`DELETE FROM sessions WHERE teacherId = ?`, [teacherId], function(err) {
                if (err) return res.status(500).json({ success: false, message: 'Oturum kayıtları silinemedi.' });
                console.log(`... ${this.changes} oturum kaydı silindi.`);

                // 3. Öğretmenin kendisini sil
                db.run(`DELETE FROM teachers WHERE id = ?`, [teacherId], function(err) {
                    if (err) return res.status(500).json({ success: false, message: 'Öğretmen kaydı silinemedi.' });
                    console.log(`... ${this.changes} öğretmen kaydı silindi. İşlem tamam.`);
                    res.status(200).json({ success: true, message: 'Öğretmen ve tüm verileri başarıyla silindi.' });
                });
            });
        });
    });
});

// 3. (UPDATE) Bir öğretmeni güncelle
app.post('/api/admin/update-teacher', (req, res) => {
    const { secretKey, teacherId, fullName, username, newPassword } = req.body;

    if (secretKey !== REGISTRATION_SECRET_KEY) {
        return res.status(401).json({ success: false, message: 'Geçersiz Gizli Anahtar.' });
    }
    if (!teacherId || !fullName || !username) {
        return res.status(400).json({ success: false, message: 'ID, Ad Soyad ve Kullanıcı Adı gerekli.' });
    }

    // Durum 1: Şifre GÜNCELLENMİYOR
    if (!newPassword || newPassword.trim() === '') {
        const query = `UPDATE teachers SET fullName = ?, username = ? WHERE id = ?`;
        db.run(query, [fullName, username, teacherId], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(409).json({ success: false, message: 'Bu kullanıcı adı zaten alınmış.' });
                return res.status(500).json({ success: false, message: 'Veritabanı hatası.' });
            }
            res.status(200).json({ success: true, message: 'Öğretmen bilgileri güncellendi (şifre hariç).' });
        });
    } 
    // Durum 2: Şifre GÜNCELLENİYOR
    else {
        bcrypt.hash(newPassword, 10, (err, hash) => {
            if (err) return res.status(500).json({ success: false, message: 'Şifre hashlenemedi.' });
            
            const query = `UPDATE teachers SET fullName = ?, username = ?, password = ? WHERE id = ?`;
            db.run(query, [fullName, username, hash, teacherId], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) return res.status(409).json({ success: false, message: 'Bu kullanıcı adı zaten alınmış.' });
                    return res.status(500).json({ success: false, message: 'Veritabanı hatası.' });
                }
                res.status(200).json({ success: true, message: 'Öğretmen bilgileri VE şifresi güncellendi.' });
            });
        });
    }
});


// --- ÖĞRENCİ API'Sİ (Korumasız) ---
app.post('/api/submit-attendance', (req, res) => {
    const { name, studentId, location, sessionId, deviceId } = req.body;
    if (!name || !studentId || !location || !location.latitude || !location.longitude || !sessionId || !deviceId) {
        return res.status(400).json({ success: false, message: 'Eksik bilgi gönderildi.' });
    }
    const sessionQuery = `SELECT * FROM sessions WHERE id = ? AND isActive = 1`;
    db.get(sessionQuery, [sessionId], (err, session) => {
        if (err || !session) return res.status(400).json({ success: false, message: 'Geçersiz veya süresi dolmuş yoklama.' });
        const deviceCheckQuery = `SELECT id FROM attendance WHERE deviceId = ? AND sessionId = ?`;
        db.get(deviceCheckQuery, [deviceId, sessionId], (err, deviceRow) => {
            if (err) return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
            if (deviceRow) return res.status(409).json({ success: false, message: 'Bu cihazla bu ders için zaten bir yoklama alınmış.' });
            const dupeCheckQuery = `SELECT id FROM attendance WHERE studentId = ? AND sessionId = ?`;
            db.get(dupeCheckQuery, [studentId, sessionId], (err, row) => {
                if (err) return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
                if (row) return res.status(409).json({ success: false, message: 'Bu ders için yoklamaya zaten katıldınız.' });
                const distance = getDistanceInMeters(SCHOOL_LOCATION.latitude, SCHOOL_LOCATION.longitude, location.latitude, location.longitude);
                console.log(`[Oturum: ${sessionId}] Gelen Yoklama: ${name} - Mesafe: ${distance.toFixed(0)}m`);
                if (distance <= MAX_DISTANCE_METERS) {
                    const currentTime = new Date().toISOString();
                    const query = `INSERT INTO attendance (name, studentId, timestamp, sessionId, deviceId) VALUES (?, ?, ?, ?, ?)`;
                    db.run(query, [name, studentId, currentTime, sessionId, deviceId], function(err) {
                        if (err) return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
                        console.log(`-> BAŞARILI: ${name}, "${session.courseName}" dersine eklendi.`);
                        res.status(200).json({ success: true, message: `"${session.courseName}" dersi için yoklama alındı.` });
                    });
                } else {
                    console.log(`-> BAŞARISIZ: ${name} okul dışında.`);
                    res.status(400).json({ success: false, message: `Konumunuz okul sınırları dışında görünüyor.` });
                }
            });
        });
    });
});
function getDistanceInMeters(lat1, lon1, lat2, lon2) { const R = 6371e3; const phi1 = lat1 * Math.PI / 180; const phi2 = lat2 * Math.PI / 180; const deltaPhi = (lat2 - lat1) * Math.PI / 180; const deltaLambda = (lon2 - lon1) * Math.PI / 180; const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c; }

// --- ÖĞRETMEN API'LERİ (KORUMALI) ---

// Geçmiş oturumları listele
app.get('/api/get-past-sessions', isTeacherAuth, (req, res) => {
    const teacherId = req.session.teacherId;
    const query = `
        SELECT 
            s.id, s.courseName, s.createdAt, s.isActive,
            (SELECT COUNT(a.id) FROM attendance a WHERE a.sessionId = s.id) AS attendeeCount
        FROM sessions s
        WHERE s.teacherId = ?
        ORDER BY s.createdAt DESC
        LIMIT 50; 
    `;
    db.all(query, [teacherId], (err, rows) => {
        if (err) {
            console.error("Geçmiş oturumlar alınamadı:", err.message);
            return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
        }
        res.status(200).json({ success: true, sessions: rows });
    });
});




// YENİ: Tek bir oturumun detaylarını ve katılımcılarını getir
app.get('/api/session-details/:sessionId', isTeacherAuth, (req, res) => {
    const { sessionId } = req.params;
    const teacherId = req.session.teacherId;

    let responseData = {};

    // 1. Oturumun ana bilgilerini ve SAHİBİNİ kontrol et
    const sessionQuery = `SELECT id, courseName, createdAt, isActive FROM sessions 
                          WHERE id = ? AND teacherId = ?`;
                          
    db.get(sessionQuery, [sessionId, teacherId], (err, session) => {
        if (err) {
            console.error("Oturum detayı alınamadı (1):", err.message);
            return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
        }
        // Oturum bulunamazsa VEYA bu öğretmene ait değilse
        if (!session) {
            return res.status(404).json({ success: false, message: 'Oturum bulunamadı veya bu kaydı görme yetkiniz yok.' });
        }
        
        responseData.session = session; // Cevaba oturum bilgisini ekle

        // 2. Bu oturuma ait katılımcıları al
        const attendeesQuery = `SELECT name, studentId, timestamp FROM attendance 
                                WHERE sessionId = ? ORDER BY name ASC`;
                                
        db.all(attendeesQuery, [sessionId], (err, attendees) => {
            if (err) {
                console.error("Oturum detayı alınamadı (2):", err.message);
                return res.status(500).json({ success: false, message: 'Katılımcılar alınamadı.' });
            }
            
            responseData.attendees = attendees; // Cevaba katılımcıları ekle
            res.status(200).json({ success: true, ...responseData });
        });
    });
});











// Oturum başlat
app.post('/api/start-session', isTeacherAuth, (req, res) => {
    const { courseName } = req.body;
    const teacherId = req.session.teacherId;
    if (!courseName) return res.status(400).json({ success: false, message: 'Ders adı boş olamaz.' });
    
    db.run(`UPDATE sessions SET isActive = 0 WHERE isActive = 1 AND teacherId = ?`, [teacherId], (err) => {
        if (err) console.error("Oturumlar pasif hale getirilemedi:", err.message);
        
        const sessionId = randomBytes(4).toString('hex');
        const createdAt = new Date().toISOString();
        const query = `INSERT INTO sessions (id, courseName, createdAt, isActive, teacherId) VALUES (?, ?, ?, ?, ?)`;
        
        db.run(query, [sessionId, courseName, createdAt, true, teacherId], function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Oturum başlatılamadı.' });
            console.log(`Yeni oturum başlatıldı: ${courseName} (ID: ${sessionId}) (Öğrt: ${req.session.teacherName})`);
            res.status(201).json({ success: true, sessionId: sessionId });
        });
    });
});

// Katılımcı listesini al
app.get('/api/get-attendance/:sessionId', isTeacherAuth, (req, res) => {
    const { sessionId } = req.params;
    const query = `SELECT name, studentId, timestamp FROM attendance WHERE sessionId = ? ORDER BY timestamp DESC`;
    db.all(query, [sessionId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
        res.status(200).json({ success: true, attendees: rows });
    });
});

// Oturumu kapat
app.post('/api/close-session/:sessionId', isTeacherAuth, (req, res) => {
    const { sessionId } = req.params;
    const query = `UPDATE sessions SET isActive = 0 WHERE id = ?`;
    db.run(query, [sessionId], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
        if (this.changes === 0) return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
        console.log(`Oturum kapatıldı: ${sessionId}`);
        res.status(200).json({ success: true, message: 'Yoklama oturumu başarıyla kapatıldı.' });
    });
});

// Excel (.xlsx) olarak dışa aktar
app.get('/api/export-csv/:sessionId', isTeacherAuth, (req, res) => {
    const { sessionId } = req.params;
    const sessionQuery = `SELECT courseName FROM sessions WHERE id = ?`;
    db.get(sessionQuery, [sessionId], (err, session) => {
        if (err || !session) return res.status(404).send('Oturum bulunamadı.');
        const attendanceQuery = `SELECT name, studentId, timestamp FROM attendance 
                                 WHERE sessionId = ? ORDER BY timestamp ASC`;
        db.all(attendanceQuery, [sessionId], async (err, rows) => {
            if (err) { console.error("Excel hatası:", err.message); return res.status(500).send('Sunucu hatası.'); }
            if (rows.length === 0) return res.status(404).send('Katılımcı bulunamadı.');
            try {
                const workbook = new Excel.Workbook();
                const worksheet = workbook.addWorksheet(`${session.courseName} Yoklama`);
                worksheet.columns = [
                    { header: 'Ad Soyad', key: 'name', width: 30 },
                    { header: 'Okul Numarasi', key: 'studentId', width: 15 },
                    { header: 'Katilim Zamani', key: 'timestamp', width: 25 }
                ];
                rows.forEach(row => {
                    worksheet.addRow({
                        name: row.name,
                        studentId: row.studentId,
                        timestamp: new Date(row.timestamp).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'medium' })
                    });
                });
                worksheet.getRow(1).font = { bold: true };
                const courseName = session.courseName.replace(/[^a-z0-9]/gi, '_');
                const date = new Date().toISOString().split('T')[0];
                const fileName = `${courseName}_${date}.xlsx`;
                res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.header('Content-Disposition', `attachment; filename="${fileName}"`);
                await workbook.xlsx.write(res);
                res.end();
            } catch (error) { res.status(500).send('Excel dosyası oluşturulurken hata.'); }
        });
    });
});

// YENİ: Oturumu (dersi) ve ilgili tüm katılımcıları kalıcı olarak sil
app.delete('/api/delete-session/:sessionId', isTeacherAuth, (req, res) => {
    const { sessionId } = req.params;
    const teacherId = req.session.teacherId;

    // 1. GÜVENLİK KONTROLÜ: Bu öğretmen, bu dersin sahibi mi?
    const checkOwnerQuery = `SELECT id FROM sessions WHERE id = ? AND teacherId = ?`;
    db.get(checkOwnerQuery, [sessionId, teacherId], (err, session) => {
        if (err) {
            console.error("Silme hatası (Yetki kontrolü):", err.message);
            return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
        }
        if (!session) {
            // Ya oturum yok VEYA bu öğretmene ait değil
            return res.status(401).json({ success: false, message: 'Bu oturumu silme yetkiniz yok.' });
        }

        // 2. Yetki doğrulandı. Silme işlemine başla.
        // Veritabanı bütünlüğü için iki sorguyu sırayla çalıştır
        db.serialize(() => {
            // Önce katılımcıları (çocuk kayıtları) sil
            const deleteAttendeesQuery = `DELETE FROM attendance WHERE sessionId = ?`;
            db.run(deleteAttendeesQuery, [sessionId], function(err) {
                if (err) {
                    console.error("Silme hatası (Katılımcılar):", err.message);
                    return res.status(500).json({ success: false, message: 'Katılımcılar silinirken hata oluştu.' });
                }
                
                // Katılımcılar silindikten sonra, ana oturumu (dersi) sil
                const deleteSessionQuery = `DELETE FROM sessions WHERE id = ?`;
                db.run(deleteSessionQuery, [sessionId], function(err) {
                    if (err) {
                        console.error("Silme hatası (Oturum):", err.message);
                        return res.status(500).json({ success: false, message: 'Oturum silinirken hata oluştu.' });
                    }
                    
                    // Her şey başarılı
                    console.log(`Oturum ${sessionId} ve ${this.changes} katılımcı kaydı silindi.`);
                    res.status(200).json({ success: true, message: 'Ders ve ilgili tüm kayıtlar başarıyla silindi.' });
                });
            });
        });
    });
});




// --- ANA YÖNLENDİRME VE SUNUCU BAŞLATMA ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ana sayfa (Dashboard) yönlendirmesi
app.get('/dashboard.html', (req, res) => {
    if (req.session.isLoggedIn && req.session.teacherId) {
        res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    } else {
        res.redirect('/login.html');
    }
});

// Canlı yoklama sayfası
app.get('/teacher.html', (req, res) => { 
    if (req.session.isLoggedIn && req.session.teacherId) {
        res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
    } else {
        res.redirect('/login.html');
    }
});

// YENİ: Oturum Detay Sayfası yönlendirmesi
app.get('/session-detail.html', (req, res) => {
    if (req.session.isLoggedIn && req.session.teacherId) {
        res.sendFile(path.join(__dirname, 'public', 'session-detail.html'));
    } else {
        res.redirect('/login.html');
    }
});

// *********** EKSİK OLAN KISIM ***********
// Sunucuyu başlatan kod (Muhtemelen kopyalamadığınız yer)
app.listen(PORT, () => {
    console.log(`Yoklama Sunucusu http://localhost:${PORT} adresinde çalışıyor...`);
});
// *****************************************