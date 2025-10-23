document.addEventListener('DOMContentLoaded', () => {

    // Ana elemanlar
    const loadButton = document.getElementById('load-teachers-btn');
    const secretInput = document.getElementById('admin-secret');
    const messageEl = document.getElementById('admin-message');
    const tableBody = document.getElementById('teachers-list-body');

    // Düzenleme formu elemanları
    const editFormContainer = document.getElementById('edit-form-container');
    const editForm = document.getElementById('edit-form');
    const editFormTitle = document.getElementById('edit-form-title');
    const cancelEditButton = document.getElementById('cancel-edit-btn');
    
    // Düzenleme formu alanları
    const editIdInput = document.getElementById('edit-id');
    const editFullnameInput = document.getElementById('edit-fullname');
    const editUsernameInput = document.getElementById('edit-username');
    const editPasswordInput = document.getElementById('edit-password');


    // "Öğretmenleri Yükle" butonu
    loadButton.addEventListener('click', loadTeachers);

    // Öğretmenleri yükleyen ana fonksiyon
    async function loadTeachers() {
        const secretKey = secretInput.value;
        if (!secretKey) {
            showMessage('Gizli anahtar gerekli.', true);
            return;
        }

        showMessage('Öğretmenler yükleniyor...', false);
        
        try {
            const response = await fetch('/api/admin/get-teachers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secretKey: secretKey })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message);
            }
            
            // Başarılıysa, tabloyu doldur
            tableBody.innerHTML = ''; // Tabloyu temizle
            if (result.teachers.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="4">Hiç öğretmen kaydı bulunamadı.</td></tr>';
            }

            result.teachers.forEach(teacher => {
                const tr = document.createElement('tr');
                tr.setAttribute('id', `teacher-row-${teacher.id}`);
                tr.innerHTML = `
                    <td>${teacher.id}</td>
                    <td data-field="fullName">${teacher.fullName}</td>
                    <td data-field="username">${teacher.username}</td>
                    <td>
                        <button class="edit-btn-table" data-id="${teacher.id}">Düzenle</button>
                        <button class="delete-btn-table" data-id="${teacher.id}" data-name="${teacher.fullName}">Sil</button>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
            showMessage('Öğretmenler başarıyla yüklendi.', false);

        } catch (error) {
            console.error('Öğretmen yükleme hatası:', error);
            showMessage('Hata: ' + error.message, true);
        }
    }

    // Tablodaki "Düzenle" veya "Sil" butonlarına tıklamayı dinle (Olay Delegasyonu)
    tableBody.addEventListener('click', (e) => {
        const target = e.target;
        
        // "Düzenle" butonuna tıklandı
        if (target.classList.contains('edit-btn-table')) {
            const teacherId = target.dataset.id;
            // O satırdaki (row) verileri al
            const row = document.getElementById(`teacher-row-${teacherId}`);
            const fullName = row.querySelector('[data-field="fullName"]').textContent;
            const username = row.querySelector('[data-field="username"]').textContent;
            
            showEditForm(teacherId, fullName, username);
        }

        // "Sil" butonuna tıklandı
        if (target.classList.contains('delete-btn-table')) {
            const teacherId = target.dataset.id;
            const teacherName = target.dataset.name;
            deleteTeacher(teacherId, teacherName);
        }
    });

    // Düzenleme formunu gösteren fonksiyon
    function showEditForm(id, fullName, username) {
        editFormTitle.textContent = `Öğretmeni Düzenle: ${fullName} (ID: ${id})`;
        editIdInput.value = id;
        editFullnameInput.value = fullName;
        editUsernameInput.value = username;
        editPasswordInput.value = ''; // Şifre alanını daima boş başlat
        
        editFormContainer.style.display = 'block';
        window.scrollTo(0, document.body.scrollHeight); // Sayfanın en altına kaydır
    }

    // Düzenleme formunu gizle
    cancelEditButton.addEventListener('click', () => {
        editFormContainer.style.display = 'none';
        editForm.reset();
    });

    // "Güncelle" butonuna basıldığında (Form gönderildiğinde)
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const secretKey = secretInput.value;
        if (!secretKey) {
            showMessage('Gizli anahtar gerekli.', true);
            return;
        }

        const data = {
            secretKey: secretKey,
            teacherId: editIdInput.value,
            fullName: editFullnameInput.value,
            username: editUsernameInput.value,
            newPassword: editPasswordInput.value
        };

        showMessage('Öğretmen güncelleniyor...', false);
        
        try {
            const response = await fetch('/api/admin/update-teacher', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            if (!result.success) throw new Error(result.message);

            showMessage(result.message, false);
            editFormContainer.style.display = 'none'; // Formu gizle
            loadTeachers(); // Listeyi tazele

        } catch (error) {
            console.error('Güncelleme hatası:', error);
            showMessage('Güncelleme Hatası: ' + error.message, true);
        }
    });

    // Silme işlemini yapan fonksiyon
    async function deleteTeacher(id, name) {
        if (!confirm(`UYARI: '${name}' (ID: ${id}) adlı öğretmeni silmek istediğinizden emin misiniz?`)) {
            return;
        }
        if (!confirm(`ÇİFT ONAY: Bu işlem, bu öğretmene ait TÜM DERSLERİ ve KATILIMCI KAYITLARINI kalıcı olarak silecektir.\nBu işlem GERİ ALINAMAZ. Onaylıyor musunuz?`)) {
            return;
        }

        const secretKey = secretInput.value;
        if (!secretKey) {
            showMessage('Silme işlemi için gizli anahtar gerekli.', true);
            return;
        }

        showMessage('Öğretmen siliniyor...', false);

        try {
            const response = await fetch('/api/admin/delete-teacher', {
                method: 'POST', // (API'mız POST bekliyordu, DELETE değil)
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secretKey: secretKey, teacherId: id })
            });
            
            const result = await response.json();
            if (!result.success) throw new Error(result.message);

            showMessage(result.message, false);
            loadTeachers(); // Listeyi tazele

        } catch (error) {
            console.error('Silme hatası:', error);
            showMessage('Silme Hatası: ' + error.message, true);
        }
    }

    // Yardımcı mesaj gösterme fonksiyonu
    function showMessage(message, isError) {
        messageEl.textContent = message;
        messageEl.style.color = isError ? 'red' : 'green';
    }

});