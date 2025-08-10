// ==UserScript==
// @name         Amazon Keepa Chart (Lite)
// @namespace    Eliminater74
// @version      1.0.0
// @description  Adds a lazy-loaded Keepa price history chart to Amazon product pages. Compatible with the Lite Userscript Manager (MV3).
// @author       Eliminater74
// @license      MIT
// @match        https://www.amazon.com/*
// @match        https://smile.amazon.com/*
// @match        https://www.amazon.co.uk/*
// @match        https://www.amazon.de/*
// @match        https://www.amazon.fr/*
// @match        https://www.amazon.it/*
// @match        https://www.amazon.es/*
// @match        https://www.amazon.ca/*
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ---------- Minimal helpers ----------
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const onIdle=(fn)=>(window.requestIdleCallback||setTimeout)(fn,0);

  function getLocale() {
    const h = location.hostname;
    if (h.includes('.co.uk')) return 'uk';
    if (h.includes('.de'))    return 'de';
    if (h.includes('.fr'))    return 'fr';
    if (h.includes('.it'))    return 'it';
    if (h.includes('.es'))    return 'es';
    if (h.includes('.ca'))    return 'ca';
    return 'us';
  }
  const locale = getLocale();

  function detectASIN() {
    // URL path pattern
    const m = location.href.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
    if (m) return m[1];
    // Hidden inputs
    const meta = $('#ASIN') || $('[name="ASIN.0"]') || $('[name="ASIN"]');
    if (meta?.value) return meta.value;
    // Body data attributes
    const bodyAsin = document.body.getAttribute('data-asin') || document.body.getAttribute('data-asin-candidate');
    if (bodyAsin && /^[A-Z0-9]{10}$/.test(bodyAsin)) return bodyAsin;
    // Fallback any element with data-asin
    const el = $('[data-asin]');
    const g = el?.getAttribute('data-asin');
    return /^[A-Z0-9]{10}$/.test(g || '') ? g : null;
  }

  function appendNearPrice(el) {
    // Try common price/title containers
    const t = $('#unifiedPrice_feature_div') ||
              $('#corePrice_feature_div')   ||
              $('#title')?.closest('.a-section') ||
              $('#ppd'); // generic product page container
    (t || document.body).appendChild(el);
  }

  // ---------- Keepa (lazy image) ----------
  function injectKeepaLazy(asin) {
    const box = document.createElement('div');
    box.className = 'amazon-keepa-lite';
    box.style.cssText = 'margin-top:10px;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;';
    box.innerHTML = `
      <b>Keepa:</b>
      <div style="margin-top:6px;">
        <a href="https://keepa.com/#!product/1-${asin}" target="_blank" rel="noopener">
          <img data-src="https://graph.keepa.com/pricehistory.png?used=1&amazon=1&new=1&domain=${locale}&asin=${asin}"
               alt="Price history (Keepa)" style="max-width:100%;height:auto;opacity:.001;">
        </a>
      </div>
    `;
    appendNearPrice(box);
    const img = box.querySelector('img[data-src]');
    lazyImageLoad(img);
  }

  function lazyImageLoad(img) {
    if (!img) return;
    const io = new IntersectionObserver((entries, o) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          img.src = img.dataset.src;
          img.style.opacity = '1';
          img.removeAttribute('data-src');
          o.unobserve(e.target);
        }
      });
    }, { rootMargin: '200px' });
    io.observe(img);
  }

  // ---------- SPA-awareness + init ----------
  function render() {
    const asin = detectASIN();
    if (!asin) return;
    // Remove old instances (in case of SPA nav)
    $$('.amazon-keepa-lite').forEach(n => n.remove());
    onIdle(() => injectKeepaLazy(asin));
  }

  // Handle Amazon SPA navigations
  (function hookHistory(){
    const push = history.pushState;
    history.pushState = function () {
      const r = push.apply(this, arguments);
      setTimeout(render, 50);
      return r;
    };
    window.addEventListener('popstate', () => setTimeout(render, 50));
  })();

  const mo = new MutationObserver(() => {
    // If title/price area changes on SPA updates, reinsert (throttled by quick removal+readd logic)
    if (!document.querySelector('.amazon-keepa-lite')) {
      render();
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // First load
  render();
})();
