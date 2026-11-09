window.__ModuleLoader__.load({
  id: '@local/present-download',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'present-download';

    const zh = {
      'download.title': '下载',
      'download.aria': '下载文件'
    };
    const en = {
      'download.title': 'Download',
      'download.aria': 'Download file'
    };

    /** Browser-relative route of the Host download endpoint (see host index.js). */
    const DOWNLOAD_ROUTE = 'api/present.download';

    const STYLE_ID = '@local/present-download/client.css';
    const CSS = [
      '[data-present-download]{display:inline-grid;place-items:center;width:28px;height:28px;padding:0;',
      'border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);',
      'cursor:pointer;font-size:12px;line-height:1}',
      '[data-present-download]:hover{background:var(--dsw-alias-bg-layer-2)}',
      '[data-present-download]:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '[data-present-download]:disabled{opacity:.5;cursor:default}'
    ].join('');

    /** Rebuild the download URL from the card's action coordinates (sessionId/seq/index). */
    function downloadUrlOf(actionUrl) {
      const q = actionUrl.indexOf('?');
      return DOWNLOAD_ROUTE + (q === -1 ? '' : actionUrl.slice(q));
    }

    /** Extract a filename from a Content-Disposition header. */
    function filenameOf(disposition) {
      if (!disposition) return undefined;
      const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      if (star) {
        try { return decodeURIComponent(star[1]); } catch { return star[1]; }
      }
      const plain = /filename="?([^";]+)"?/i.exec(disposition);
      return plain ? plain[1] : undefined;
    }

    function DownloadIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
        h('path', { d: 'M8 1.5v8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
        h('path', { d: 'M4.5 6.5 8 10l3.5-3.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M2.5 13h11', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' })
      );
    }

    function DownloadButton(props, t) {
      const { actionUrl } = props;

      // Download via the HTTP(S) endpoint (never a blob: URL). First ask the
      // Host for the real filename with a lightweight GET (headers only), then
      // set it on the anchor's `download` attribute so the download manager
      // names the file correctly instead of falling back to the URL's
      // "present.download" basename.
      const onClick = async () => {
        const url = new URL(downloadUrlOf(actionUrl), window.location.href);
        let name = '';
        try {
          const controller = new AbortController();
          const res = await fetch(url.href, { signal: controller.signal });
          if (res.ok) name = filenameOf(res.headers.get('content-disposition')) || '';
          controller.abort();
        } catch {
          name = '';
        }
        const a = document.createElement('a');
        a.href = url.href;
        if (name) a.download = name;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
      };

      return h('button', {
        type: 'button',
        'data-present-download': true,
        title: t('download.title'),
        'aria-label': t('download.aria'),
        onClick
      }, h(DownloadIcon));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'present-download: dictionaries');
        const t = ctx.locale.bind(NS);
        ctx.effect(() => {
          if (document.querySelector('style[data-plugin-css=' + JSON.stringify(STYLE_ID) + ']')) return;
          const style = document.createElement('style');
          style.dataset.plugin = '@local/present-download';
          style.dataset.pluginCss = STYLE_ID;
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'present-download: styles');
        ctx.slots.inject('deliverables.file.actions', () => ctx.slots.register({
          name: 'deliverables.file.actions',
          id: 'present-download',
          locale: NS,
          order: 10
        }, (props) => DownloadButton(props, t)));
      }
    };
  }
});
