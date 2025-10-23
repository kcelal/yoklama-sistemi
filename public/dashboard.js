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
    const pastSessionsList = document.getElementById('past-sessions-list');

    // "Merhaba, [İsim]" yazdır
    (async function getTeacherName() {
        try {
            const response = await fetch('/api/get-teacher-info');
            const result = await response.json();
            if (result.success) {
                welcomeMessageEl.textContent = `Merhaba, ${result.name}`;
            } else {
                welcomeMessageEl.textContent = 'Ana Sayfa';
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

    // Geçmiş oturumları yükle
    (async function loadPastSessions() {
        try {
            const response = await fetch('/api/get-past-sessions');
            const result = await response.json();
            
            pastSessionsList.innerHTML = ''; 

            if (result.success && result.sessions.length > 0) {
                result.sessions.forEach(session => {
                    const li = document.createElement('li');
                    
                    const date = new Date(session.createdAt).toLocaleString('tr-TR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });

                    // GÜNCELLENDİ: Durum (Aktif ise buton, değilse yazı)
                    let statusHtml = '';
                    if (session.isActive) {
                        // data-session-id: Hangi oturumun kapatılacağını bilmemiz için
                        statusHtml = `<button class="list-close-btn" data-session-id="${session.id}">KAPAT</button>`;
                    } else {
                        statusHtml = `<span class="status-closed">Kapalı</span>`;
                    }

                    li.innerHTML = `
                        <strong>${session.courseName}</strong>
                        <small>${date}</small>
                        <span class="count">${session.attendeeCount} Katılımcı</span>
                        <span class="status-container">${statusHtml}</span>
                    `;
                    
                    // Tıklandığında detay sayfasına git
                    li.addEventListener('click', (e) => {
                        // ÖNEMLİ: Eğer 'KAPAT' butonuna tıklandıysa, detay sayfasına gitme.
                        if (e.target.classList.contains('list-close-btn')) {
                            return;
                        }
                        window.location.href = `/session-detail.html?id=${session.id}`;
                    });
                    
                    pastSessionsList.appendChild(li);
                });
            } else if (result.success && result.sessions.length === 0) {
                pastSessionsList.innerHTML = '<li>Henüz geçmiş bir yoklama kaydınız bulunmuyor.</li>';
            } else {
                pastSessionsList.innerHTML = '<li>Kayıtlar yüklenirken bir hata oluştu.</li>';
            }

        } catch (error) {
            console.error('Geçmiş oturumlar yüklenemedi:', error);
            pastSessionsList.innerHTML = '<li>Kayıtlar yüklenirken bir hata oluştu.</li>';
        }
    })();

    // YENİ: Ana listedeki 'KAPAT' butonları için olay delegasyonu
    pastSessionsList.addEventListener('click', async (e) => {
        // Tıklanan eleman 'list-close-btn' sınıfına sahip bir buton mu?
        if (e.target.classList.contains('list-close-btn')) {
            const button = e.target;
            const sessionId = button.dataset.sessionId;
            
            if (!confirm(`'${sessionId}' ID'li oturumu kapatmak istediğinizden emin misiniz?`)) {
                return;
            }

            try {
                // Mevcut 'close-session' API'mızı çağırıyoruz
                const response = await fetch(`/api/close-session/${sessionId}`, {
                    method: 'POST'
                });
                const result = await response.json();

                if (result.success) {
                    // Butonu "Kapalı" durumuna getir, tekrar basılmasın
                    const statusContainer = button.parentElement;
                    statusContainer.innerHTML = `<span class="status-closed">Kapatıldı</span>`;
                } else {
                    alert('Oturum kapatılamadı: ' + result.message);
                }
            } catch (error) {
                alert('Sunucu hatası: ' + error.message);
            }
        }
    });

});