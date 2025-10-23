// YENİ: Benzersiz bir Cihaz ID'si oluşturan veya getiren fonksiyon
function getOrSetDeviceId() {
    let deviceId = localStorage.getItem('myUniqueDeviceId');
    if (!deviceId) {
        // Eğer daha önce bir ID atanmamışsa, yeni bir tane oluştur
        deviceId = 'device_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('myUniqueDeviceId', deviceId);
    }
    console.log("Device ID:", deviceId); // Test için konsola yazdır
    return deviceId;
}

// Formu, butonu ve mesaj alanını seçiyoruz
const form = document.getElementById('attendance-form');
const submitButton = document.getElementById('submit-button');
const messageEl = document.getElementById('message');

// Forma "gönder" (submit) olayı eklendiğinde
form.addEventListener('submit', function(event) {
    event.preventDefault(); // Formun sayfayı yenilemesini engelle
    
    submitButton.disabled = true;
    submitButton.textContent = 'İşleniyor...';
    showMessage('', 'normal');

    if (!navigator.geolocation) {
        showMessage('Tarayıcınız konum servisini desteklemiyor.', 'error');
        enableButton();
        return;
    }

    navigator.geolocation.getCurrentPosition(positionAcquired, positionError);
});

// Konum başarıyla alındığında çalışacak fonksiyon
function positionAcquired(position) {
    const { latitude, longitude } = position.coords;
    
    const name = document.getElementById('name').value;
    const studentId = document.getElementById('student-id').value;

    // YENİ: Cihaz ID'sini al
    const deviceId = getOrSetDeviceId();

    // Verileri sunucuya göndermek için bir paket hazırla
    const data = {
        name: name,
        studentId: studentId,
        location: {
            latitude: latitude,
            longitude: longitude
        },
        deviceId: deviceId // YENİ: Cihaz ID'sini veriye ekle
    };

    sendDataToServer(data);
}

// Konum alınırken hata oluşursa çalışacak fonksiyon
function positionError(error) {
    // ... (Bu fonksiyonun içi aynı, değişiklik yok) ...
    let errorMessage = 'Konum alınırken bir hata oluştu.';
    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMessage = 'Yoklama için konum izni vermeniz gerekiyor.';
            break;
        case error.POSITION_UNAVAILABLE:
            errorMessage = 'Konum bilgisi alınamadı.';
            break;
        case error.TIMEOUT:
            errorMessage = 'Konum alırken zaman aşımı oldu.';
            break;
    }
    showMessage(errorMessage, 'error');
    enableButton();
}

// Veriyi asıl sunucumuza gönderecek fonksiyon
async function sendDataToServer(data) {
    // YENİ: URL'den 'session' parametresini oku
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');

    if (!sessionId) {
        showMessage('Geçersiz QR kod. Lütfen öğretmeninizin ekranındaki kodu tekrar okutun.', 'error');
        enableButton();
        return;
    }
    
    data.sessionId = sessionId;
    
    try {
        const response = await fetch('/api/submit-attendance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            showMessage(result.message, 'success');
            submitButton.disabled = true;
            submitButton.textContent = 'Katıldınız';
        } else {
            // YENİ: Sunucudan artık "Bu cihazla..." hatası da gelebilir
            showMessage(result.message, 'error');
            enableButton();
        }

    } catch (error) {
        console.error('Sunucu Hatası:', error);
        showMessage('Sunucuya bağlanırken bir hata oluştu.', 'error');
        enableButton();
    }
}

// Kullanıcıya mesaj göstermek için küçük bir yardımcı fonksiyon
function showMessage(message, type) {
    messageEl.textContent = message;
    messageEl.className = type; 
}

// Butonu tekrar tıklanabilir hale getiren yardımcı fonksiyon
function enableButton() {
    submitButton.disabled = false;
    submitButton.textContent = 'Yoklamaya Katıl';
}