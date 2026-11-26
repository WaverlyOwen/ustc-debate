/* Loaded only on Pages, before the shared timer. Web-only modules and assets live here. */
(function (DT) {
  'use strict';
  const repo = 'WaverlyOwen/ustc-debate';
  const releases = 'https://github.com/' + repo + '/releases';
  const filename = 'ustc-debate-timer.html';
  let latest;

  function addDownloadLink(header) {
    const link = document.createElement('a');
    link.className = 'dt-offline-download';
    link.textContent = '下载离线版';
    link.href = releases;
    header.appendChild(link);
    // The releases page also works before the first release and when the public API is rate-limited.
    if (!latest) {
      latest = fetch('https://api.github.com/repos/' + repo + '/releases/latest')
        .then(async response => {
          if (response.status === 404) return false;
          if (!response.ok) return null;
          const release = await response.json();
          return release.assets.some(asset => asset.name === filename);
        }).catch(() => null);
    }
    latest.then(available => {
      if (available) link.href = releases + '/latest/download/' + filename;
      if (available === false) link.textContent = '离线版尚未发布';
    });
  }

  // Match exports contain only the shared timer, including when exported from the web app.
  async function exportSource() {
    async function read(url) {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error('读取计时器资源失败：' + response.status);
      return response.text();
    }
    const [style, main] = await Promise.all([
      read(document.getElementById('dt-web-style').href),
      read(document.getElementById('dt-web-main').src),
    ]);
    return { lang: document.documentElement.lang, title: document.title, style, main };
  }

  DT.web = { addDownloadLink, exportSource };
})(window.DT = window.DT || {});
