const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const readline = require('readline');

// Komut satırından girdi almak için arayüz
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Veritabanına bağlan
const db = new sqlite3.Database('./yoklama.db', (err) => {
    if (err) {
        return console.error('Veritabanına bağlanılamadı:', err.message);
    }
    console.log('Veritabanına bağlanıldı. Yeni öğretmen ekleyebilirsiniz.');
});

// Kullanıcıdan bilgileri al
rl.question('Kullanıcı Adı (username): ', (username) => {
    rl.question('Şifre (password): ', (password) => {
        rl.question('Ad Soyad (fullName, örn: Celal Kılıç): ', (fullName) => {
            
            // Şifreyi hash'le
            const saltRounds = 10;
            bcrypt.hash(password, saltRounds, (err, hash) => {
                if (err) {
                    return console.error('Şifre hashlenirken hata:', err.message);
                }
                
                // Hash'lenmiş şifreyi veritabanına ekle
                const query = `INSERT INTO teachers (username, password, fullName) VALUES (?, ?, ?)`;
                db.run(query, [username, hash, fullName], function(err) {
                    if (err) {
                        return console.error('Öğretmen eklenirken hata (Bu kullanıcı adı alınmış olabilir):', err.message);
                    }
                    console.log(`\nBAŞARILI!`);
                    console.log(`Öğretmen "${fullName}" (ID: ${this.lastID}) başarıyla eklendi.`);
                    console.log(`Kullanıcı Adı: ${username}`);
                    
                    // Bağlantıları kapat
                    rl.close();
                    db.close();
                });
            });
        });
    });
});