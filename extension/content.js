(function () {
  'use strict';

  if (window.location.hostname === 'localhost') return;

  // ──────────────────────────────────────────────────────────────
  // BLOCKLIST — never run on these domains
  // ──────────────────────────────────────────────────────────────
  const BLOCKED_HOSTS = [
    /youtube\.com/i, /youtu\.be/i,
    /google\./i, /gmail\.com/i, /docs\.google/i,
    /facebook\.com/i, /instagram\.com/i, /twitter\.com/i, /x\.com/i,
    /tiktok\.com/i, /snapchat\.com/i, /pinterest\.com/i, /reddit\.com/i,
    /linkedin\.com/i, /discord\.com/i, /twitch\.tv/i,
    /netflix\.com/i, /hulu\.com/i, /disneyplus\.com/i, /hbomax\.com/i,
    /spotify\.com/i, /soundcloud\.com/i, /pandora\.com/i,
    /github\.com/i, /gitlab\.com/i, /stackoverflow\.com/i,
    /wikipedia\.org/i, /medium\.com/i,
    /nytimes\.com/i, /cnn\.com/i, /bbc\.com/i,
    /onrender\.com/i, /supabase\.co/i, /netlify\.app/i,
  ];

  if (BLOCKED_HOSTS.some((pattern) => pattern.test(window.location.hostname))) return;

  // ──────────────────────────────────────────────────────────────
  // ALLOWLIST — only use generic detection on known shopping domains
  // On unknown sites, ONLY the MutationObserver (state-change) method runs.
  // ──────────────────────────────────────────────────────────────
  const SHOPPING_HOSTS = [
    /amazon\./i, /ebay\./i, /etsy\./i, /target\./i, /walmart\./i,
    /bestbuy\./i, /newegg\./i, /abercrombie\./i, /hollisterco\./i,
    /hm\.com/i, /nike\./i, /asos\./i, /zara\./i, /nordstrom\./i,
    /urbanoutfitters\./i, /forever21\./i, /gap\./i, /oldnavy\./i,
    /macys\./i, /kohls\./i, /jcpenney\./i, /sephora\./i, /ulta\./i,
    /wayfair\./i, /overstock\./i, /chewy\./i, /zappos\./i,
    /adidas\./i, /underarmour\./i, /ralphlauren\./i, /calvinklein\./i,
    /shop\./i, /store\./i, /shopify\./i,
  ];

  const isKnownShoppingSite = SHOPPING_HOSTS.some((p) => p.test(window.location.hostname));

  let dialogEl = null;
  let pendingData = null;
  let lastTriggerTime = 0;

  // Tracks the in-flight "pending click" so it can be cancelled if a login wall appears.
  let cancelPendingClick = null;

  // ──────────────────────────────────────────────────────────────
  // SITE-SPECIFIC CONFIGS
  // ──────────────────────────────────────────────────────────────
  const SITE_CONFIGS = [
    {
      name: 'Amazon',
      hostPattern: /amazon\./i,
      buttonSelectors: [
        '#add-to-wishlist-button',
        '[data-feature-name="wishlistButton"] button',
        '.a-button-wishlist button',
        '#wishlistButton',
      ],
      titleSelector: '#productTitle',
      priceSelector: '.a-price:first-of-type .a-offscreen, #priceblock_ourprice',
      imageSelector: '#landingImage, #imgTagWrapperId img',
    },
    {
      name: 'eBay',
      hostPattern: /ebay\./i,
      buttonSelectors: [
        '.watch-action .btn',
        '[data-track="watchitem"]',
        '.x-atf-action-btn--watch',
        '[aria-label*="Watch" i]',
      ],
      titleSelector: '.x-item-title__mainTitle span, #itemTitle span',
      priceSelector: '.x-price-primary .ux-textspans, #prcIsum',
      imageSelector: '.ux-image-carousel-item.image-treatment img, #icImg',
    },
    {
      name: 'Etsy',
      hostPattern: /etsy\./i,
      buttonSelectors: [
        '[data-test-id="listing-page-favorite-button"]',
        '.favorite-button',
        '[aria-label*="Add to favorites" i]',
        '[aria-label*="Remove from favorites" i]',
      ],
      titleSelector: 'h1[data-buy-box-listing-title], .wt-text-body-03',
      priceSelector: '[data-selector="price-only"] .currency-value',
      imageSelector: '.carousel-image img',
    },
    {
      name: 'Target',
      hostPattern: /target\./i,
      buttonSelectors: [
        '[data-test="wishlistButton"]',
        '[aria-label*="save to list" i]',
        '[aria-label*="Add to list" i]',
      ],
      titleSelector: '[data-test="product-title"]',
      priceSelector: '[data-test="product-price"]',
      imageSelector: '[data-test="product-image"] img',
    },
    {
      name: 'Walmart',
      hostPattern: /walmart\./i,
      buttonSelectors: [
        '[data-automation-id="add-to-list"]',
        '[aria-label*="Add to list" i]',
        '[aria-label*="Save for later" i]',
      ],
      titleSelector: '[itemprop="name"], h1.prod-ProductTitle',
      priceSelector: '[itemprop="price"], .price-characteristic',
      imageSelector: '[data-automation-id="product-image-0"] img',
    },
    {
      name: 'Best Buy',
      hostPattern: /bestbuy\./i,
      buttonSelectors: [
        '.btn-wishlist',
        '[data-track="Add to Wish List"]',
        '[aria-label*="wishlist" i]',
      ],
      titleSelector: '.sku-title h1',
      priceSelector: '.priceView-customer-price span:first-child',
      imageSelector: '.primary-image img',
    },
    {
      name: 'Abercrombie',
      hostPattern: /abercrombie\./i,
      buttonSelectors: [
        '[data-auto-id="wishlist-btn"]',
        '[data-testid="wishlist-btn"]',
        '[aria-label*="wishlist" i]',
        '[aria-label*="Save" i]',
        'button[class*="wishlist" i]',
        'button[class*="save" i]',
      ],
      titleSelector: '[data-auto-id="product-detail-title"], h1[class*="title"]',
      priceSelector: '[data-auto-id="product-price"], [class*="price"]',
      imageSelector: '[data-auto-id="product-image"] img, [class*="product-image"] img',
    },
    {
      name: 'Hollister',
      hostPattern: /hollisterco\./i,
      buttonSelectors: [
        '[data-auto-id="wishlist-btn"]',
        '[aria-label*="wishlist" i]',
        '[aria-label*="Save" i]',
        'button[class*="save" i]',
      ],
      titleSelector: '[data-auto-id="product-detail-title"], h1',
      priceSelector: '[data-auto-id="product-price"]',
      imageSelector: '[class*="product-image"] img',
    },
    {
      name: 'H&M',
      hostPattern: /hm\.com/i,
      buttonSelectors: [
        '[data-testid="add-to-favorites-button"]',
        '[aria-label*="favorite" i]',
        '[aria-label*="wishlist" i]',
        'button[class*="favorite" i]',
      ],
      titleSelector: 'h1[class*="title"]',
      priceSelector: '[class*="price-value"]',
      imageSelector: '.product-detail-main-image-container img',
    },
    {
      name: 'Nike',
      hostPattern: /nike\./i,
      buttonSelectors: [
        '[data-testid="wishlist-button"]',
        '[aria-label*="Favourite" i]',
        '[aria-label*="Favorite" i]',
        'button[class*="favourite" i]',
      ],
      titleSelector: '[data-testid="product_title"]',
      priceSelector: '[data-testid="currentPrice-container"]',
      imageSelector: '[data-testid="hero-image"] img',
    },
    {
      name: 'ASOS',
      hostPattern: /asos\./i,
      buttonSelectors: [
        '[data-testid="saveForLater"]',
        '[aria-label*="Save" i]',
        'button[class*="save" i]',
      ],
      titleSelector: 'h1[class*="product-title"]',
      priceSelector: '[data-testid="current-price"] span',
      imageSelector: '[data-testid="product-gallery"] img',
    },
    {
      name: 'Zara',
      hostPattern: /zara\./i,
      buttonSelectors: [
        '[aria-label*="ADD TO WISHLIST" i]',
        '[aria-label*="wishlist" i]',
        '.zds-button--wishlist',
      ],
      titleSelector: 'h1.product-detail-info__header-name',
      priceSelector: '.price__amount',
      imageSelector: '.media-image__image',
    },
    {
      name: 'Newegg',
      hostPattern: /newegg\./i,
      buttonSelectors: ['.btn-wish', '[title*="Wish List"]'],
      titleSelector: 'h1.product-title',
      priceSelector: '.price-current strong',
      imageSelector: '.product-view-img-original',
    },
    {
      name: 'Nordstrom',
      hostPattern: /nordstrom\./i,
      buttonSelectors: [
        '[aria-label*="wishlist" i]',
        '[aria-label*="Favorite" i]',
        'button[class*="favorite" i]',
        'button[class*="wishlist" i]',
      ],
      titleSelector: 'h1[itemprop="name"]',
      priceSelector: '[itemprop="price"]',
      imageSelector: '[data-element-id="product-images"] img',
    },
    {
      name: 'Urban Outfitters',
      hostPattern: /urbanoutfitters\./i,
      buttonSelectors: [
        '[data-qa="wishlist-btn"]',
        '[aria-label*="wishlist" i]',
        'button[class*="wishlist" i]',
      ],
      titleSelector: 'h1[data-qa="product-title"]',
      priceSelector: '[data-qa="product-price"]',
      imageSelector: '[data-qa="product-image"] img',
    },
  ];

  // ── Generic patterns ──────────────────────────────────────────
  // Matches attributes/classes/text on any shopping site
  const GENERIC_FAVORITE_PATTERN =
    /\b(wish|wishlist|fav|favourite|favorite|heart|save|bookmark|watchlist|watch|like|love|want)\b/i;

  // Detects when a button's state changed TO "favorited"
  // (aria-label now says "Remove from..." meaning the item was just added)
  const JUST_FAVORITED_PATTERN =
    /remove from (wish|fav|save|heart|watch|like|love|list)|added to (wish|fav|save|list)|wishlisted|favorited|saved|in your (list|wish)/i;

  // Selectors that strongly indicate a login wall just appeared.
  // We look for these inside a modal/overlay context after a click.
  const LOGIN_MODAL_SELECTOR = [
    '[class*="login-modal" i]', '[class*="signin-modal" i]', '[class*="auth-modal" i]',
    '[id*="login-modal" i]', '[id*="signin-modal" i]',
    '[data-testid*="login" i]', '[data-testid*="signin" i]',
    '[aria-label*="sign in" i]', '[aria-label*="log in" i]', '[aria-label*="create account" i]',
  ].join(',');

  const LOGIN_URL_PATTERN = /\/(login|signin|sign[_-]in|auth|account\/login|accounts\/login)/i;

  // ── Helpers ───────────────────────────────────────────────────
  function getSiteConfig() {
    const hostname = window.location.hostname;
    return SITE_CONFIGS.find((c) => c.hostPattern.test(hostname)) || null;
  }

  function isLikelyFavoriteElement(el) {
    if (!el || el.tagName === 'BODY' || el.tagName === 'HTML') return false;
    const parts = [
      typeof el.className === 'string' ? el.className : '',
      el.id || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('data-track') || '',
      el.getAttribute('data-test') || '',
      el.getAttribute('data-testid') || '',
      el.getAttribute('data-auto-id') || '',
      el.getAttribute('data-qa') || '',
      el.getAttribute('data-automation-id') || '',
      el.getAttribute('title') || '',
      el.getAttribute('name') || '',
      // Include short button text
      (el.tagName === 'BUTTON' || el.tagName === 'A')
        ? (el.textContent?.trim().slice(0, 60) || '')
        : '',
    ];
    return GENERIC_FAVORITE_PATTERN.test(parts.join(' '));
  }

  // ──────────────────────────────────────────────────────────────
  // LOGIN WALL & CONFIRMATION HELPERS
  // ──────────────────────────────────────────────────────────────

  // Returns true if the page is showing a login wall — either a URL redirect
  // or a login modal that appeared in the DOM.
  function isLoginWallVisible() {
    if (LOGIN_URL_PATTERN.test(window.location.pathname + window.location.search)) return true;

    const candidate = document.querySelector(LOGIN_MODAL_SELECTOR);
    if (!candidate) return false;

    // Only count it as a login wall if it sits inside a visible modal/overlay,
    // not just a buried form somewhere on the page.
    const modal = candidate.closest(
      '[role="dialog"], [role="alertdialog"], .modal, .overlay, .popup, ' +
      '[class*="modal"], [class*="overlay"], [class*="popup"], [class*="drawer"]'
    );
    return !!modal;
  }

  // Returns true if the element's current state indicates the item was favorited.
  function isButtonFavorited(el) {
    if (!el) return false;
    const label   = (el.getAttribute('aria-label') || '').toLowerCase();
    const pressed = el.getAttribute('aria-pressed');
    const checked = el.getAttribute('aria-checked');
    const cls     = typeof el.className === 'string' ? el.className : '';
    return (
      JUST_FAVORITED_PATTERN.test(label) ||
      pressed === 'true' ||
      checked === 'true' ||
      /\b(is-saved|is-wishlisted|is-favorited|is-loved|saved|wishlisted|active)\b/i.test(cls)
    );
  }

  // ──────────────────────────────────────────────────────────────
  // PRODUCT DATA EXTRACTION
  // ──────────────────────────────────────────────────────────────
  function getMeta(name) {
    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return el?.content?.trim() || null;
  }

  function getText(selector) {
    if (!selector) return null;
    for (const sel of selector.split(',').map((s) => s.trim())) {
      const txt = document.querySelector(sel)?.textContent?.trim();
      if (txt) return txt;
    }
    return null;
  }

  function getImageSrc(selector) {
    if (!selector) return null;
    for (const sel of selector.split(',').map((s) => s.trim())) {
      const el = document.querySelector(sel);
      const src = el?.src || el?.getAttribute('data-src') || el?.getAttribute('data-zoom-image');
      if (src && src.startsWith('http')) return src;
    }
    return null;
  }

  function extractJsonLdProduct() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent);
        if (data['@type'] === 'Product') return data;
        if (Array.isArray(data['@graph'])) {
          const p = data['@graph'].find((i) => i['@type'] === 'Product');
          if (p) return p;
        }
        if (Array.isArray(data) && data[0]?.['@type'] === 'Product') return data[0];
      } catch {}
    }
    return null;
  }

  function extractStore() {
    const ogSite = getMeta('og:site_name');
    if (ogSite) return ogSite;
    const config = getSiteConfig();
    if (config) return config.name;
    const hostname = window.location.hostname.replace(/^www\./, '');
    const parts = hostname.split('.');
    const name = parts.length >= 2 ? parts[parts.length - 2] : hostname;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function extractProductData() {
    const config = getSiteConfig();
    const jsonLd = extractJsonLdProduct();

    let title =
      (config && getText(config.titleSelector)) ||
      jsonLd?.name ||
      getMeta('og:title') ||
      getMeta('twitter:title') ||
      document.title;
    title = title?.replace(/\s+/g, ' ').trim() || 'Unknown Product';

    let price = (config && getText(config.priceSelector)) || null;

    if (!price) {
      const priceEl = document.querySelector('[itemprop="price"]');
      if (priceEl) price = priceEl.getAttribute('content') || priceEl.textContent?.trim();
    }
    if (!price && jsonLd?.offers) {
      const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
      const currency = offer?.priceCurrency || 'USD';
      const amount = offer?.price;
      if (amount) price = (currency === 'USD' ? '$' : currency + ' ') + amount;
    }
    if (!price) {
      const ogPrice = getMeta('og:price:amount');
      if (ogPrice) price = '$' + ogPrice;
    }
    if (price) price = price.replace(/\s+/g, ' ').trim();

    let image_url =
      (config && getImageSrc(config.imageSelector)) ||
      getMeta('og:image') ||
      getMeta('twitter:image') ||
      (Array.isArray(jsonLd?.image) ? jsonLd.image[0] : jsonLd?.image) ||
      null;
    if (image_url && !image_url.startsWith('http')) image_url = null;

    return {
      title,
      price: price || null,
      image_url: image_url || null,
      product_url: window.location.href,
      store: extractStore(),
    };
  }

  // ──────────────────────────────────────────────────────────────
  // TRIGGER (shared by click detection and MutationObserver)
  // ──────────────────────────────────────────────────────────────
  function triggerSave() {
    const now = Date.now();
    if (now - lastTriggerTime < 2000) return; // debounce
    lastTriggerTime = now;
    // Short delay lets the page finish updating state/price/image
    setTimeout(() => showDialog(extractProductData()), 400);
  }

  // ──────────────────────────────────────────────────────────────
  // METHOD 1: CLICK DETECTION (capture phase, fires before stopPropagation)
  //
  // Strategy: clicking a suspected favorite button opens a 1-second
  // confirmation window instead of triggering the dialog immediately.
  //
  //  • If a login wall appears within that window  → cancel silently.
  //  • If the button enters a "favorited" state   → trigger (fast path).
  //  • The MutationObserver (Method 2) fires first for React-style apps
  //    where state changes synchronously with the event.
  //  • After 1 s with no login wall, the delayed check sees whether the
  //    button is now favorited and triggers if so (covers deferred updates).
  // ──────────────────────────────────────────────────────────────
  function handleClick(event) {
    const clicked = event.target;
    const config  = getSiteConfig();
    let matchedEl = null;

    // Check site-specific selectors first (always runs on configured sites)
    if (config) {
      for (const sel of config.buttonSelectors) {
        const el = clicked.matches?.(sel) ? clicked : clicked.closest?.(sel);
        if (el) { matchedEl = el; break; }
      }
    }

    // Generic fallback — ONLY on known shopping sites to avoid false positives
    if (!matchedEl && isKnownShoppingSite) {
      let node = clicked;
      for (let i = 0; i < 8; i++) {
        if (!node || node === document.body) break;
        if (isLikelyFavoriteElement(node)) { matchedEl = node; break; }
        node = node.parentElement;
      }
    }

    if (!matchedEl) return;

    // Cancel any existing pending window before starting a new one.
    if (cancelPendingClick) { cancelPendingClick(); cancelPendingClick = null; }

    let cancelled = false;

    // Early login-wall check at 350 ms (covers instant redirects / modal open).
    const t1 = setTimeout(() => {
      if (cancelled) return;
      if (isLoginWallVisible()) { cancelled = true; cancelPendingClick = null; }
    }, 350);

    // Final confirmation at 1000 ms:
    // If the button is now "favorited" and no login wall is showing → trigger.
    // The MutationObserver will already have fired for synchronous state changes,
    // so this only runs when the site delays its state update.
    const t2 = setTimeout(() => {
      if (cancelled) return;
      cancelPendingClick = null;
      if (!isLoginWallVisible() && isButtonFavorited(matchedEl)) {
        triggerSave();
      }
    }, 1000);

    cancelPendingClick = () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }

  // capture=true so we intercept even if the site calls stopPropagation.
  // mousedown covers React/framework buttons that swallow the click event.
  document.addEventListener('click',     handleClick, true);
  document.addEventListener('mousedown', handleClick, true);
  // ──────────────────────────────────────────────────────────────
  // METHOD 2: MUTATION OBSERVER
  // Watches for attribute changes that indicate a button was
  // toggled to the "favorited" state. This catches cases where
  // the click never bubbles at all (React synthetic events, etc.)
  // ──────────────────────────────────────────────────────────────
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const el = mutation.target;
      if (!el || el === dialogEl) continue;

      // aria-label changed — check if it now says "remove from ..." (meaning just added)
      if (mutation.attributeName === 'aria-label') {
        const label = el.getAttribute('aria-label') || '';
        if (JUST_FAVORITED_PATTERN.test(label) && isLikelyFavoriteElement(el)) {
          triggerSave();
          return;
        }
      }

      // aria-pressed or aria-checked toggled to "true" on a favorite-like button
      if (mutation.attributeName === 'aria-pressed' || mutation.attributeName === 'aria-checked') {
        const val = el.getAttribute(mutation.attributeName);
        if (val === 'true' && isLikelyFavoriteElement(el)) {
          triggerSave();
          return;
        }
      }

      // A class like "is-saved", "is-wishlisted", "active" added to a favorite element
      if (mutation.attributeName === 'class') {
        const cls = typeof el.className === 'string' ? el.className : '';
        const added = cls && !mutation.oldValue?.includes(cls);
        if (added && /\b(is-saved|is-wishlisted|is-favorited|is-loved|saved|wishlisted)\b/i.test(cls)) {
          if (isLikelyFavoriteElement(el)) {
            triggerSave();
            return;
          }
        }
      }

      // data-active or similar attribute set to "true"
      if (mutation.attributeName === 'data-active' || mutation.attributeName === 'data-selected') {
        if (el.getAttribute(mutation.attributeName) === 'true' && isLikelyFavoriteElement(el)) {
          triggerSave();
          return;
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeOldValue: true,
    subtree: true,
    attributeFilter: ['aria-label', 'aria-pressed', 'aria-checked', 'class', 'data-active', 'data-selected'],
  });

  // ──────────────────────────────────────────────────────────────
  // DIALOG
  // ──────────────────────────────────────────────────────────────
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showDialog(productData) {
    if (dialogEl) return;
    pendingData = productData;

    dialogEl = document.createElement('div');
    dialogEl.id = 'fhub-root';
    dialogEl.setAttribute('aria-modal', 'true');
    dialogEl.setAttribute('role', 'dialog');
    dialogEl.setAttribute('aria-label', 'Save to FavoritesHub');

    dialogEl.innerHTML = `
      <div id="fhub-card">
        <div id="fhub-header">
          <div id="fhub-logo">
            <span id="fhub-logo-icon">❤️</span>
            <span id="fhub-logo-text">FavoritesHub</span>
          </div>
          <button id="fhub-close" aria-label="Dismiss" title="Dismiss">×</button>
        </div>

        <p id="fhub-prompt">Save this item to your list?</p>

        <div id="fhub-product">
          ${productData.image_url
            ? `<img id="fhub-img" src="${esc(productData.image_url)}" alt="" onerror="this.style.display='none'" />`
            : `<div id="fhub-img-placeholder">🛍️</div>`}
          <div id="fhub-product-info">
            <div id="fhub-store-label">${esc(productData.store)}</div>
            <div id="fhub-title">${esc(productData.title)}</div>
            ${productData.price ? `<div id="fhub-price">${esc(productData.price)}</div>` : ''}
          </div>
        </div>

        <div id="fhub-fields">
          <div class="fhub-field">
            <label class="fhub-label" for="fhub-cat">Category</label>
            <select class="fhub-select" id="fhub-cat">
              <option value="Uncategorized">Uncategorized</option>
              <option value="Electronics">Electronics</option>
              <option value="Clothing">Clothing</option>
              <option value="Home &amp; Garden">Home &amp; Garden</option>
              <option value="Books">Books</option>
              <option value="Toys &amp; Games">Toys &amp; Games</option>
              <option value="Sports">Sports</option>
              <option value="Beauty">Beauty</option>
              <option value="Food &amp; Drink">Food &amp; Drink</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="fhub-field">
            <label class="fhub-label" for="fhub-notes">Notes <span class="fhub-optional">(optional)</span></label>
            <textarea class="fhub-textarea" id="fhub-notes" placeholder="Remind yourself why you like it..."></textarea>
          </div>
        </div>

        <div id="fhub-actions">
          <button id="fhub-dismiss-btn" class="fhub-btn fhub-btn-ghost">Not now</button>
          <button id="fhub-save-btn" class="fhub-btn fhub-btn-primary">
            <span>❤️</span> Save to FavoritesHub
          </button>
        </div>

        <div id="fhub-status" class="fhub-hidden"></div>
      </div>`;

    document.body.appendChild(dialogEl);

    document.getElementById('fhub-close').addEventListener('click', dismissDialog);
    document.getElementById('fhub-dismiss-btn').addEventListener('click', dismissDialog);
    document.getElementById('fhub-save-btn').addEventListener('click', saveItem);

    dialogEl._keyHandler = (e) => { if (e.key === 'Escape') dismissDialog(); };
    document.addEventListener('keydown', dialogEl._keyHandler);

    requestAnimationFrame(() => requestAnimationFrame(() => dialogEl.classList.add('fhub-visible')));
  }

  function dismissDialog() {
    if (!dialogEl) return;
    dialogEl.classList.remove('fhub-visible');
    document.removeEventListener('keydown', dialogEl._keyHandler);
    setTimeout(() => { dialogEl?.remove(); dialogEl = null; pendingData = null; }, 380);
  }

  function saveItem() {
    const saveBtn = document.getElementById('fhub-save-btn');
    const statusEl = document.getElementById('fhub-status');
    const category = document.getElementById('fhub-cat').value;
    const notes = document.getElementById('fhub-notes').value.trim();

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="fhub-spinner"></span> Saving…';
    statusEl.className = 'fhub-hidden';

    chrome.runtime.sendMessage(
      { action: 'saveFavorite', data: { ...pendingData, category, notes: notes || null } },
      (response) => {
        if (chrome.runtime.lastError) {
          setStatus('error', '❌ Extension error. Try reloading the page.');
          resetSaveBtn();
          return;
        }
        if (response.success) {
          setStatus('success', '✅ Saved to FavoritesHub!');
          setTimeout(dismissDialog, 1800);
        } else if (response.alreadySaved) {
          setStatus('info', 'ℹ️ Already in your favorites!');
          setTimeout(dismissDialog, 1800);
        } else if (response.notConfigured) {
          setStatus('error', '⚙️ Open the FavoritesHub extension to add your API token.');
          resetSaveBtn();
        } else {
          setStatus('error', '❌ ' + (response.error || 'Failed to save.'));
          resetSaveBtn();
        }
      }
    );
  }

  function resetSaveBtn() {
    const btn = document.getElementById('fhub-save-btn');
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = '<span>❤️</span> Save to FavoritesHub';
  }

  function setStatus(type, message) {
    const el = document.getElementById('fhub-status');
    if (!el) return;
    el.className = `fhub-status-${type}`;
    el.textContent = message;
  }

})();
