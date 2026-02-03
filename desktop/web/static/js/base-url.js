(function () {
  if (window.CHOWKIDAR_BASE_URL) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const base = params.get("baseUrl") || params.get("base_url");
  let resolvedBase = base;
  if (!resolvedBase) {
    try {
      const stored = sessionStorage.getItem("chowkidar_selected_server");
      if (stored) {
        const selected = JSON.parse(stored);
        if (selected && selected.url) {
          resolvedBase = selected.url;
        }
      }
    } catch (error) {
      resolvedBase = null;
    }
  }
  if (!resolvedBase) {
    return;
  }

  try {
    const parsed = new URL(resolvedBase);
    window.CHOWKIDAR_BASE_URL = parsed.origin;
  } catch (error) {
    window.CHOWKIDAR_BASE_URL = resolvedBase.replace(/\/$/, "");
  }
})();
