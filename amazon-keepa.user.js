// ==UserScript==
// @name         Amazon Price History: CamelCamelCamel + Keepa (Lite)
// @namespace    quietgorilla
// @version      1.0.0
// @description  Adds CamelCamelCamel and Keepa price history charts to Amazon product pages. Lightweight, lazy-loaded, SPA-aware.
// @author       danielrbenjamin
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
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // -----------------------------
  // Small helpers
  // -----------------------------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const onIdle = (fn) => (window.requestIdleCallback || setTimeout)(fn, 0);
  const throttle = (fn, ms=350) => { let t=0; return (...a)=>{ const n=Date.now(); if(n - t > ms){ t = n; fn(...a); } }; };

  // -----------------------------
  // Locale + ASIN detection
  // -----------------------------
  function getLocale() {
    const h = location.hostname;
    if (h.includes('.co.uk')) return 'uk';
    if (h.includes('.de'))    return 'de';
    if (h.includes('.fr'))    return 'fr';
    if (h.includes('.it'))    return 'it';
    if (h.includes('.es'))    return 'es';
    if (h.includes('.ca'))    return 'ca';
    return 'us'; // .com / smile
  }
  const locale = getLocale();

  // Keepa domain mapping (per API graph host)
  const keepaDomainId = ({
    us: 1, uk: 2, de: 3, fr: 4, ca: 6, it: 7, es: 8
  })[locale] || 1;

  function detectASIN() {
    // URL form /dp/ASIN/ or /gp/product/ASIN/
    const m = location.href.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
    if (m) return m[1];
    const meta = $('#ASIN') || $('[name="ASIN.0"]') || $('[name="ASIN"]');
    if (meta?.value) return meta.value;
    const body = document.body.getAttribute('data-asin') || document.body.getAttribute('data-asin-candidate');
    if (body && /^[A-Z0-9]{10}$/.test(body)) return body;
    const el = $('[data-asin]'); const g = el?.getAttribute('data-asin');
    return /^[A-Z0-9]{10}$/.test(g || '') ? g : null;
  }

  // -----------------------------
  // Styles
  // -----------------------------
  const STYLE_ID = 'qg-pricehistory-style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .qg-box { margin-top:10px; padding:10px; border:1px solid #ccc; border-radius:8px; background: #fff; }
      .qg-box b { font-weight:600; }
      .qg-box img { max-width:100%; height:auto; opacity:0.01; transition: opacity .2s ease; }
      .qg-box img.qg-loaded { opacity:1; }
      @media (prefers-color-scheme: dark) {
        .qg-box { background:#1f1f1f; color:#eee; border-color:#444; }
        .qg-box a { color:#7dddf2; }
      }
    `;
    document.head.appendChild(style);
  }

  // -----------------------------
  // Placement
  // -----------------------------
  function appendToTarget(el) {
    // Try near the price/title area; fall back to the first main section.
    const t = $('#unifiedPrice_feature_div')
          || $('#corePrice_feature_div')
          || $('#title')?.closest('.a-section')
          || $('#ppd'); // product page container
    (t || document.body).appendChild(el);
  }

  // -----------------------------
  // Lazy image loader
  // -----------------------------
  function lazyImageLoad(img) {
    if (!img) return;
    const io = new IntersectionObserver((entries, obs) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          img.src = img.dataset.src;
          img.addEventListener('load', () => img.classList.add('qg-loaded'), { once: true });
          img.removeAttribute('data-src');
          obs.unobserve(e.target);
        }
      }
    }, { rootMargin: '200px' });
    io.observe(img);
  }

  // -----------------------------
  // Renderers
  // -----------------------------
  function injectCamel(asin) {
    const urlChart = `https://charts.camelcamelcamel.com/${locale}/${asin}/amazon-new-used.png?force=1&zero=0&w=600&h=340`;
    const urlPage  = `https://${locale}.camelcamelcamel.com/product/${asin}`;
    const div = document.createElement('div');
    div.className = 'qg-box';
    div.innerHTML = `
      <b>CamelCamelCamel</b>
      <div style="margin-top:6px;">
        <a href="${urlPage}" target="_blank" rel="noopener">
          <img data-src="${urlChart}" alt="CamelCamelCamel price history">
        </a>
      </div>
    `;
    appendToTarget(div);
    lazyImageLoad($('img[data-src]', div));
  }

  function injectKeepa(asin) {
    const chart = `https://graph.keepa.com/pricehistory.png?amazon=1&new=1&used=1&domain=${keepaDomainId}&asin=${asin}`;
    const link  = `https://keepa.com/#!product/${keepaDomainId}-${asin}`;
    const div = document.createElement('div');
    div.className = 'qg-box';
    div.innerHTML = `
      <b>Keepa</b>
      <div style="margin-top:6px;">
        <a href="${link}" target="_blank" rel="noopener">
          <img data-src="${chart}" alt="Keepa price history">
        </a>
      </div>
    `;
    appendToTarget(div);
    lazyImageLoad($('img[data-src]', div));
  }

  function render() {
    $$('.qg-box').forEach(n => n.remove());
    const asin = detectASIN();
    if (!asin) return;
    injectCamel(asin);
    injectKeepa(asin);
  }

  // -----------------------------
  // SPA awareness (Amazon uses soft navigation)
  // -----------------------------
  const rerender = throttle(render, 500);

  // Re-render on DOM mutations (results in-place updates when the PDP swaps)
  const mo = new MutationObserver(rerender);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Hook history changes (soft nav)
  (function hookHistory() {
    const push = history.pushState;
    history.pushState = function () {
      const r = push.apply(this, arguments);
      setTimeout(rerender, 60);
      return r;
    };
    window.addEventListener('popstate', () => setTimeout(rerender, 60));
  })();

  // Initial
  onIdle(render);
})();
