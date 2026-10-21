const updateList = document.getElementById("app-list");
const updatesStatus = document.getElementById("updates-status");
const checkUpdatesButton = document.getElementById("check-updates-btn");
const updateAllButton = document.getElementById("update-all-btn");
const assetBase = "../../assets/";

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
    const ids = encodeURIComponent(apps.map((app) => app.id).join(","));
    window.location.href = `../program-updates.html?batch=true&ids=${ids}`;
  };

  if (apps.length === 0) {
    setStatus("");
    renderEmptyState("No hay aplicaciones ni juegos pendientes de actualización.");
    return;
  }

  const updateCount = apps.length === 1 ? "1 actualización disponible." : `${apps.length} actualizaciones disponibles.`;
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
    badge.textContent = "Actualización";

    const updateButton = document.createElement("button");
    updateButton.className = "update-card-button";
    updateButton.type = "button";
    updateButton.textContent = "Actualizar";
    updateButton.addEventListener("click", () => {
      window.location.href = `../program-updates.html?id=${encodeURIComponent(app.id)}`;
    });

    card.append(icon, details, badge, updateButton);
    updateList.appendChild(card);
  });
}

async function loadUpdates(forceSync = false) {
  checkUpdatesButton.disabled = true;
  checkUpdatesButton.textContent = forceSync ? "Buscando..." : "Cargando...";
  updateAllButton.hidden = true;
  setStatus("Buscando actualizaciones...");
  renderEmptyState("Comprobando aplicaciones instaladas...");

  try {
    if (forceSync) await window.api.syncRemoteData();

    const [apps, fileApps] = await Promise.all([
      window.api.getApps(),
      window.api.getFilesApps(),
    ]);
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
    renderUpdates(results.filter((app) => app.updateAvailable));

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

checkUpdatesButton.addEventListener("click", () => loadUpdates(true));
loadUpdates();
