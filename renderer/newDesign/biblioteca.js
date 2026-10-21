const updateList = document.getElementById("app-list");
const updatesStatus = document.getElementById("updates-status");
const checkUpdatesButton = document.getElementById("check-updates-btn");
const updateAllButton = document.getElementById("update-all-btn");
const assetBase = "../../assets/";
const updateStates = new Map();

function appIconUrl(icon) {
  const rendererAssetPrefix = "../assets/";
  return typeof icon === "string" && icon.startsWith(rendererAssetPrefix)
    ? `${assetBase}${icon.slice(rendererAssetPrefix.length)}`
    : icon;
}

function setStatus(message, isError = false) {
  updatesStatus.textContent = message;
  updatesStatus.classList.toggle("error", isError);
}

function renderEmptyState(message) {
  updateList.innerHTML = "";
  const emptyState = document.createElement("div");
  emptyState.className = "updates-empty";

  const icon = document.createElement("i");
  icon.className = "fa-solid fa-download";
  icon.setAttribute("aria-hidden", "true");

  const text = document.createElement("p");
  text.className = "mt-4 text-sm";
  text.textContent = message;

  emptyState.append(icon, text);
  updateList.appendChild(emptyState);
}

function renderUpdates(apps) {
  updateList.innerHTML = "";
  updateAllButton.hidden = apps.length === 0;
  updateAllButton.onclick = () => {
    queueUpdates(apps);
  };

  if (apps.length === 0) {
    setStatus("");
    renderEmptyState("No hay aplicaciones ni juegos pendientes de actualización.");
    return;
  }

  const updateCount =
    apps.length === 1
      ? "1 actualización disponible."
      : `${apps.length} actualizaciones disponibles.`;
  setStatus(updateCount);

  apps.forEach((app) => {
    const card = document.createElement("article");
    card.className = "update-card";

    const icon = document.createElement("img");
    icon.className = "update-card-icon";
    icon.src = appIconUrl(app.icon);
    icon.alt = "";
    icon.onerror = () => {
      icon.onerror = null;
      icon.src = `${assetBase}icons/not-found.svg`;
    };

    const details = document.createElement("div");
    details.className = "update-card-details";

    const title = document.createElement("h3");
    title.className = "update-card-title";
    title.textContent = app.name || app.id;

    const description = document.createElement("p");
    description.className = "update-card-description";
    description.textContent = app.description || "Actualización disponible";
    details.append(title, description);

    if (app.installedVersion) {
      const version = document.createElement("p");
      version.className = "update-card-version";
      version.textContent = `Versión instalada: ${app.installedVersion}`;
      details.appendChild(version);
    }

    const badge = document.createElement("span");
    badge.className = "update-card-badge";

    const progressContainer = document.createElement("div");
    progressContainer.className = "update-card-progress";
    progressContainer.hidden = true;
    const progressTrack = document.createElement("div");
    progressTrack.className = "update-card-progress-track";
    const progressFill = document.createElement("div");
    progressFill.className = "update-card-progress-fill";
    progressTrack.appendChild(progressFill);
    const progressMessage = document.createElement("span");
    progressMessage.className = "update-card-progress-message";
    progressContainer.append(progressTrack, progressMessage);
    details.appendChild(progressContainer);

    const updateButton = document.createElement("button");
    updateButton.className = "update-card-button";
    updateButton.type = "button";
    updateButton.addEventListener("click", () => {
      queueUpdate(app);
    });

    card.append(icon, details, badge, updateButton);
    updateList.appendChild(card);
    const state = getUpdateState(app.id);
    state.card = card;
    state.badge = badge;
    state.button = updateButton;
    state.progressContainer = progressContainer;
    state.progressFill = progressFill;
    state.progressMessage = progressMessage;
    updateCardState(app.id);
  });
}

function getUpdateState(id) {
  if (!updateStates.has(id)) {
    updateStates.set(id, {
      status: "idle",
      percent: 0,
      message: "",
    });
  }
  return updateStates.get(id);
}

function updateCardState(id) {
  const state = updateStates.get(id);
  if (!state?.card) return;

  const isBusy = state.status === "queued" || state.status === "downloading";
  state.button.disabled = isBusy;
  state.button.textContent =
    state.status === "queued"
      ? "En cola"
      : state.status === "downloading"
        ? "Actualizando..."
        : state.status === "complete"
          ? "Actualizado"
          : state.status === "error"
            ? "Reintentar"
            : "Actualizar";

  state.badge.textContent =
    state.status === "queued"
      ? "En cola"
      : state.status === "downloading"
        ? "Actualizando"
        : state.status === "complete"
          ? "Completado"
          : state.status === "error"
            ? "Error"
            : "Actualización";
  state.badge.classList.toggle("update-card-badge-error", state.status === "error");
  state.badge.classList.toggle("update-card-badge-complete", state.status === "complete");

  const hasProgress = isBusy || state.status === "complete";
  state.progressContainer.hidden = !hasProgress;
  state.progressFill.style.width = `${state.status === "complete" ? 100 : state.percent}%`;
  state.progressMessage.textContent =
    state.message ||
    (state.status === "queued"
      ? "Esperando en la cola..."
      : state.status === "complete"
        ? "Actualización completada"
        : "");
}

async function queueUpdate(app) {
  const state = getUpdateState(app.id);
  if (state.status === "queued" || state.status === "downloading") return;

  state.status = "queued";
  state.percent = 0;
  state.message = "Añadiendo a la cola...";
  updateCardState(app.id);

  try {
    const result = await window.api.enqueueInstall({ id: app.id });
    if (!result?.queued) {
      state.status = "idle";
      state.message = "";
      updateCardState(app.id);
      return;
    }
    if (state.status === "queued") {
      state.message =
        result.position > 1
          ? `Esperando en la cola (posición ${result.position})...`
          : "Iniciando actualización...";
      updateCardState(app.id);
    }
  } catch (error) {
    console.error("Error queueing update for", app.id, error);
    state.status = "error";
    state.message = error.message || "No se pudo iniciar la actualización.";
    updateCardState(app.id);
  }
}

async function queueUpdates(apps) {
  updateAllButton.disabled = true;
  try {
    for (const app of apps) {
      await queueUpdate(app);
    }
  } finally {
    updateAllButton.disabled = false;
  }
}

async function loadUpdates(forceSync = false) {
  checkUpdatesButton.disabled = true;
  checkUpdatesButton.textContent = forceSync ? "Buscando..." : "Cargando...";
  updateAllButton.hidden = true;
  setStatus("Buscando actualizaciones...");
  renderEmptyState("Comprobando aplicaciones instaladas...");

  try {
    if (forceSync) await window.api.syncRemoteData();

    const [apps, fileApps, installStatus] = await Promise.all([
      window.api.getApps(),
      window.api.getFilesApps(),
      window.api.getInstallStatus(),
    ]);
    const busyIds = new Set(
      [installStatus?.active, ...(installStatus?.queued || [])].filter(Boolean),
    );
    const fileAppsById = new Map(
      (fileApps || []).map((fileApp) => [fileApp.id, fileApp]),
    );
    const installedApps = (apps || [])
      .map((app) => ({ ...app, fileApp: fileAppsById.get(app.id) }))
      .filter((app) => app.fileApp && app.installed);

    const results = await Promise.all(
      installedApps.map(async (app) => {
        let checksum;
        try {
          checksum = await window.api.checkChecksum(app.id);
        } catch (error) {
          console.error("Error checking update for", app.id, error);
          return { ...app, checkFailed: true };
        }

        let installedVersion = null;
        try {
          installedVersion = await window.api.getInstalledFileAppVersion(app.id);
        } catch (error) {
          console.error("Error reading installed version for", app.id, error);
        }

        return { ...app, updateAvailable: checksum.needsUpdate, installedVersion };
      }),
    );
    const hasCheckFailures = results.some((app) => app.checkFailed);
    const updatableApps = results.filter((app) => app.updateAvailable);
    updatableApps.forEach((app) => {
      const state = getUpdateState(app.id);
      if (busyIds.has(app.id) && state.status !== "downloading") {
        state.status =
          installStatus.active === app.id ? "downloading" : "queued";
        state.message =
          state.status === "queued"
            ? "Esperando en la cola..."
            : "Actualizando...";
      } else if (!busyIds.has(app.id) && state.status === "queued") {
        state.status = "idle";
        state.message = "";
      } else if (!busyIds.has(app.id) && state.status === "complete") {
        state.status = "idle";
        state.percent = 0;
        state.message = "";
      }
    });
    renderUpdates(updatableApps);

    if (hasCheckFailures) {
      setStatus(
        "No se pudieron comprobar algunas aplicaciones. Consulta la consola para más detalles.",
        true,
      );
    }
  } catch (error) {
    console.error("Error loading library updates:", error);
    updateAllButton.hidden = true;
    renderEmptyState("No se pudieron cargar las actualizaciones. Inténtalo de nuevo.");
    setStatus("Error al buscar actualizaciones.", true);
  } finally {
    checkUpdatesButton.disabled = false;
    checkUpdatesButton.textContent = "Buscar actualizaciones";
  }
}

window.api.onInstallProgress((_event, progress) => {
  const state = updateStates.get(progress?.id);
  if (!state) return;

  state.status = "downloading";
  state.percent = Math.min(
    100,
    Math.max(0, (Number(progress.percent) || 0) * 100),
  );
  state.message = progress.message || "Actualizando...";
  updateCardState(progress.id);
});

window.api.onInstallComplete((_event, info, legacyId) => {
  const success = typeof info === "boolean" ? info : info?.success !== false;
  const id = typeof info === "boolean" ? legacyId : info?.id;
  const state = updateStates.get(id);
  if (!state) return;

  if (!success) {
    state.status = "error";
    state.message =
      (typeof info === "object" && info.message) || "Error durante la actualización.";
    updateCardState(id);
    return;
  }

  state.status = "complete";
  state.percent = 100;
  state.message =
    (typeof info === "object" && info.message) || "Actualización completada.";
  updateCardState(id);
  setTimeout(() => loadUpdates(), 2000);
});

window.api.onInstallError((_event, error) => {
  const state = updateStates.get(error?.id);
  if (!state) return;

  state.status = "error";
  state.message = error.message || "Error durante la actualización.";
  updateCardState(error.id);
});

checkUpdatesButton.addEventListener("click", () => loadUpdates(true));
loadUpdates();
