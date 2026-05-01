document.addEventListener("DOMContentLoaded", async () => {
  const statusText = document.getElementById("status-text");
  const progressFill = document.getElementById("progress-fill");
  const downloadedText = document.getElementById("downloaded-text");
  const totalText = document.getElementById("total-text");
  const speedText = document.getElementById("speed-text");
  const backBtn = document.getElementById("back-to-apps");

  const params = new URLSearchParams(window.location.search);
  const requestedProgramId = params.get("id");

  let selectedId = requestedProgramId;
  let isInstalling = false;
  let totalSize = 0;

  const navButtons = [
    backBtn,
    document.getElementById("open-updates"),
    document.getElementById("open-licenses"),
    document.getElementById("open-info"),
    document.getElementById("open-settings-header"),
    document.getElementById("open-big-picture"),
  ].filter(Boolean);

  const disableNavigation = (disable) => {
    navButtons.forEach((btn) => {
      btn.disabled = disable;
      btn.style.pointerEvents = disable ? "none" : "auto";
      if (disable) {
        btn.classList.add("disabled");
      } else {
        btn.classList.remove("disabled");
      }
    });

    if (disable) {
      window.onbeforeunload = (event) => {
        event.preventDefault();
        event.returnValue = "La instalación está en curso. Debes esperar a que termine.";
      };
    } else {
      window.onbeforeunload = null;
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === null || bytes === undefined || isNaN(bytes)) return "-";
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let value = bytes;
    while (value >= 1024 && i < sizes.length - 1) {
      value /= 1024;
      i += 1;
    }
    return `${value.toFixed(1)} ${sizes[i]}`;
  };

  const formatSpeed = (bytesPerSecond) => {
    if (!bytesPerSecond || isNaN(bytesPerSecond)) return "0 B/s";
    return `${formatBytes(bytesPerSecond)}/s`;
  };

  const setStatus = (message) => {
    statusText.textContent = message;
  };

  const updateProgressUI = (progress) => {
    if (selectedId !== progress.id) return;
    const percent = progress.percent || 0;
    progressFill.style.width = `${Math.min(100, Math.max(0, percent * 100))}%`;
    downloadedText.textContent = formatBytes(progress.downloaded || 0);
    totalText.textContent = totalSize > 0 ? formatBytes(totalSize) : (progress.total ? formatBytes(progress.total) : "--");
    speedText.textContent = formatSpeed(progress.speed);
    setStatus(progress.message || "Descargando...");
  };

  const fetchProgramInfo = async () => {
    try {
      const files = await window.api.getFilesApps();
      const fileApp = files.find((f) => f.id === selectedId);
      if (fileApp && fileApp.files && Array.isArray(fileApp.files)) {
        totalSize = fileApp.files.reduce((sum, fileName) => {
          const match = fileName.match(/-(\\d+)([KMG]?)B?\\.zip/);
          if (match) {
            let bytes = parseInt(match[1]);
            const unit = match[2];
            if (unit === "K") bytes *= 1024;
            else if (unit === "M") bytes *= 1024 * 1024;
            else if (unit === "G") bytes *= 1024 * 1024 * 1024;
            return sum + bytes;
          }
          return sum;
        }, 0);
      }
    } catch (err) {
      console.error("Error fetching program info:", err);
    }
  };

  const startInstall = async () => {
    if (!selectedId || isInstalling) return;

    isInstalling = true;
    disableNavigation(true);
    setStatus("Iniciando descarga...");
    progressFill.style.width = "0%";

    try {
      await window.api.installProgramById(selectedId);
      setStatus("Instalación finalizada correctamente.");
      progressFill.style.width = "100%";
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message || "Falló la instalación"}`);
    } finally {
      isInstalling = false;
      disableNavigation(false);
    }
  };

  window.api.onInstallProgress((_event, progress) => {
    updateProgressUI(progress);
  });

  window.api.onInstallComplete((_event, info) => {
    if (info?.id !== selectedId) return;
    setStatus(info.message || "Instalación completada.");
    progressFill.style.width = "100%";
  });

  window.api.onInstallError((_event, error) => {
    if (error?.id !== selectedId) return;
    setStatus(error.message || "Error durante la instalación.");
  });

  window.api.setDiscordActivity({
    details: "Descargando programa",
    state: "Instalación en curso",
  });

  backBtn.addEventListener("click", () => {
    if (!isInstalling) {
      window.location.href = "index.html";
    }
  });

  document
    .getElementById("open-updates")
    ?.addEventListener("click", () => {
      if (!isInstalling) window.location.href = "updates.html";
    });
  document
    .getElementById("open-licenses")
    ?.addEventListener("click", () => {
      if (!isInstalling) window.location.href = "licencias.html";
    });
  document.getElementById("open-info")?.addEventListener("click", () => {
    if (!isInstalling) window.location.href = "info.html";
  });
  document
    .getElementById("open-settings-header")
    ?.addEventListener("click", () => {
      if (!isInstalling) window.location.href = "settings.html";
    });
  document
    .getElementById("open-big-picture")
    ?.addEventListener("click", () => {
      if (!isInstalling) window.api.openBigPicture();
    });

  // Auto-start installation if ID is provided
  if (selectedId) {
    await fetchProgramInfo();
    startInstall();
  } else {
    setStatus("No se especificó programa a descargar.");
  }
});
