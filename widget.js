/*!
 * NIPOST Postcode Coverage Widget
 * Verifies building-level data and logs coverage signals.
 */
(function () {
  "use strict";

  var CONFIG = {
    apiBase: "https://api.postcode.gov.ng",
    mockBase: "https://ng-postcode.oliha.dev",

    apiKey: "nipost_pk_test_811878d17c6e19e147ae93352f68b2834814392532877cc1", 
    level: 1,
    demoMode: true,
    debounceMs: 500,
    inputSelector: "[data-postcode-input]",
    badgeSelector: "[data-postcode-badge]",
    format: /^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{3}-[A-Z0-9]{2}-[A-Z0-9]{2}$/
  };


  var cache = new Map();

  function isValidFormat(code) {
    return CONFIG.format.test(code);
  }

  function renderBadge(el, state, message) {
    if (!el) return;
    var colors = {
      idle:     { bg: "transparent", fg: "#a3a3a3", border: "transparent", icon: "" },
      checking: { bg: "rgba(96, 165, 250, 0.1)", fg: "#60a5fa", border: "rgba(96, 165, 250, 0.3)", icon: "⏳" },
      valid:    { bg: "rgba(52, 211, 153, 0.1)", fg: "#34d399", border: "rgba(52, 211, 153, 0.3)", icon: "✓" },
      invalid:  { bg: "rgba(248, 113, 113, 0.1)", fg: "#f87171", border: "rgba(248, 113, 113, 0.3)", icon: "✕" },
      error:    { bg: "rgba(251, 191, 36, 0.1)", fg: "#fbbf24", border: "rgba(251, 191, 36, 0.3)", icon: "!" }
    };
    var c = colors[state] || colors.idle;
    
    el.innerHTML = "";
    if (message) {
      el.style.background = c.bg;
      el.style.color = c.fg;
      el.style.border = "1px solid " + c.border;
      el.style.padding = "8px 12px";
      el.style.borderRadius = "8px";
      el.style.fontSize = "13px";
      el.style.fontWeight = "500";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.gap = "8px";
      el.style.marginTop = "8px";
      
      if (c.icon) {
        var icon = document.createElement("span");
        icon.textContent = c.icon;
        icon.style.fontWeight = "700";
        el.appendChild(icon);
      }
      var text = document.createElement("span");
      text.textContent = message;
      el.appendChild(text);
    } else {
      el.style.display = "none";
    }
  }

  // Helper to dispatch unified result events
  function dispatchResult(input, result) {
    var event = new CustomEvent("postcode:result", { detail: result });
    input.dispatchEvent(event);
  }

  function lookup(code) {
    var base = CONFIG.demoMode ? CONFIG.mockBase : CONFIG.apiBase;
    var url = base + "/v1/lookup?code=" + encodeURIComponent(code) + "&level=" + CONFIG.level;
    var headers = { "Accept": "application/json" };
    if (!CONFIG.demoMode) headers["X-API-Key"] = CONFIG.apiKey;

    return fetch(url, { method: "GET", headers: headers })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (body) {
        var d = (body && body.data) || {};
        return {
          valid: !!d.valid,
          status: d.status || "unknown",
          verified: !!d.verified,
          postcode: d.postcode || code
        };
      });
  }

  function attach(input, badge) {
    var timer = null;

    function check() {
      // Normalize: strip everything not alphanumeric, uppercase
      var raw = (input.value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      
      // If empty, reset
      if (!raw) {
        renderBadge(badge, "idle", "");
        return;
      }

      // If we don't have 11 characters yet, just wait silently (don't count as a gap)
      if (raw.length < 11) {
        renderBadge(badge, "idle", "");
        return;
      }

      // Re-insert hyphens for the API call
      var formatted = raw.slice(0, 2) + "-" + raw.slice(2, 4) + "-" + raw.slice(4, 7) + "-" + raw.slice(7, 9) + "-" + raw.slice(9, 11);
      input.value = formatted;

      // If it's 11 chars but the format is completely wrong (e.g., too many numbers)
      if (!isValidFormat(formatted)) {
        renderBadge(badge, "invalid", "Invalid postcode format");
        dispatchResult(input, { valid: false, status: "invalid_format", postcode: formatted });
        return;
      }

      // Check cache
      if (cache.has(formatted)) {
        var hit = cache.get(formatted);
        renderBadge(badge, hit.valid ? "valid" : "invalid",
          hit.valid ? "Valid building · verified" : "Postcode not found (Data Gap)");
        dispatchResult(input, hit);
        return;
      }

      renderBadge(badge, "checking", "Checking coverage…");

      lookup(formatted).then(function (r) {
        cache.set(formatted, r);
        renderBadge(badge, r.valid ? "valid" : "invalid",
          r.valid ? "Valid building · verified" : "Postcode not found (Data Gap)");
        dispatchResult(input, r);
      }).catch(function (err) {
        renderBadge(badge, "error", "Verification failed — network error");
        dispatchResult(input, { valid: false, status: "error", postcode: formatted, message: err.message });
      });
    }

    input.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(check, CONFIG.debounceMs);
    });
    
    // Also check on blur (when user clicks away)
    input.addEventListener("blur", check);
  }

  function init() {
    var inputs = document.querySelectorAll(CONFIG.inputSelector);
    inputs.forEach(function (input) {
      var badge = input.parentElement
        ? input.parentElement.querySelector(CONFIG.badgeSelector)
        : null;
      attach(input, badge);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();