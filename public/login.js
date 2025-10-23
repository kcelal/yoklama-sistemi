document.addEventListener('DOMContentLoaded', () => {
    
    // HTML'den elemanları seç
    const loginForm = document.getElementById('login-form'); // YENİ: Buton yerine formu seç
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const messageEl = document.getElementById('login-message');
    const showPasswordCheckbox = document.getElementById('show-password');

    // YENİ: 'click' yerine formun 'submit' olayını dinle
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // <-- ÇOK ÖNEMLİ: Sayfanın yeniden yüklenmesini engelle

        const username = usernameInput.value;
        const password = passwordInput.value;
        
        if (!username || !password) {
            messageEl.textContent = 'Kullanıcı adı ve şifre girin.';
            return;
        }
        
        messageEl.textContent = ''; 

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password })
            });

            const result = await response.json();

            if (result.success) {
                // BAŞARILI GİRİŞ!
                // Tarayıcı bu noktada şifreyi kaydetmeyi önerecektir.
                window.location.href = '/dashboard.html'; // Ana sayfaya yönlendir
            } else {
                messageEl.textContent = result.message || 'Bir hata oluştu.';
            }
        } catch (error) {
            console.error('Giriş hatası:', error);
            messageEl.textContent = 'Sunucuya bağlanılamadı.';
        }
    });

    // "Şifreyi Göster" kutucuğu (Bu kod aynı kaldı)
    showPasswordCheckbox.addEventListener('change', () => {
        passwordInput.type = showPasswordCheckbox.checked ? 'text' : 'password';
    });

    // Enter tuşu dinleyicilerine artık gerek yok,
    // form 'submit' olayı bunu otomatik olarak halleder.
});