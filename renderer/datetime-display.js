// Usar dayjs desde el contexto global (expuesto por preload.js)
// O desde window.dayjs si está disponible

function initializeDateTimeDisplay() {
  const datetimeElement = document.getElementById('datetime-display');
  
  if (!datetimeElement) return;

  function updateDateTime() {
    try {
      // Obtener la fecha y hora actual usando dayjs
      const now = window.dayjs ? window.dayjs() : dayjs();
      const formatted = now.format('ddd, DD MMM | HH:mm:ss');
      datetimeElement.textContent = formatted;
    } catch (error) {
      console.error('Error actualizando fecha/hora:', error);
    }
  }

  // Actualizar inmediatamente
  updateDateTime();

  // Actualizar cada segundo
  setInterval(updateDateTime, 1000);
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDateTimeDisplay);
} else {
  initializeDateTimeDisplay();
}
