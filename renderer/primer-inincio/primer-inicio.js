document.addEventListener("DOMContentLoaded", () => {
  const nextStepBtn = document.getElementById("next-step-btn");
  const prevStepBtn = document.getElementById("prev-step-btn");
  const finishSetupBtn = document.getElementById("finish-setup-btn");

  const step1 = document.getElementById("step-1");
  const step2 = document.getElementById("step-2");

  const autoUpdatesCheckbox = document.getElementById("auto_updates");
  const startWithWindowsCheckbox = document.getElementById(
    "start_with_windows",
  );

  let currentStep = 1;

  function showStep(stepNumber) {
    step1.classList.remove("active");
    step2.classList.remove("active");

    if (stepNumber === 1) {
      step1.classList.add("active");
    } else if (stepNumber === 2) {
      step2.classList.add("active");
    }
    currentStep = stepNumber;
  }

  nextStepBtn.addEventListener("click", () => {
    showStep(2);
  });

  prevStepBtn.addEventListener("click", () => {
    showStep(1);
  });

  finishSetupBtn.addEventListener("click", async () => {
    const settings = {
      auto_updates: autoUpdatesCheckbox.checked,
      start_with_windows: startWithWindowsCheckbox.checked,
      // Mantener los valores por defecto para show_tray y start_minimized
      // ya que no se configuran en este primer inicio.
      show_tray: true,
      start_minimized: false,
      has_completed_first_launch: true, // Marcar como completado
    };

    try {
      await window.api.saveSettings(settings);
      // Redirigir a la vista principal de la aplicación
      window.location.href = "../index.html";
    } catch (error) {
      console.error("Error al guardar la configuración inicial:", error);
      // Opcional: mostrar un toast o mensaje de error al usuario
      if (window.api.showToast) {
        window.api.showToast(
          "Error al guardar la configuración. Inténtalo de nuevo.",
        );
      }
    }
  });

  // Cargar ajustes por defecto (o los que ya existan si se ha iniciado antes)
  window.api.getSettings().then((settings) => {
    autoUpdatesCheckbox.checked = settings.auto_updates !== false; // Default a true
    startWithWindowsCheckbox.checked = settings.start_with_windows === true;
  });
});