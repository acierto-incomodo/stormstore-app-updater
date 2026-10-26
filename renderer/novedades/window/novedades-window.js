const versionElement = document.getElementById("release-version");
const titleElement = document.getElementById("release-title");
const statusElement = document.getElementById("release-status");
const bodyElement = document.getElementById("release-body");
const contentElement = document.getElementById("release-content");
const scrollEndButton = document.getElementById("scroll-end-button");
const closeButton = document.getElementById("close-button");

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInline(text) {
  let result = escapeHtml(text);
  result = result.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  result = result.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return result;
}

function renderReleaseBody(body) {
  const elements = [];
  let listItems = [];

  const flushList = () => {
    if (listItems.length) {
      elements.push(`<ul>${listItems.join("")}</ul>`);
      listItems = [];
    }
  };

  body.split(/\r?\n/).forEach((line) => {
    const text = line.trim();
    if (!text) {
      flushList();
      return;
    }

    const listItem = text.match(/^[-*]\s+(.+)/);
    if (listItem) {
      listItems.push(`<li>${formatInline(listItem[1])}</li>`);
      return;
    }

    flushList();
    const heading = text.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      const level = heading[1].length;
      elements.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      return;
    }

    elements.push(`<p>${formatInline(text)}</p>`);
  });

  flushList();
  return elements.join("");
}

function updateScrollButton() {
  const hasMoreContent =
    contentElement.scrollHeight > contentElement.clientHeight + 1;
  const isAtBottom =
    contentElement.scrollTop + contentElement.clientHeight >=
    contentElement.scrollHeight - 1;
  scrollEndButton.hidden = !hasMoreContent || isAtBottom;
}

async function loadReleaseNotes() {
  try {
    const release = await window.api.getReleaseNotesWindowData();
    if (!release) {
      throw new Error("No se recibieron las notas de la versión.");
    }

    versionElement.textContent = release.tagName || "StormStore";
    titleElement.textContent = release.name || "Novedades";
    bodyElement.innerHTML = renderReleaseBody(release.body || "");
    statusElement.hidden = true;
    updateScrollButton();
  } catch (error) {
    console.error("No se pudieron cargar las novedades:", error);
    statusElement.textContent =
      "No se pudieron cargar las novedades. Cierra esta ventana e inténtalo de nuevo.";
    bodyElement.replaceChildren();
  }
}

scrollEndButton.addEventListener("click", () => {
  contentElement.scrollTo({
    top: contentElement.scrollHeight,
    behavior: "smooth",
  });
});
contentElement.addEventListener("scroll", updateScrollButton);
closeButton.addEventListener("click", () => {
  window.api.closeReleaseNotesWindow();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.api.closeReleaseNotesWindow();
});
new ResizeObserver(updateScrollButton).observe(contentElement);

loadReleaseNotes();
