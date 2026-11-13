const categories = [
    'Tiendas',
    'Utilidades',
    'Aplicaciones',
    'Juego',
    'Audio',
    'Música',
    'Herramientas',
    'Personalización',
    'Inteligencia Artificial'
];
const resolutions = [256, 512, 1024, 2048, 4096];
const images = {};
const categoryContainer = document.getElementById('categories');
const imageContainer = document.getElementById('images');
const pathsContainer = document.getElementById('paths');
const form = document.getElementById('app-form');
const submitButton = document.getElementById('create-package');
const statusMessage = document.getElementById('status');
const idInput = document.getElementById('app-id');
const nameInput = document.getElementById('app-name');
let idEdited = false;

function showStatus(message, isError) {
    statusMessage.textContent = message;
    statusMessage.className = isError ? 'error-message' : 'success-message';
}

function updateIcon() {
    document.getElementById('app-icon').value = `../assets/apps/${idInput.value.trim()}.png`;
}

categories.forEach(category => {
    const label = document.createElement('label');
    label.className = 'category-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = category;
    const text = document.createElement('span');
    text.textContent = category;
    label.append(checkbox, text);
    categoryContainer.append(label);
});

resolutions.forEach(resolution => {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.innerHTML = `
        <div class="image-card-top">
            <span class="image-resolution">${resolution} × ${resolution}</span>
            ${resolution === 512 ? '<span class="image-required">Obligatoria</span>' : '<span class="image-optional">Opcional</span>'}
        </div>
        <div class="image-preview" aria-hidden="true"><span>+</span></div>
        <p class="image-name" id="image-name-${resolution}">Ninguna imagen seleccionada</p>
        <button class="secondary-button" type="button" data-resolution="${resolution}">Seleccionar imagen</button>`;
    imageContainer.append(card);
});

function addPathRow(value) {
    const row = document.createElement('div');
    row.className = 'path-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'executable-path';
    input.placeholder = '%appdata%/Aplicacion/programa.exe';
    input.value = value || '';
    input.setAttribute('aria-label', 'Ruta al ejecutable');

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-path';
    removeButton.textContent = '×';
    removeButton.setAttribute('aria-label', 'Eliminar ruta');
    removeButton.addEventListener('click', () => row.remove());

    row.append(input, removeButton);
    pathsContainer.append(row);
}

function defaultUninstallPath(firstPath) {
    const trimmed = firstPath.trim();
    if (!trimmed) return '';
    const separatorIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    return `${trimmed.slice(0, separatorIndex + 1)}unins000.exe`;
}

addPathRow('');
document.getElementById('add-path').addEventListener('click', () => addPathRow(''));

idInput.addEventListener('input', () => {
    idEdited = true;
    updateIcon();
});
nameInput.addEventListener('input', () => {
    if (!idEdited) {
        idInput.value = nameInput.value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        updateIcon();
    }
});

imageContainer.addEventListener('click', async event => {
    const button = event.target.closest('[data-resolution]');
    if (!button) return;

    const resolution = Number(button.dataset.resolution);
    try {
        const selectedImage = await window.packageCompiler.selectImage(resolution);
        if (!selectedImage) return;
        images[String(resolution)] = selectedImage.path;
        document.getElementById(`image-name-${resolution}`).textContent = selectedImage.name;
        const preview = document.createElement('img');
        preview.src = selectedImage.preview;
        preview.alt = '';
        const previewContainer = button.closest('.image-card').querySelector('.image-preview');
        previewContainer.replaceChildren(preview);
        button.textContent = 'Cambiar imagen';
        button.closest('.image-card').classList.add('has-image');
        showStatus('', false);
    } catch (error) {
        showStatus(error.message, true);
    }
});

function collectAppData() {
    const id = idInput.value.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
        throw new Error('El ID debe usar minúsculas, números y guiones (por ejemplo: mi-aplicacion).');
    }

    const name = nameInput.value.trim();
    const description = document.getElementById('app-description').value.trim();
    const download = document.getElementById('app-download').value.trim();
    if (!name || !description || !download) {
        throw new Error('Completa el nombre, la descripción y el enlace de descarga.');
    }

    const paths = Array.from(document.querySelectorAll('.executable-path'))
        .map(input => input.value.trim())
        .filter(Boolean);
    if (paths.length === 0) throw new Error('Añade al menos una ruta al ejecutable.');

    const selectedCategories = Array.from(categoryContainer.querySelectorAll('input:checked'))
        .map(input => input.value);
    if (selectedCategories.length === 0) throw new Error('Selecciona al menos una categoría.');
    if (!images['512']) throw new Error('Selecciona la imagen obligatoria de 512 × 512 píxeles.');

    const uninstallInput = document.getElementById('app-uninstall').value.trim();
    return {
        id,
        name,
        description,
        category: selectedCategories,
        icon: `../assets/apps/${id}.png`,
        paths,
        download,
        uninstall: uninstallInput || defaultUninstallPath(paths[0]),
        steam: document.getElementById('app-steam').value,
        wifi: document.getElementById('app-wifi').value,
        'share-compatibility': 'no',
        'virus-alert': document.getElementById('app-virus').value,
        verified: 'false'
    };
}

form.addEventListener('submit', async event => {
    event.preventDefault();
    showStatus('', false);

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    let appData;
    try {
        appData = collectAppData();
    } catch (error) {
        showStatus(error.message, true);
        return;
    }

    submitButton.disabled = true;
    submitButton.querySelector('span').textContent = 'Generando...';
    try {
        const outputPath = await window.packageCompiler.createPackage({ app: appData, images });
        if (outputPath) showStatus(`Paquete creado: ${outputPath}`, false);
    } catch (error) {
        showStatus(`No se pudo crear el paquete: ${error.message}`, true);
    } finally {
        submitButton.disabled = false;
        submitButton.querySelector('span').textContent = 'Generar paquete ZIP';
    }
});
