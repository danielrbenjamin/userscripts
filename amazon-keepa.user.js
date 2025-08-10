// ==UserScript==
// @name         Amazon Keepa
// @namespace    danielrbenjamin
// @version      1.0.3
// @description  Adds a lazy-loaded Keepa price chart to Amazon pages. No GM_* APIs. Fixes requestIdleCallback usage, prevents duplicate runs, throttles SPA mutations, and falls back to extension proxy fetch to bypass CSP.
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
// ==/UserScript==

(function () {
  'use strict';

  // -----------------------------
  // Duplicate-run guard (works even with multiple managers)
  // -----------------------------
  if (document.documentElement.hasAttribute('data-amazon-keepa-only-active')) return;
  document.documentElement.setAttribute('data-amazon-keepa-only-active', '1');

  // -----------------------------
  // Helpers (matching the original style)
  // -----------------------------
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

  // Fixed onIdle: pass an object to requestIdleCallback; fallback to setTimeout
  function onIdle(fn){
    if (typeof window.requestIdleCallback === 'function') {
      try { return window.requestIdleCallback(fn, { timeout: 1000 }); }
      catch { return setTimeout(fn, 0); }
    }
    return setTimeout(fn, 0);
  }

  function throttle(fn, ms=200){
    let t=0, pending=false;
    return (...a)=>{
      const now=Date.now();
      if (now - t >= ms) { t=now; fn(...a); }
      else if (!pending) { pending=true; setTimeout(()=>{ pending=false; t=Date.now(); fn(...a); }, ms - (now - t)); }
    };
  }

  function getLocale(){
    const h=location.hostname;
    if(h.includes('.co.uk'))return'uk';
    if(h.includes('.de'))return'de';
    if(h.includes('.fr'))return'fr';
    if(h.includes('.es'))return'es';
    if(h.includes('.it'))return'it';
    if(h.includes('.ca'))return'ca';
    return'us';
  }
  const locale=getLocale();

  function detectASIN(){
    const m=location.href.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
    if(m) return m[1];
    const meta=$('input#ASIN')||$('[name="ASIN.0"]')||$('[name="ASIN"]');
    if(meta?.value) return meta.value;
    const body=document.body.getAttribute('data-asin')||document.body.getAttribute('data-asin-candidate');
    if(body && /^[A-Z0-9]{10}$/.test(body)) return body;
    const el=$('[data-asin]'); const g=el?.getAttribute('data-asin');
    return /^[A-Z0-9]{10}$/.test(g||'')?g:null;
  }

  // -----------------------------
  // Placement (same targets as original; add #ppd fallback)
  // -----------------------------
  function appendNearPrice(el){
    const t = $('#unifiedPrice_feature_div')
          || $('#corePrice_feature_div')
          || $('#title')?.closest('.a-section')
          || $('#ppd');
    (t || document.body).appendChild(el);
  }

  // -----------------------------
  // Keepa (with CSP-safe fallback through extension)
  // -----------------------------
  function keepaImgUrl(asin){
    return `https://graph.keepa.com/pricehistory.png?used=1&amazon=1&new=1&domain=${locale}&asin=${asin}`;
  }

  async function setImgSrcWithProxy(img, url){
    // Fast path: direct load (works if CSP allows)
    try {
      img.src = url;
      await new Promise((resolve, reject)=>{
        const ok=()=>{ cleanup(); resolve(); };
        const bad=()=>{ cleanup(); reject(new Error('img-error')); };
        function cleanup(){ img.removeEventListener('load', ok); img.removeEventListener('error', bad); }
        img.addEventListener('load', ok, { once:true });
        img.addEventListener('error', bad, { once:true });
        setTimeout(()=>{ try { if (!img.complete || !img.naturalWidth) bad(); } catch { bad(); } }, 2000);
      });
      return;
    } catch (_) {}

    // Fallback: ask the extension background to fetch as data URL
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'lum_fetchAsDataUrl', url });
        if (res && res.ok && res.dataUrl) {
          img.src = res.dataUrl;
          return;
        }
      } catch (_) {}
    }
    // If both fail, the <a> is still clickable to open Keepa.
  }

  function injectKeepa(asin){
    // If one already exists on this view (e.g., from rapid SPA churn), skip
    if ($('.amazon-keepa-only-box')) return;

    const box=document.createElement('div');
    box.className='amazon-keepa-only-box amazon-enhancer-box';
    box.style.cssText='margin-top:10px;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;';
    box.innerHTML=`
      <b>Keepa:</b>
      <div style="margin-top:6px;">
        <a href="https://keepa.com/#!product/1-${asin}" target="_blank" rel="noopener">
          <img data-src="${keepaImgUrl(asin)}"
               alt="Price history (Keepa)" style="max-width:100%;height:auto;opacity:.001;">
        </a>
      </div>`;
    appendNearPrice(box);

    const img = box.querySelector('img[data-src]');
    lazyLoad(img, async () => {
      const url = img.dataset.src;
      await setImgSrcWithProxy(img, url);
      img.style.opacity='1';
      img.removeAttribute('data-src');
    });
  }

  function lazyLoad(img, onIntersect){
    if(!img) return;
    const io=new IntersectionObserver((entries,o)=>{
      entries.forEach(async e=>{
        if(e.isIntersecting){
          o.unobserve(e.target);
          try { await onIntersect(); } catch {}
        }
      });
    },{ rootMargin:'200px' });
    io.observe(img);
  }

  // -----------------------------
  // SPA handling (throttled)
  // -----------------------------
  const rerender = throttle(()=>{
    const asin = detectASIN();
    if(!asin) return;
    // keep only one box; remove old if ASIN changed
    const existing = $('.amazon-keepa-only-box');
    if (existing && !existing.closest('body')) {
      // rare edge; ensure we have a valid element
      $$('.amazon-keepa-only-box').forEach(n=>n.remove());
    }
    if (!existing) onIdle(()=>injectKeepa(asin));
  }, 250);

  function pageInit(){
    $$('.amazon-keepa-only-box').forEach(n=>n.remove());
    rerender();
  }

  (function hookHistory(){
    const push=history.pushState;
    history.pushState=function(){ const r=push.apply(this,arguments); setTimeout(rerender,50); return r; };
    window.addEventListener('popstate',()=> setTimeout(rerender,50));
  })();

  const mo=new MutationObserver(()=>{ rerender(); });
  mo.observe(document.body, {childList:true, subtree:true});

  // First run
  pageInit();
})();
