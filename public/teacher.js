// 1. OTURUM KONTROLÜ
// Bu fonksiyon, diğer her şeyden ÖNCE çalışır.
// Eğer giriş yapılmamışsa, hemen login.html'e yönlendirir.
(async function checkAuthentication() {
    try {
        const response = await fetch('/api/check-auth');
        if (!response.ok) {
            // Sunucu 401 (Yetki Yok) dönerse, login'e yönlendir
            window.location.href = '/login.html';
        }
        // response ok (200) ise, kodun geri kalanı çalışır.
    } catch (error) {
        console.error('Oturum kontrol hatası, login sayfasına yönlendiriliyor.', error);
        window.location.href = '/login.html';
    }
})();



// 2. ANA UYGULAMA KODU
// Sayfa yüklendiğinde (ve oturum kontrolü başarılıysa) SADECE BU BLOK çalışır.
document.addEventListener('DOMContentLoaded', () => {
    
    // --- YENİ BÖLÜM BAŞLANGICI ---
    const welcomeMessageEl = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');

    // 1. Öğretmenin adını al ve "Merhaba" de
    (async function getTeacherName() {
        try {
            const response = await fetch('/api/get-teacher-info');
            const result = await response.json();
            if (result.success) {
                welcomeMessageEl.textContent = `Merhaba, ${result.name}`;
            } else {
                welcomeMessageEl.textContent = 'Panel';
            }
        } catch (error) {
            console.error('Öğretmen bilgisi alınamadı:', error);
            welcomeMessageEl.textContent = 'Panel';
        }
    })();

    // 2. Çıkış Yap butonuna basıldığında
    logoutButton.addEventListener('click', async () => {
        if (!confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
            return;
        }
        try {
            await fetch('/api/logout', { method: 'POST' });
            window.location.href = '/login.html'; // Başarılı veya başarısız, her türlü login'e at
        } catch (error) {
            console.error('Çıkış hatası:', error);
            window.location.href = '/login.html';
        }
    });
    // --- YENİ BÖLÜM SONU ---


    // HTML'den elemanları seç
    const setupDiv = document.getElementById('session-setup');
    const displayDiv = document.getElementById('session-display');
    const startButton = document.getElementById('start-button');
    const courseNameInput = document.getElementById('course-name');
    const messageEl = document.getElementById('setup-message');

    const qrcodeDiv = document.getElementById('qrcode');
    const qrcodeOverlay = document.getElementById('qrcode-overlay'); // "Kapat" butonu için
    const closeButton = document.getElementById('close-button');
    const exportButton = document.getElementById('export-button'); // YENİ
    const courseNameH2 = document.getElementById('display-course-name');
    const attendeeCountSpan = document.getElementById('attendee-count');
    const attendeeListUl = document.getElementById('attendee-list');

    let currentSessionId = null;
    let pollInterval = null; // Katılımcıları çekmek için zamanlayıcı

    // "Yoklamayı Başlat" butonuna tıklandığında
    startButton.addEventListener('click', async () => {
        const courseName = courseNameInput.value.trim();
        
        if (!courseName) {
            messageEl.textContent = 'Lütfen bir ders adı girin.';
            return;
        }
        
        try {
            const response = await fetch('/api/start-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseName: courseName })
            });
            
            const result = await response.json();
            
            if (result.success) {
                currentSessionId = result.sessionId;
                setupDiv.style.display = 'none';
                displayDiv.style.display = 'block';
                courseNameH2.textContent = courseName;
                
                generateQRCode(currentSessionId);
                
                // Katılımcıları çekmeye başla
                getAttendees(currentSessionId); // İlk listeyi hemen çek
                
                // SÜREKLİ YENİLEME: 
                // İstediğiniz gibi her 3 saniyede bir listeyi yenile
                pollInterval = setInterval(() => getAttendees(currentSessionId), 3000);

            } else {
                messageEl.textContent = 'Hata: ' + result.message;
            }
        } catch (error) {
            console.error('Oturum başlatma hatası:', error);
            messageEl.textContent = 'Sunucuya bağlanılamadı.';
        }
    });

    // "Yoklamayı Kapat" butonuna tıklandığında
    closeButton.addEventListener('click', async () => {
        if (!currentSessionId) return;

        if (!confirm('Yoklama oturumunu kapatmak istediğinizden emin misiniz? Kapatıldıktan sonra öğrenciler katılamaz.')) {
            return;
        }

        try {
            const response = await fetch(`/api/close-session/${currentSessionId}`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                // 1. Anlık güncellemeyi (polling) durdur
                if (pollInterval) {
                    clearInterval(pollInterval);
                    pollInterval = null;
                }
                
                // 2. Butonu devre dışı bırak
                closeButton.disabled = true;
                closeButton.textContent = 'Yoklama Kapatıldı';
                
                // 3. QR kodun üzerini kapat
                qrcodeOverlay.style.display = 'flex';
                
                // 4. Son bir kez listeyi güncelle
                getAttendees(currentSessionId); 
                
            } else {
                alert('Hata: ' + result.message);
            }
        } catch (error) {
            console.error('Oturum kapatma hatası:', error);
            alert('Sunucuya bağlanılamadı.');
        }
    });
    // YENİ: "Dışa Aktar" butonuna tıklandığında
    exportButton.addEventListener('click', () => {
        if (!currentSessionId) {
            alert('Dışa aktarılacak bir oturum bulunamadı.');
            return;
        }

        // Bu bir fetch() DEĞİL.
        // Tarayıcıyı doğrudan indirme linkine yönlendiriyoruz.
        // Sunucu doğru başlıkları (headers) gönderdiği için tarayıcı bunu "indirme" olarak algılayacak.
        window.location.href = `/api/export-csv/${currentSessionId}`;
    });

    // Verilen oturum ID'si için QR kod üreten fonksiyon
    function generateQRCode(sessionId) {
        const studentUrl = `${window.location.origin}/index.html?session=${sessionId}`;
        
        console.log("Oluşturulan QR Kod Linki:", studentUrl);

        qrcodeDiv.innerHTML = '';
        new QRCode(qrcodeDiv, {
            text: studentUrl,
            width: 256,
            height: 256,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    // Sunucudan katılımcı listesini çeken fonksiyon
    async function getAttendees(sessionId) {
        if (!sessionId) return;
        
        try {
            const response = await fetch(`/api/get-attendance/${sessionId}`);
            const result = await response.json();
            
            if (result.success) {
                // Katılımcı listesini HTML'de güncelle
                updateAttendeeList(result.attendees);
            } else {
                console.warn('Katılımcı listesi alınamadı:', result.message);
                // Eğer oturum kapandığı veya giriş yapılmadığı için 401 hatası gelirse güncellemeyi durdur
                if (response.status === 401 && pollInterval) {
                     clearInterval(pollInterval);
                }
            }
        } catch (error) {
            console.error('Katılımcı çekme hatası:', error);
            if (pollInterval) clearInterval(pollInterval); // Hata varsa da durdur
        }
    }

    // Gelen listeye göre HTML'i güncelleyen fonksiyon
    function updateAttendeeList(attendees) {
        attendeeCountSpan.textContent = attendees.length; // Sayacı güncelle
        attendeeListUl.innerHTML = ''; // Listeyi temizle
        
        if (attendees.length === 0) {
            attendeeListUl.innerHTML = '<li>Henüz katılan yok...</li>';
            return;
        }
        
        attendees.forEach(student => {
            const li = document.createElement('li');
            // Zaman damgasını TR formatında (Saat:Dakika:Saniye) göster
            const timestamp = new Date(student.timestamp).toLocaleTimeString('tr-TR');
            li.textContent = `${student.name} (${student.studentId}) - Saat: ${timestamp}`;
            attendeeListUl.appendChild(li);
        });
    }

}); // DOMContentLoaded sonu