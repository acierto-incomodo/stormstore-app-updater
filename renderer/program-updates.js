document.addEventListener("DOMContentLoaded", async () => {
  const programSelect = document.getElementById("program-select");
  const installBtn = document.getElementById("install-btn");
  const refreshBtn = document.getElementById("refresh-programs");
  const statusText = document.getElementById("status-text");
  const progressFill = document.getElementById("progress-fill");
  const downloadedText = document.getElementById("downloaded-text");
  const totalText = document.getElementById("total-text");
  const speedText = document.getElementById("speed-text");
  const detailsList = document.getElementById("details-list");
  const backBtn = document.getElementById("back-to-apps");

  const params = new URLSearchParams(window.location.search);
  const requestedProgramId = params.get("id");

  let programs = [];
  let selectedId = null;
  let isInstalling = false;

  const navButtons = [
    backBtn,
    document.getElementById("open-updates"),
    document.getElementById("open-program-updates"),
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
    totalText.textContent = progress.total ? formatBytes(progress.total) : "--";
    speedText.textContent = formatSpeed(progress.speed);
    setStatus(progress.message || "Descargando...");
  };

  const renderDetails = (program) => {
    detailsList.innerHTML = "";
    if (!program) return;

    const fields = [
      ["ID", program.id],
      ["Nombre", program.name],
      ["Origen", program.fromFiles ? "files.apps.json" : "apps.json"],
      ["Archivos", program.fileData ? program.fileData.files.join(", ") : "N/A"],
      ["URL de descarga", program.fileData ? program.fileData.downloadUrl : program.appData?.download || program.appData?.downloadUrl || "N/A"],
      ["Ruta de extracción", program.fileData ? program.fileData.extractPath || "N/A" : "N/A"],
      ["Ejecutable esperado", program.fileData ? program.fileData.executablePath || "N/A" : program.appData?.paths?.[0] || "N/A"],
    ];

    if (program.fileData && program.fileData.checksumUrl) {
      fields.push(["Checksum", program.fileData.checksumUrl]);
    }

    if (program.appData && program.appData.description) {
      fields.push(["Descripción", program.appData.description]);
    }

    fields.forEach(([key, value]) => {
      const item = document.createElement("div");
      item.className = "info-row";
      item.innerHTML = `<span>${key}</span><strong>${value || "-"}</strong>`;
      detailsList.appendChild(item);
    });
  };

  const refreshPrograms = async () => {
    setStatus("Cargando catálogo...");
    progressFill.style.width = "0%";
    downloadedText.textContent = "0 B";
    totalText.textContent = "-";
    speedText.textContent = "0 B/s";

    try {
      const [apps, files] = await Promise.all([
        window.api.getApps(),
        window.api.getFilesApps(),
      ]);

      const map = new Map();

      apps.forEach((app) => {
        map.set(app.id, {
          id: app.id,
          name: app.name,
          description: app.description || "",
          fromApps: true,
          fromFiles: false,
          appData: app,
        });
      });

      files.forEach((fileEntry) => {
        const existing = map.get(fileEntry.id);
        if (existing) {
          existing.fromFiles = true;
          existing.fileData = fileEntry;
        } else {
          map.set(fileEntry.id, {
            id: fileEntry.id,
            name: fileEntry.name || fileEntry.id,
            description: "",
            fromApps: false,
            fromFiles: true,
            fileData: fileEntry,
          });
        }
      });

      programs = Array.from(map.values()).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );

      programSelect.innerHTML = "";
      programs.forEach((program) => {
        const option = document.createElement("option");
        option.value = program.id;
        option.textContent = `${program.name} ${program.fromFiles && !program.fromApps ? "(files.apps)" : ""}`;
        programSelect.appendChild(option);
      });

      selectedId = programs.length > 0 ? programs[0].id : null;
      if (requestedProgramId) {
        const requested = programs.find((item) => item.id === requestedProgramId);
        if (requested) {
          selectedId = requested.id;
        }
      }
      programSelect.value = selectedId;
      renderDetails(programs.find((item) => item.id === selectedId));
      setStatus(programs.length > 0 ? "Selecciona un programa para ver detalles." : "No hay programas disponibles.");

      if (requestedProgramId) {
        const requested = programs.find((item) => item.id === requestedProgramId);
        if (requested && requested.fromFiles) {
          setTimeout(() => {
            startInstall();
          }, 200);
        }
      }
    } catch (error) {
      console.error(error);
      setStatus("Error cargando catálogo. Intenta de nuevo.");
    }
  };

  programSelect.addEventListener("change", (event) => {
    selectedId = event.target.value;
    renderDetails(programs.find((item) => item.id === selectedId));
    setStatus("Listo para instalar.");
  });

  const startInstall = async () => {
    if (!selectedId || isInstalling) return;
    const program = programs.find((item) => item.id === selectedId);
    if (!program) return;

    isInstalling = true;
    disableNavigation(true);
    installBtn.disabled = true;
    refreshBtn.disabled = true;
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
      installBtn.disabled = false;
      refreshBtn.disabled = false;
      disableNavigation(false);
    }
  };

  installBtn.addEventListener("click", startInstall);

  refreshBtn.addEventListener("click", () => refreshPrograms());

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
    details: "Gestionando descargas",
    state: "Descargando programas",
  });

  backBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  document
    .getElementById("open-updates")
    ?.addEventListener("click", () => {
      window.location.href = "updates.html";
    });
  document
    .getElementById("open-program-updates")
    ?.addEventListener("click", () => {
      window.location.href = "program-updates.html";
    });
  document
    .getElementById("open-licenses")
    ?.addEventListener("click", () => {
      window.location.href = "licencias.html";
    });
  document.getElementById("open-info")?.addEventListener("click", () => {
    window.location.href = "info.html";
  });
  document
    .getElementById("open-settings-header")
    ?.addEventListener("click", () => {
      window.location.href = "settings.html";
    });
  document
    .getElementById("open-big-picture")
    ?.addEventListener("click", () => {
      window.api.openBigPicture();
    });

  refreshPrograms();
});
