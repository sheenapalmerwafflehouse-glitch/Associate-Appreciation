/*
Waffle House Celebration Page Chat Module
Notepad-ready file

Recommended setup:
1) Save this file as: waffle-chat-module.js
2) Upload it to your GitHub Pages / site assets
3) Add this one line before </body> in your existing page:

<script src="PATH-TO-YOUR-GITHUB/waffle-chat-module.js" defer></script>

What this module does:
- Injects a floating chat button and chat panel
- Reads LIVE page content from:
  - section headings
  - paragraph text
  - button labels
  - anchor text
  - PDF links
  - anniversary balloon data-years and data-count
- Answers general questions based on the current page content
- Stays updated when section text or links change

Notes:
- This is a page-grounded helper, not a cloud AI integration
- It intentionally avoids making up answers that are not on the page
*/

(function () {
  "use strict";

  const CHAT_ID = "waffle-help-chat";
  const STYLE_ID = "waffle-help-chat-styles";

  const STOP_WORDS = new Set([
    "a","an","and","are","as","at","be","but","by","can","do","for","from","get","go","how",
    "i","if","in","into","is","it","its","me","my","of","on","or","our","so","that","the",
    "their","them","there","this","to","up","we","what","where","which","who","why","with",
    "you","your","please","find","open","show","tell","about"
  ]);

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^\w\s.-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    return normalize(text)
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t && !STOP_WORDS.has(t) && t.length > 1);
  }

  function uniqueBy(arr, keyFn) {
    const seen = new Set();
    return arr.filter((item) => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function safeText(text, fallback) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    return cleaned || fallback || "";
  }

  function sentenceTrim(text, maxLen) {
    const cleaned = safeText(text);
    if (!cleaned) return "";
    if (cleaned.length <= maxLen) return cleaned;
    return cleaned.slice(0, maxLen).replace(/\s+\S*$/, "").trim() + "…";
  }

  function getFileName(href) {
    if (!href) return "";
    try {
      const parts = href.split("/");
      return decodeURIComponent(parts[parts.length - 1] || href);
    } catch (e) {
      return href;
    }
  }

  function isPdfHref(href) {
    return /\.pdf(\?|#|$)/i.test(href || "");
  }

  function createStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .wh-chat-launcher {
        position: fixed;
        left: 16px;
        bottom: 18px;
        z-index: 4700;
        min-height: 54px;
        padding: 0 18px;
        border: 1px solid rgba(176, 150, 44, 0.18);
        border-radius: 999px;
        background: linear-gradient(180deg, #ffe66a 0%, #f5d547 100%);
        color: #111;
        font: inherit;
        font-weight: 800;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        box-shadow: 0 8px 18px rgba(92, 77, 19, 0.14), 0 2px 0 rgba(92, 77, 19, 0.08);
      }

      .wh-chat-panel {
        position: fixed;
        left: 16px;
        bottom: 82px;
        width: min(390px, calc(100vw - 24px));
        max-height: min(72vh, 660px);
        display: flex;
        flex-direction: column;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(252,248,221,0.96));
        border: 1px solid rgba(176, 150, 44, 0.16);
        border-radius: 24px;
        box-shadow: 0 24px 50px rgba(17, 17, 17, 0.18);
        overflow: hidden;
        z-index: 4701;
        opacity: 0;
        visibility: hidden;
        transform: translateY(16px) scale(0.98);
        transition: opacity 0.22s ease, transform 0.22s ease, visibility 0.22s ease;
      }

      .wh-chat-panel.open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
      }

      .wh-chat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 16px 16px 14px;
        border-bottom: 1px solid rgba(176, 150, 44, 0.12);
        background: linear-gradient(180deg, #fffdf2 0%, #fff8db 100%);
      }

      .wh-chat-title {
        font-size: 1rem;
        font-weight: 900;
        letter-spacing: 0.02em;
      }

      .wh-chat-subtitle {
        font-size: 0.82rem;
        color: #6b6b6b;
        margin-top: 2px;
      }

      .wh-chat-close {
        width: 38px;
        height: 38px;
        border: none;
        border-radius: 50%;
        background: #fff;
        color: #111;
        font: inherit;
        font-size: 22px;
        cursor: pointer;
        box-shadow: 0 6px 14px rgba(0,0,0,0.12);
      }

      .wh-chat-messages {
        padding: 14px;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 240px;
      }

      .wh-chat-msg {
        max-width: 88%;
        padding: 12px 14px;
        border-radius: 18px;
        line-height: 1.55;
        font-size: 0.95rem;
        white-space: pre-wrap;
      }

      .wh-chat-msg.bot {
        align-self: flex-start;
        background: #fff;
        border: 1px solid rgba(176, 150, 44, 0.12);
      }

      .wh-chat-msg.user {
        align-self: flex-end;
        background: linear-gradient(180deg, #ffe66a 0%, #f5d547 100%);
        color: #111;
        font-weight: 700;
      }

      .wh-chat-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .wh-chat-action {
        border: 1px solid rgba(176, 150, 44, 0.16);
        border-radius: 999px;
        padding: 8px 12px;
        background: rgba(255,255,255,0.92);
        color: #111;
        text-decoration: none;
        font: inherit;
        font-size: 0.82rem;
        font-weight: 800;
        cursor: pointer;
      }

      .wh-chat-suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 0 14px 12px;
      }

      .wh-chat-chip {
        border: 1px solid rgba(176, 150, 44, 0.14);
        border-radius: 999px;
        padding: 8px 12px;
        background: rgba(255, 247, 200, 0.92);
        color: #5f5000;
        font: inherit;
        font-size: 0.82rem;
        font-weight: 800;
        cursor: pointer;
      }

      .wh-chat-form {
        display: flex;
        gap: 8px;
        padding: 14px;
        border-top: 1px solid rgba(176, 150, 44, 0.12);
        background: rgba(255,255,255,0.9);
      }

      .wh-chat-input {
        flex: 1;
        min-width: 0;
        border: 1px solid rgba(176, 150, 44, 0.18);
        border-radius: 14px;
        padding: 12px 14px;
        font: inherit;
      }

      .wh-chat-send {
        border: none;
        border-radius: 14px;
        padding: 0 16px;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
        background: linear-gradient(180deg, #ffe66a 0%, #f5d547 100%);
        color: #111;
      }

      @media (max-width: 640px) {
        .wh-chat-launcher {
          left: 12px;
          bottom: 14px;
        }

        .wh-chat-panel {
          left: 12px;
          right: 12px;
          bottom: 74px;
          width: auto;
          max-height: 70vh;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createMarkup() {
    if (document.getElementById(CHAT_ID)) return;

    const wrapper = document.createElement("div");
    wrapper.id = CHAT_ID;
    wrapper.innerHTML = `
      <button id="wh-chat-launcher" class="wh-chat-launcher" type="button" aria-label="Open chat">
        🧇 <span>Ask</span>
      </button>

      <aside id="wh-chat-panel" class="wh-chat-panel" aria-hidden="true">
        <div class="wh-chat-header">
          <div>
            <div class="wh-chat-title">Waffle Help</div>
            <div class="wh-chat-subtitle">Ask about this celebration page</div>
          </div>
          <button id="wh-chat-close" class="wh-chat-close" type="button" aria-label="Close chat">&times;</button>
        </div>

        <div id="wh-chat-messages" class="wh-chat-messages"></div>

        <div id="wh-chat-suggestions" class="wh-chat-suggestions"></div>

        <form id="wh-chat-form" class="wh-chat-form">
          <input
            id="wh-chat-input"
            class="wh-chat-input"
            type="text"
            placeholder="Ask a question..."
            autocomplete="off"
          />
          <button class="wh-chat-send" type="submit">Send</button>
        </form>
      </aside>
    `;

    document.body.appendChild(wrapper);
  }

  function getSectionTitle(section) {
    const heading = section.querySelector("h1, h2, h3");
    if (heading) return safeText(heading.textContent, section.id);
    return safeText(section.getAttribute("aria-label"), section.id || "Section");
  }

  function getSectionKicker(section) {
    const kicker = section.querySelector(".section-kicker");
    return safeText(kicker && kicker.textContent, "");
  }

  function getActionFromElement(el, sectionId) {
    const text = safeText(el.textContent, "");
    if (!text) return null;

    if (el.tagName === "A" && el.getAttribute("href")) {
      return {
        label: text,
        type: "link",
        href: el.getAttribute("href"),
        sectionId: sectionId || "",
        isPdf: isPdfHref(el.getAttribute("href"))
      };
    }

    if (el.tagName === "BUTTON" && el.id) {
      return {
        label: text,
        type: "click",
        targetId: el.id,
        sectionId: sectionId || ""
      };
    }

    return null;
  }

  function buildPageIndex() {
    const sections = Array.from(document.querySelectorAll("section.section[id]"));
    const records = [];
    const allActions = [];

    sections.forEach((section) => {
      const sectionId = section.id;
      const title = getSectionTitle(section);
      const kicker = getSectionKicker(section);

      const paragraphs = Array.from(section.querySelectorAll("p"))
        .map((p) => safeText(p.textContent, ""))
        .filter(Boolean);

      const headings = Array.from(section.querySelectorAll("h1, h2, h3"))
        .map((h) => safeText(h.textContent, ""))
        .filter(Boolean);

      const buttonLabels = Array.from(section.querySelectorAll("button, a"))
        .map((el) => safeText(el.textContent, ""))
        .filter(Boolean);

      const actions = uniqueBy(
        Array.from(section.querySelectorAll("a[href], button[id]"))
          .map((el) => getActionFromElement(el, sectionId))
          .filter(Boolean),
        (item) => `${item.type}|${item.label}|${item.href || item.targetId || ""}`
      );

      actions.forEach((item) => {
        item.sectionTitle = title;
        allActions.push(item);
      });

      const pdfLinks = actions.filter((a) => a.type === "link" && a.isPdf);

      const searchText = [
        title,
        kicker,
        headings.join(" "),
        paragraphs.join(" "),
        buttonLabels.join(" "),
        pdfLinks.map((a) => `${a.label} ${getFileName(a.href)}`).join(" ")
      ].join(" ");

      records.push({
        id: sectionId,
        title,
        kicker,
        headings,
        paragraphs,
        buttonLabels,
        actions,
        pdfLinks,
        summary:
          paragraphs[0] ||
          buttonLabels.slice(0, 3).join(", ") ||
          `This section is about ${title}.`,
        searchText
      });
    });

    const navActions = uniqueBy(
      Array.from(document.querySelectorAll(".mini-nav a[href]"))
        .map((el) => ({
          label: safeText(el.textContent, ""),
          type: "link",
          href: el.getAttribute("href"),
          sectionId: "",
          sectionTitle: "Navigation",
          isPdf: isPdfHref(el.getAttribute("href"))
        }))
        .filter((item) => item.label),
      (item) => `${item.label}|${item.href}`
    );

    const milestoneFacts = Array.from(document.querySelectorAll(".balloon-hotspot[data-years][data-count]"))
      .map((el) => ({
        years: String(el.getAttribute("data-years") || "").trim(),
        count: Number(el.getAttribute("data-count") || 0)
      }))
      .filter((item) => item.years && Number.isFinite(item.count));

    const pageSectionTitles = records.map((r) => r.title).filter(Boolean);

    return {
      sections: records,
      actions: uniqueBy(allActions.concat(navActions), (item) => `${item.type}|${item.label}|${item.href || item.targetId || ""}`),
      milestones: milestoneFacts,
      sectionTitles: pageSectionTitles
    };
  }

  function actionMatchesQuery(action, qTokens, qNorm) {
    const text = normalize([
      action.label,
      action.sectionTitle || "",
      action.href || "",
      getFileName(action.href || "")
    ].join(" "));

    let score = 0;

    if (qNorm && action.label && normalize(action.label) && qNorm.includes(normalize(action.label))) {
      score += 12;
    }

    qTokens.forEach((token) => {
      if (text.includes(token)) score += 2;
    });

    if (action.isPdf && (qNorm.includes("pdf") || qNorm.includes("faq") || qNorm.includes("guideline") || qNorm.includes("rules"))) {
      score += 5;
    }

    return score;
  }

  function sectionMatchesQuery(section, qTokens, qNorm) {
    const titleNorm = normalize(section.title);
    const headingNorm = normalize(section.headings.join(" "));
    const buttonNorm = normalize(section.buttonLabels.join(" "));
    const paragraphNorm = normalize(section.paragraphs.join(" "));
    const fullNorm = normalize(section.searchText);

    let score = 0;

    if (titleNorm && qNorm.includes(titleNorm)) score += 16;
    if (section.kicker && qNorm.includes(normalize(section.kicker))) score += 5;

    qTokens.forEach((token) => {
      if (titleNorm.includes(token)) score += 5;
      if (headingNorm.includes(token)) score += 3;
      if (buttonNorm.includes(token)) score += 3;
      if (paragraphNorm.includes(token)) score += 1;
      if (fullNorm.includes(token)) score += 1;
    });

    return score;
  }

  function milestoneAnswer(question, index) {
    const qNorm = normalize(question);
    const yearMatch = qNorm.match(/\b(\d{1,2})\s*(year|years)\b/);

    if (!yearMatch) return null;

    const years = yearMatch[1];
    const item = index.milestones.find((m) => m.years === years);
    if (!item) return null;

    const yearWord = years === "1" ? "year" : "years";
    const associateWord = item.count === 1 ? "Associate" : "Associates";
    const verbWord = item.count === 1 ? "is" : "are";

    return {
      text: `${item.count.toLocaleString()} ${associateWord} ${verbWord} celebrating ${years} ${yearWord} of service.`,
      actions: [
        { label: "Go to Anniversaries", type: "scroll", target: "#anniversaries" }
      ]
    };
  }

  function pageOverviewAnswer(index) {
    const list = index.sectionTitles.slice(0, 8).join(", ");
    return {
      text: `This page includes: ${list}. You can ask me where to find things, how to open a PDF, or questions like "How many associates are celebrating 10 years?"`
    };
  }

  function pdfAnswer(question, index) {
    const qNorm = normalize(question);
    const qTokens = tokenize(question);

    const pdfs = index.actions.filter((a) => a.isPdf);
    if (!pdfs.length) return null;

    const ranked = pdfs
      .map((action) => ({ action, score: actionMatchesQuery(action, qTokens, qNorm) }))
      .sort((a, b) => b.score - a.score);

    if (!ranked[0] || ranked[0].score < 2) return null;

    const top = ranked[0].action;
    const reply = `The best PDF match I found is "${top.label}"${top.sectionTitle && top.sectionTitle !== "Navigation" ? ` in ${top.sectionTitle}` : ""}.`;

    return {
      text: reply,
      actions: [
        top.sectionId ? { label: "Go to Section", type: "scroll", target: `#${top.sectionId}` } : null,
        { label: "Open PDF", type: "link", href: top.href }
      ].filter(Boolean)
    };
  }

  function actionAnswer(question, index) {
    const qNorm = normalize(question);
    const qTokens = tokenize(question);

    const ranked = index.actions
      .map((action) => ({ action, score: actionMatchesQuery(action, qTokens, qNorm) }))
      .sort((a, b) => b.score - a.score);

    if (!ranked[0] || ranked[0].score < 3) return null;

    const top = ranked[0].action;
    const text = `The best match I found is "${top.label}"${top.sectionTitle && top.sectionTitle !== "Navigation" ? ` in ${top.sectionTitle}` : ""}.`;

    const actions = [];
    if (top.sectionId) actions.push({ label: "Go to Section", type: "scroll", target: `#${top.sectionId}` });

    if (top.type === "link") {
      actions.push({ label: "Open Link", type: "link", href: top.href });
    } else if (top.type === "click") {
      actions.push({ label: "Open It", type: "click", targetId: top.targetId });
    }

    return { text, actions };
  }

  function sectionAnswer(question, index) {
    const qNorm = normalize(question);
    const qTokens = tokenize(question);

    const ranked = index.sections
      .map((section) => ({ section, score: sectionMatchesQuery(section, qTokens, qNorm) }))
      .sort((a, b) => b.score - a.score);

    if (!ranked[0] || ranked[0].score < 3) return null;

    const top = ranked[0].section;
    const text = `${top.title}: ${sentenceTrim(top.summary, 220)}`;

    const actions = [
      { label: "Go to Section", type: "scroll", target: `#${top.id}` }
    ];

    const primaryAction = top.actions.find((a) => a.type === "link" || a.type === "click");
    if (primaryAction) {
      if (primaryAction.type === "link") {
        actions.push({ label: primaryAction.isPdf ? "Open PDF" : primaryAction.label, type: "link", href: primaryAction.href });
      } else if (primaryAction.type === "click") {
        actions.push({ label: primaryAction.label, type: "click", targetId: primaryAction.targetId });
      }
    }

    return { text, actions };
  }

  function fallbackAnswer(index) {
    const sampleTitles = index.sectionTitles.slice(0, 5).join(", ");
    return {
      text: `I can answer based on the visible content on this page. Try asking about ${sampleTitles}, or ask where to find a rule, FAQ, PDF, contest link, or anniversary milestone.`
    };
  }

  function getAnswer(question) {
    const index = buildPageIndex();
    const qNorm = normalize(question);

    if (!qNorm) {
      return {
        text: "Ask me about the content on this page. For example: photo contest, trivia, TouchTunes, Shoes for Crews, dress-up days, or anniversary milestones."
      };
    }

    if (
      qNorm.includes("what can i do") ||
      qNorm.includes("what is on this page") ||
      qNorm.includes("what's on this page") ||
      qNorm.includes("summarize this page") ||
      qNorm.includes("help me navigate")
    ) {
      return pageOverviewAnswer(index);
    }

    const milestone = milestoneAnswer(question, index);
    if (milestone) return milestone;

    if (qNorm.includes("pdf") || qNorm.includes("faq") || qNorm.includes("guideline") || qNorm.includes("rules")) {
      const pdf = pdfAnswer(question, index);
      if (pdf) return pdf;
    }

    const action = actionAnswer(question, index);
    if (action) return action;

    const section = sectionAnswer(question, index);
    if (section) return section;

    return fallbackAnswer(index);
  }

  function initChat() {
    createStyles();
    createMarkup();

    const launcher = document.getElementById("wh-chat-launcher");
    const panel = document.getElementById("wh-chat-panel");
    const closeBtn = document.getElementById("wh-chat-close");
    const form = document.getElementById("wh-chat-form");
    const input = document.getElementById("wh-chat-input");
    const messages = document.getElementById("wh-chat-messages");
    const suggestions = document.getElementById("wh-chat-suggestions");

    function addMessage(text, sender, actions) {
      const bubble = document.createElement("div");
      bubble.className = `wh-chat-msg ${sender}`;
      bubble.textContent = text;
      messages.appendChild(bubble);

      if (sender === "bot" && Array.isArray(actions) && actions.length) {
        const wrap = document.createElement("div");
        wrap.className = "wh-chat-actions";

        actions.forEach((action) => {
          if (!action || !action.label) return;

          if (action.type === "link" && action.href) {
            const a = document.createElement("a");
            a.className = "wh-chat-action";
            a.href = action.href;
            a.textContent = action.label;
            if (/^https?:/i.test(action.href)) {
              a.target = "_blank";
              a.rel = "noopener noreferrer";
            }
            wrap.appendChild(a);
          }

          if (action.type === "scroll" && action.target) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "wh-chat-action";
            btn.textContent = action.label;
            btn.addEventListener("click", () => {
              const el = document.querySelector(action.target);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            });
            wrap.appendChild(btn);
          }

          if (action.type === "click" && action.targetId) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "wh-chat-action";
            btn.textContent = action.label;
            btn.addEventListener("click", () => {
              const target = document.getElementById(action.targetId);
              if (target) target.click();
            });
            wrap.appendChild(btn);
          }
        });

        messages.appendChild(wrap);
      }

      messages.scrollTop = messages.scrollHeight;
    }

    function openChat() {
      panel.classList.add("open");
      panel.setAttribute("aria-hidden", "false");
      input.focus();
    }

    function closeChat() {
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
    }

    function renderSuggestions() {
      const preferredOrder = [
        "Photo Contest",
        "Museum Tour & Trivia",
        "Anniversaries",
        "Shoes For Crews",
        "TouchTunes",
        "Dress-Up Days"
      ];

      const currentSections = buildPageIndex().sectionTitles;
      const choices = uniqueBy(
        preferredOrder
          .filter((title) => currentSections.includes(title))
          .concat(currentSections.slice(0, 6)),
        (item) => item
      ).slice(0, 6);

      suggestions.innerHTML = "";

      choices.forEach((title) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "wh-chat-chip";
        chip.textContent = title;
        chip.addEventListener("click", () => {
          addMessage(title, "user");
          const result = getAnswer(title);
          addMessage(result.text, "bot", result.actions || []);
          openChat();
        });
        suggestions.appendChild(chip);
      });
    }

    launcher.addEventListener("click", () => {
      if (panel.classList.contains("open")) {
        closeChat();
      } else {
        openChat();
      }
    });

    closeBtn.addEventListener("click", closeChat);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const question = safeText(input.value, "");
      if (!question) return;

      addMessage(question, "user");
      input.value = "";

      const result = getAnswer(question);
      addMessage(result.text, "bot", result.actions || []);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.classList.contains("open")) {
        closeChat();
      }
    });

    addMessage(
      "Hi! I answer from the content on this page, including sections, links, PDFs, and anniversary milestone counts.",
      "bot"
    );

    renderSuggestions();
  }

  ready(initChat);
})();
