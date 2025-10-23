document.addEventListener('DOMContentLoaded', () => {
    
    const registerForm = document.getElementById('register-form');
    const messageEl = document.getElementById('reg-message');

    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Sayfanın yenilenmesini engelle

        // Formdaki tüm verileri al
        const fullName = document.getElementById('reg-fullname').value;
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        const secretKey = document.getElementById('reg-secret').value;

        // Mesajı temizle
        messageEl.textContent = 'İşleniyor...';
        messageEl.className = '';

        try {
            const response = await fetch('/api/register-teacher', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName: fullName,
                    username: username,
                    password: password,
                    secretKey: secretKey
                })
            });

            const result = await response.json();

            if (response.ok) { // HTTP 201 (Created)
                messageEl.textContent = result.message;
                messageEl.className = 'success';
                registerForm.reset(); // Formu başarıyla sıfırla
            } else { // HTTP 400, 401, 409, 500
                messageEl.textContent = result.message;
                messageEl.className = 'error';
            }

        } catch (error) {
            console.error('Kayıt hatası:', error);
            messageEl.textContent = 'Sunucuya bağlanılamadı.';
            messageEl.className = 'error';
        }
    });
});