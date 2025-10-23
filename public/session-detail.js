// 1. OTURUM KONTROLÜ
(async function checkAuthentication() {
    try {
        const response = await fetch('/api/check-auth');
        if (!response.ok) {
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('Oturum kontrol hatası:', error);
        window.location.href = '/login.html';
    }
})();

// 2. ANA UYGULAMA KODU
document.addEventListener('DOMContentLoaded', () => {
    
    const welcomeMessageEl = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');
    const courseNameEl = document.getElementById('course-name');
    const courseDateEl = document.getElementById('course-date');
    const courseStatusEl = document.getElementById('course-status');
    const exportButton = document.getElementById('export-button');
    const attendeeCountEl = document.getElementById('attendee-count');
    const attendeeListEl = document.getElementById('detail-attendee-list');
    
    // YENİ: Detay sayfasındaki kapat butonunu seç
    const detailCloseButton = document.getElementById('detail-close-button');
    const deleteSessionButton = document.getElementById('delete-session-button');
    
    let currentSessionId = null;

    try {
        const urlParams = new URLSearchParams(window.location.search);
        currentSessionId = urlParams.get('id');
        if (!currentSessionId) {
            throw new Error('Oturum ID bulunamadı.');
        }
    } catch (error) {
        courseNameEl.textContent = 'HATA';
        attendeeListEl.innerHTML = `<li>Oturum ID'si bulunamadı. Lütfen ana sayfaya dönün.</li>`;
        return;
    }

    // "Merhaba, [İsim]" yazdır
    (async function getTeacherName() {
        try {
            const response = await fetch('/api/get-teacher-info');
            const result = await response.json();
            if (result.success) {
                welcomeMessageEl.textContent = `Merhaba, ${result.name}`;
            } else {
                welcomeMessageEl.textContent = 'Oturum Detayı';
            }
        } catch (error) { /* Hata önemli değil */ }
    })();

    // "Çıkış Yap" butonunu çalıştır
    logoutButton.addEventListener('click', async () => {
        if (!confirm('Çıkış yapmak istediğinizden emin misiniz?')) return;
        try {
            await fetch('/api/logout', { method: 'POST' });
            window.location.href = '/login.html';
        } catch (error) {
            window.location.href = '/login.html';
        }
    });

    // "Excel'e Aktar" butonunu çalıştır
    exportButton.addEventListener('click', () => {
        window.location.href = `/api/export-csv/${currentSessionId}`;
    });
    
    // YENİ: Detay sayfasındaki kapat butonu için tıklama olayı
    detailCloseButton.addEventListener('click', async () => {
        if (!confirm('Bu yoklama oturumunu kapatmak istediğinizden emin misiniz?')) {
            return;
        }

        try {
            const response = await fetch(`/api/close-session/${currentSessionId}`, {
                method: 'POST'
            });
            const result = await response.json();

            if (result.success) {
                // Başarılıysa, butonu gizle ve durumu güncelle
                detailCloseButton.style.display = 'none';
                courseStatusEl.innerHTML = '<span class="status-closed">Bu oturum KAPATILDI</span>';
            } else {
                alert('Hata: ' + result.message);
            }
        } catch (error) {
            alert('Sunucu hatası: ' + error.message);
        }
    });

// "Kalıcı Olarak Sil" butonuna tıklandığında
    deleteSessionButton.addEventListener('click', async () => {
        
        // Çift onay (Güvenlik için)
        if (!confirm('Bu dersi silmek istediğinizden emin misiniz?')) {
            return;
        }
        if (!confirm('Bu işlem, bu derse katılan TÜM ÖĞRENCİ KAYITLARINI kalıcı olarak silecektir!\nBu işlem GERİ ALINAMAZ. Emin misiniz?')) {
            return;
        }

        try {
            // Sunucudaki yeni 'DELETE' API'mızı çağırıyoruz
            const response = await fetch(`/api/delete-session/${currentSessionId}`, {
                method: 'DELETE' // <-- HATA MUHTEMELEN BU SATIRIN EKSİKLİĞİNDENDİ
            });
            
            // Cevabı JSON olarak ayrıştırmayı DENE
            const result = await response.json();

            if (result.success) {
                // Başarılıysa, kullanıcıyı ana sayfaya yönlendir
                alert(result.message);
                window.location.href = '/dashboard.html';
            } else {
                // Hata varsa (örn: yetki yok)
                alert('Hata: ' + result.message);
            }
        } catch (error) {
            // Hata burada yakalandı: "Unexpected token <..."
            console.error('Silme hatası:', error);
            alert('Sunucu hatası: ' + error.message + '\n\nSunucu, HTML cevabı döndürdü. API isteği yanlış olabilir.');
        }
    });


    // Oturum detaylarını ve katılımcıları yükle
    (async function loadSessionDetails() {
        try {
            const response = await fetch(`/api/session-details/${currentSessionId}`);
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message);
            }

            const { session, attendees } = result;

            // 1. Bilgi kutusunu doldur
            const date = new Date(session.createdAt).toLocaleString('tr-TR', {
                dateStyle: 'long', timeStyle: 'short'
            });
            
            // GÜNCELLENDİ: Durum ve buton görünürlüğü
            if (session.isActive) {
                courseStatusEl.innerHTML = '<span class="status-active">Bu oturum şu anda AKTİF</span>';
                detailCloseButton.style.display = 'block'; // Butonu göster!
            } else {
                courseStatusEl.innerHTML = '<span class="status-closed">Bu oturum KAPALI</span>';
                detailCloseButton.style.display = 'none'; // Butonu gizle
            }
            
            courseNameEl.textContent = session.courseName;
            courseDateEl.textContent = `Oluşturulma Tarihi: ${date}`;

            // 2. Katılımcı listesini doldur
            attendeeCountEl.textContent = attendees.length;
            attendeeListEl.innerHTML = ''; 

            if (attendees.length === 0) {
                attendeeListEl.innerHTML = '<li>Bu derse katılan öğrenci bulunmuyor.</li>';
                return;
            }

            attendees.forEach(student => {
                const li = document.createElement('li');
                const timestamp = new Date(student.timestamp).toLocaleTimeString('tr-TR');
                li.innerHTML = `
                    <strong>${student.name}</strong>
                    <span>(${student.Id})</span>
                    <small>Katılım: ${timestamp}</small>
                `;
                attendeeListEl.appendChild(li);
            });

        } catch (error) {
            console.error('Oturum detayları yüklenemedi:', error);
            courseNameEl.textContent = 'Hata';
            attendeeListEl.innerHTML = `<li>Kayıtlar yüklenirken bir hata oluştu: ${error.message}</li>`;
        }
    })();
});