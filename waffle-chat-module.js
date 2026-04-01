(function () {
  "use strict";

  const ROOT_ID = "waffle-help-chat-root";
  const STYLE_ID = "waffle-help-chat-styles";
  const MAX_LINK_FETCH = 2;

  const STOP_WORDS = new Set([
    "a","an","and","are","as","at","be","but","by","can","could","do","for","from","get","go",
    "how","i","if","in","into","is","it","its","me","my","of","on","or","our","so","that",
    "the","their","them","there","this","to","up","we","what","when","where","which","who","why",
    "with","you","your","please","find","open","show","tell","about","will","would"
  ]);

  const state = {
    ui: null,
    index: null,
    linkedCache: new Map(),
    rebuildTimer: null
  };

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function safeText(text, fallback) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    return cleaned || fallback || "";
  }

  function normalize(text) {
    return safeText(text)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^\w\s./-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function expandQuery(text) {
    const q = normalize(text);
    const extra = [];

    if (/(touch\s?tunes|touchtunes|jukebox|credits?)/.test(q)) {
      extra.push("touchtunes touch tunes jukebox credits music app");
    }
    if (/(submit|submission|submissions|entry|entries|enter|contest rules|deadline|due date|due)/.test(q)) {
      extra.push("photo contest submission rules entry entries jotform upload");
    }
    if (/(dress\s?-?up|guidelines|dress up days)/.test(q)) {
      extra.push("dress up dress-up days guidelines pdf");
    }
    if (/(faq|faqs|questions|customer service|support)/.test(q)) {
      extra.push("faq faqs help customer service email call support");
    }
    if (/(anniversary|milestone|celebrat|service years?|years? of service)/.test(q)) {
      extra.push("anniversary milestones service years balloons associates celebrating");
    }
    if (/(trivia|museum|raffle|video)/.test(q)) {
      extra.push("museum tour trivia watch then play survey monkey raffle prizes");
    }
    if (/(shoe|shoes|crews)/.test(q)) {
      extra.push("shoes for crews faq faq shop customer service");
    }
    if (/(photo|upload)/.test(q)) {
      extra.push("photo contest submission upload rules");
    }
    if (/(bonus|refuel|fuel stop|fuel stops)/.test(q)) {
      extra.push("bonus refuel fuel stops anniversary road trip");
    }

    return `${safeText(text)} ${extra.join(" ")}`.trim();
  }

  function tokenize(text) {
    return normalize(expandQuery(text))
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token && !STOP_WORDS.has(token) && token.length > 1);
  }

  function uniqueBy(items, keyFn) {
    const seen = new Set();
    return items.filter((item) => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function sentenceTrim(text, maxLen) {
    const cleaned = safeText(text);
    if (!cleaned) return "";
    if (cleaned.length <= maxLen) return cleaned;
    return cleaned.slice(0, maxLen).replace(/\s+\S*$/, "").trim() + "…";
  }

  function escapeRegExp(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function hasNumber(text) {
    return /\d/.test(text || "");
  }

  function hasDateLikeText(text) {
    const value = safeText(text);
    return /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|week|month|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b)/i.test(value);
  }

  function splitSentences(text) {
    const raw = safeText(text)
      .replace(/\u2022/g, ". ")
      .replace(/\n+/g, ". ")
      .replace(/\s+/g, " ");

    return uniqueBy(
      raw
        .split(/(?<=[.!?])\s+|\s{2,}/)
        .map((sentence) => safeText(sentence))
        .filter((sentence) => sentence.length >= 8),
      (sentence) => normalize(sentence)
    );
  }

  function resolveUrl(href) {
    try {
      return new URL(href, window.location.href);
    } catch (error) {
      return null;
    }
  }

  function isPdfHref(href) {
    return /\.pdf(?:[?#]|$)/i.test(href || "");
  }

  function isSameOriginHtmlHref(href) {
    const url = resolveUrl(href);
    if (!url || url.origin !== window.location.origin) return false;
    if (/^mailto:|^tel:/i.test(href || "")) return false;
    const path = url.pathname || "";
    if (/\.html?(?:$|[?#])/i.test(path)) return true;
    const lastPart = path.split("/").pop() || "";
    return !/\.[a-z0-9]+$/i.test(lastPart);
  }

  function formatList(items) {
    const values = items.map((item) => safeText(item)).filter(Boolean);
    if (!values.length) return "";
    if (values.length === 1) return values[0];
    if (values.length === 2) return `${values[0]} and ${values[1]}`;
    return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
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
        width: min(400px, calc(100vw - 24px));
        max-height: min(74vh, 680px);
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
        max-width: 90%;
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

  function createUI() {
    if (document.getElementById(ROOT_ID)) {
      return {
        root: document.getElementById(ROOT_ID),
        launcher: document.getElementById("wh-chat-launcher"),
        panel: document.getElementById("wh-chat-panel"),
        messages: document.getElementById("wh-chat-messages"),
        form: document.getElementById("wh-chat-form"),
        input: document.getElementById("wh-chat-input"),
        close: document.getElementById("wh-chat-close"),
        suggestions: document.getElementById("wh-chat-suggestions")
      };
    }

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <button id="wh-chat-launcher" class="wh-chat-launcher" type="button" aria-label="Open page chat">
        🧇 <span>Ask</span>
      </button>
      <aside id="wh-chat-panel" class="wh-chat-panel" aria-hidden="true">
        <div class="wh-chat-header">
          <div>
            <div class="wh-chat-title">Waffle Help</div>
            <div class="wh-chat-subtitle">Ask about this page</div>
          </div>
          <button id="wh-chat-close" class="wh-chat-close" type="button" aria-label="Close chat">&times;</button>
        </div>
        <div id="wh-chat-messages" class="wh-chat-messages"></div>
        <div id="wh-chat-suggestions" class="wh-chat-suggestions"></div>
        <form id="wh-chat-form" class="wh-chat-form">
          <input id="wh-chat-input" class="wh-chat-input" type="text" autocomplete="off" placeholder="Ask a question..." />
          <button class="wh-chat-send" type="submit">Send</button>
        </form>
      </aside>
    `;

    document.body.appendChild(root);

    return {
      root,
      launcher: root.querySelector("#wh-chat-launcher"),
      panel: root.querySelector("#wh-chat-panel"),
      messages: root.querySelector("#wh-chat-messages"),
      form: root.querySelector("#wh-chat-form"),
      input: root.querySelector("#wh-chat-input"),
      close: root.querySelector("#wh-chat-close"),
      suggestions: root.querySelector("#wh-chat-suggestions")
    };
  }

  function notInsideChat(el) {
    return el && !el.closest(`#${ROOT_ID}`);
  }

  function buildSectionRecord(node, fallbackTitle) {
    const titleEl = node.querySelector("h1, h2, h3") || node;
    const title = safeText(titleEl.textContent, fallbackTitle || node.id || "Section");
    const kicker = safeText(node.querySelector(".section-kicker, .game-kicker, .video-label")?.textContent);

    const textParts = Array.from(
      node.querySelectorAll("h1, h2, h3, p, a, button, .song-label, .song-title, .video-label, .game-subtitle, .roadtrip-helper, .footer-thanks, .footer-note, .hud-label, .hud-value")
    )
      .filter(notInsideChat)
      .map((el) => safeText(el.textContent))
      .filter(Boolean);

    const text = uniqueBy(textParts, (part) => normalize(part)).join(" ");

    const links = Array.from(node.querySelectorAll("a[href]"))
      .filter(notInsideChat)
      .map((link) => ({
        label: safeText(link.textContent, getFileName(link.getAttribute("href") || "")),
        href: link.getAttribute("href") || "",
        sectionId: node.id || "",
        sectionTitle: title,
        isPdf: isPdfHref(link.getAttribute("href") || "")
      }))
      .filter((link) => link.href);

    const buttons = Array.from(node.querySelectorAll("button"))
      .filter(notInsideChat)
      .map((button) => safeText(button.textContent || button.getAttribute("aria-label")) )
      .filter(Boolean);

    return {
      id: node.id || "",
      title,
      kicker,
      text,
      links,
      buttons,
      sentences: splitSentences(text)
    };
  }

  function getFileName(href) {
    if (!href) return "";
    try {
      const parts = href.split("/");
      return decodeURIComponent(parts[parts.length - 1] || href);
    } catch (error) {
      return href;
    }
  }

  function getBonusStopsFromDom() {
    const pills = Array.from(document.querySelectorAll("#roadtrip-bonus-list .roadtrip-bonus-pill"))
      .filter(notInsideChat)
      .map((pill) => safeText(pill.textContent).replace(/\s*\+\d+\s*fuel/i, ""))
      .filter(Boolean);

    if (pills.length) return uniqueBy(pills, (pill) => pill);

    const goalCopy = safeText(document.getElementById("roadtrip-goal-copy")?.textContent);
    const match = goalCopy.match(/bonus refuel stops? (?:are|is) ([^.]+)/i);
    if (!match) return [];
    return match[1]
      .split(/,| and /i)
      .map((item) => safeText(item))
      .filter(Boolean);
  }

  function buildIndex() {
    const sectionNodes = Array.from(document.querySelectorAll("main .section, #roadtrip-game-modal .game-top, #roadtrip-game-modal .game-panel-card, .footer-decor, header.topbar"))
      .filter(notInsideChat);

    const sections = uniqueBy(
      sectionNodes.map((node) => buildSectionRecord(node)).filter((section) => section.text || section.links.length),
      (section) => `${section.id}|${normalize(section.title)}`
    );

    const allLinks = uniqueBy(
      Array.from(document.querySelectorAll("a[href]"))
        .filter(notInsideChat)
        .map((link) => {
          const section = link.closest(".section, .game-panel-card, .game-top, .footer-decor, header.topbar");
          const sectionTitle = safeText(section?.querySelector("h1, h2, h3")?.textContent, section?.id || "");
          return {
            label: safeText(link.textContent, getFileName(link.getAttribute("href") || "")),
            href: link.getAttribute("href") || "",
            sectionId: section?.id || "",
            sectionTitle,
            isPdf: isPdfHref(link.getAttribute("href") || "")
          };
        })
        .filter((link) => link.href),
      (link) => `${link.href}|${normalize(link.label)}`
    );

    const milestones = Array.from(document.querySelectorAll(".balloon-hotspot[data-years][data-count]"))
      .filter(notInsideChat)
      .map((button) => ({
        years: String(button.getAttribute("data-years") || ""),
        count: Number(button.getAttribute("data-count") || 0)
      }))
      .filter((item) => item.years && !Number.isNaN(item.count));

    const pageSentences = uniqueBy(
      sections.flatMap((section) => section.sentences),
      (sentence) => normalize(sentence)
    );

    return {
      sections,
      allLinks,
      milestones,
      bonusStops: getBonusStopsFromDom(),
      pageSentences
    };
  }

  function scoreText(query, text) {
    const haystack = normalize(text);
    if (!haystack) return 0;
    let score = 0;
    const tokens = tokenize(query);

    tokens.forEach((token) => {
      if (!token) return;
      const wholeWord = new RegExp(`\\b${escapeRegExp(token)}\\b`, "g");
      const matches = haystack.match(wholeWord);
      if (matches) score += matches.length * (token.length >= 5 ? 3 : 2);
      else if (haystack.includes(token)) score += token.length >= 5 ? 1.5 : 1;
    });

    const queryNormalized = normalize(expandQuery(query));
    if (queryNormalized && haystack.includes(queryNormalized)) score += 8;

    return score;
  }

  function scoreSection(query, section) {
    return (
      scoreText(query, section.title) * 4 +
      scoreText(query, section.kicker) * 2 +
      scoreText(query, section.text) +
      scoreText(query, section.links.map((link) => `${link.label} ${link.href}`).join(" ")) * 2 +
      scoreText(query, section.buttons.join(" "))
    );
  }

  function findBestSection(query) {
    if (!state.index) return null;

    const scored = state.index.sections
      .map((section) => ({ section, score: scoreSection(query, section) }))
      .sort((a, b) => b.score - a.score);

    return scored[0] && scored[0].score > 0 ? scored[0].section : null;
  }

  function pickBestSentence(query, sections, options) {
    const opts = Object.assign({ preferNumbers: false, preferDates: false }, options || {});
    const candidates = [];

    (sections || []).forEach((section) => {
      const sectionBoost = scoreSection(query, section) * 0.08;
      section.sentences.forEach((sentence) => {
        let score = scoreText(query, sentence) + sectionBoost;
        if (opts.preferNumbers) score += hasNumber(sentence) ? 4 : -1;
        if (opts.preferDates) score += hasDateLikeText(sentence) ? 7 : -2;
        if (sentence.length > 240) score -= 1;
        candidates.push({ sentence, score, section });
      });
    });

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] && candidates[0].score > 1 ? candidates[0] : null;
  }

  function createScrollAction(section) {
    if (!section || !section.id) return null;
    return {
      type: "scroll",
      target: `#${section.id}`,
      label: `Go to ${section.title}`
    };
  }

  function createLinkAction(link, labelOverride) {
    if (!link || !link.href) return null;
    return {
      type: "link",
      href: link.href,
      label: labelOverride || link.label || "Open link"
    };
  }

  function dedupeActions(actions) {
    return uniqueBy(
      (actions || []).filter(Boolean),
      (action) => `${action.type}|${action.target || action.href || action.label}`
    ).slice(0, 3);
  }

  function findRelevantLinks(query, section) {
    const links = section ? section.links : (state.index ? state.index.allLinks : []);
    return links
      .map((link) => ({ link, score: scoreText(query, `${link.label} ${link.sectionTitle} ${link.href}`) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.link);
  }

  function getAnniversariesSection() {
    return state.index?.sections.find((section) => section.id === "anniversaries") || findBestSection("anniversaries milestone") || null;
  }

  function resolveMilestoneQuestion(query) {
    const q = normalize(query);
    const yearMatch = q.match(/\b(\d{1,2})\s*(?:year|years)\b/) || q.match(/\b(\d{1,2})\b(?=.*(?:anniversary|milestone|celebrat|service))/);
    if (!yearMatch) return null;

    const years = yearMatch[1];
    const milestone = state.index?.milestones.find((item) => item.years === years);
    if (!milestone) return null;

    const associateWord = milestone.count === 1 ? "Associate" : "Associates";
    const verbWord = milestone.count === 1 ? "is" : "are";
    const yearWord = years === "1" ? "year" : "years";
    const section = getAnniversariesSection();

    return {
      text: `${milestone.count.toLocaleString()} ${associateWord} ${verbWord} celebrating ${years} ${yearWord} of service.`,
      actions: dedupeActions([createScrollAction(section)])
    };
  }

  function resolveTouchTunesQuestion(query) {
    if (!/(touch\s?tunes|touchtunes|jukebox|credits?)/i.test(query)) return null;
    const section = state.index?.sections.find((item) => normalize(item.title).includes("touchtunes")) || findBestSection(query);
    if (!section) return null;

    const bestSentence = pickBestSentence(query, [section], { preferNumbers: true });
    const links = findRelevantLinks(query, section);

    return {
      text: bestSentence ? sentenceTrim(bestSentence.sentence, 180) : "I found the TouchTunes section, but I couldn’t pull a direct answer sentence yet.",
      actions: dedupeActions([
        createScrollAction(section),
        createLinkAction(links[0]),
        createLinkAction(links[1])
      ])
    };
  }

  function resolveBonusStopQuestion() {
    if (!state.index?.bonusStops?.length) return null;
    return {
      text: `The bonus refuel stops are ${formatList(state.index.bonusStops)}.`,
      actions: dedupeActions([createScrollAction(getAnniversariesSection())])
    };
  }

  function resolveSubmissionDeadlineQuestion(query) {
    if (!/(deadline|due|due date|close|closing|end)/i.test(query)) return null;
    if (!/(submit|submission|submissions|entry|entries|contest|photo|trivia|rules)/i.test(query)) return null;

    const section = findBestSection(query);
    if (!section) return null;

    const bestDateSentence = pickBestSentence(query, [section], { preferDates: true });
    if (bestDateSentence && hasDateLikeText(bestDateSentence.sentence)) {
      return {
        text: sentenceTrim(bestDateSentence.sentence, 180),
        actions: dedupeActions([createScrollAction(section)])
      };
    }

    const bestLink = findRelevantLinks(query, section)[0];
    return {
      text: `I don’t see a submission deadline on this page. You can open ${bestLink ? bestLink.label : section.title} here.`,
      actions: dedupeActions([
        bestLink ? createLinkAction(bestLink) : null,
        createScrollAction(section)
      ])
    };
  }

  function resolveContactQuestion(query) {
    if (!/(contact|customer service|call|phone|email|support|help)/i.test(query)) return null;
    const section = findBestSection(query);
    if (!section) return null;

    const links = findRelevantLinks(query, section);
    const mailLink = links.find((link) => /^mailto:/i.test(link.href));
    const phoneLink = links.find((link) => /^tel:/i.test(link.href));

    if (!mailLink && !phoneLink) return null;

    const parts = [];
    if (mailLink) parts.push(`email customer service with ${mailLink.label.replace(/^📫\s*/, "")}`);
    if (phoneLink) parts.push(`call customer service with ${phoneLink.label.replace(/^📞\s*/, "")}`);

    return {
      text: `From ${section.title}, you can ${formatList(parts)}.`,
      actions: dedupeActions([
        createLinkAction(mailLink, mailLink?.label || "Email Customer Service"),
        createLinkAction(phoneLink, phoneLink?.label || "Call Customer Service"),
        createScrollAction(section)
      ])
    };
  }

  function resolveHowManyQuestion(query) {
    if (!/^(how many|how much)\b/i.test(normalize(query))) return null;
    const section = findBestSection(query);
    if (!section) return null;

    const bestSentence = pickBestSentence(query, [section], { preferNumbers: true });
    if (!bestSentence) return null;

    return {
      text: sentenceTrim(bestSentence.sentence, 180),
      actions: dedupeActions([
        createScrollAction(section),
        createLinkAction(findRelevantLinks(query, section)[0])
      ])
    };
  }

  function resolveLinkQuestion(query) {
    if (!/(where|how do|how can|open|view|find|download|play|shop|submit|enter)/i.test(query)) return null;
    const section = findBestSection(query);
    if (!section) return null;

    const bestLink = findRelevantLinks(query, section)[0];
    if (!bestLink) return null;

    return {
      text: `Use ${bestLink.label} in ${section.title}.`,
      actions: dedupeActions([
        createLinkAction(bestLink),
        createScrollAction(section)
      ])
    };
  }

  function resolveGeneralSentence(query) {
    const section = findBestSection(query);
    if (!section) return null;

    const bestSentence = pickBestSentence(query, [section], {
      preferNumbers: /(how many|how much|credits|years|points|fuel)/i.test(query),
      preferDates: /(when|deadline|due)/i.test(query)
    });

    if (!bestSentence) return null;

    return {
      text: sentenceTrim(bestSentence.sentence, 180),
      actions: dedupeActions([
        createScrollAction(section),
        createLinkAction(findRelevantLinks(query, section)[0])
      ])
    };
  }

  async function fetchLinkedPage(link) {
    if (!link || !isSameOriginHtmlHref(link.href)) return null;

    const url = resolveUrl(link.href);
    if (!url) return null;
    const cacheKey = url.href;

    if (state.linkedCache.has(cacheKey)) {
      return state.linkedCache.get(cacheKey);
    }

    try {
      const response = await fetch(url.href, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const parts = Array.from(doc.querySelectorAll("title, h1, h2, h3, p, li, a, button"))
        .map((node) => safeText(node.textContent))
        .filter(Boolean);
      const text = uniqueBy(parts, (part) => normalize(part)).join(" ");
      const payload = {
        title: safeText(doc.querySelector("title")?.textContent, link.label),
        text,
        sentences: splitSentences(text)
      };
      state.linkedCache.set(cacheKey, payload);
      return payload;
    } catch (error) {
      state.linkedCache.set(cacheKey, null);
      return null;
    }
  }

  async function resolveLinkedContent(query) {
    const bestSection = findBestSection(query);
    const rankedLinks = uniqueBy(
      [
        ...findRelevantLinks(query, bestSection),
        ...(state.index?.allLinks || [])
      ].filter((link) => isSameOriginHtmlHref(link.href)),
      (link) => link.href
    )
      .map((link) => ({ link, score: scoreText(query, `${link.label} ${link.sectionTitle} ${link.href}`) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_LINK_FETCH);

    for (const entry of rankedLinks) {
      const linked = await fetchLinkedPage(entry.link);
      if (!linked) continue;

      const sentence = uniqueBy(linked.sentences, (item) => normalize(item))
        .map((item) => ({ sentence: item, score: scoreText(query, item) }))
        .sort((a, b) => b.score - a.score)[0];

      if (sentence && sentence.score > 2) {
        return {
          text: sentenceTrim(sentence.sentence, 180),
          actions: dedupeActions([createLinkAction(entry.link)])
        };
      }
    }

    return null;
  }

  function finalFallback(query) {
    const section = findBestSection(query);
    if (!section) {
      return {
        text: "I don’t see that on this page yet. Try asking about trivia, photo contest, anniversaries, Shoes for Crews, TouchTunes, or dress-up days.",
        actions: []
      };
    }

    const bestLink = findRelevantLinks(query, section)[0];
    return {
      text: `I don’t see that exact answer on this page. ${bestLink ? `You can open ${bestLink.label} here.` : `Try the ${section.title} section.`}`,
      actions: dedupeActions([
        bestLink ? createLinkAction(bestLink) : null,
        createScrollAction(section)
      ])
    };
  }

  async function findAnswer(query) {
    if (!safeText(query)) {
      return {
        text: "Ask me about this page, like TouchTunes credits, trivia, the photo contest, anniversaries, or Shoes for Crews.",
        actions: []
      };
    }

    state.index = buildIndex();

    const directHandlers = [
      resolveMilestoneQuestion,
      (value) => (/(bonus|refuel|fuel stop|fuel stops)/i.test(value) ? resolveBonusStopQuestion() : null),
      resolveTouchTunesQuestion,
      resolveSubmissionDeadlineQuestion,
      resolveContactQuestion,
      resolveHowManyQuestion,
      resolveLinkQuestion,
      resolveGeneralSentence
    ];

    for (const handler of directHandlers) {
      const result = handler(query);
      if (result && result.text) return result;
    }

    const linkedResult = await resolveLinkedContent(query);
    if (linkedResult && linkedResult.text) return linkedResult;

    return finalFallback(query);
  }

  function addMessage(text, sender, actions) {
    const bubble = document.createElement("div");
    bubble.className = `wh-chat-msg ${sender}`;
    bubble.textContent = text;

    if (sender === "bot" && actions && actions.length) {
      const actionWrap = document.createElement("div");
      actionWrap.className = "wh-chat-actions";

      actions.forEach((action) => {
        if (!action) return;
        if (action.type === "link") {
          const link = document.createElement("a");
          link.className = "wh-chat-action";
          link.href = action.href;
          link.textContent = action.label;
          if (/^https?:/i.test(action.href)) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
          }
          actionWrap.appendChild(link);
        }
        if (action.type === "scroll") {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "wh-chat-action";
          button.textContent = action.label;
          button.addEventListener("click", () => {
            const target = document.querySelector(action.target);
            if (target) {
              target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          });
          actionWrap.appendChild(button);
        }
      });

      if (actionWrap.childElementCount) {
        bubble.appendChild(actionWrap);
      }
    }

    state.ui.messages.appendChild(bubble);
    state.ui.messages.scrollTop = state.ui.messages.scrollHeight;
  }

  function setSuggestions() {
    const prompts = [
      "How many TouchTunes credits will I get?",
      "When are submissions due?",
      "Where are the Shoes for Crews FAQs?",
      "How many associates are celebrating 10 years?",
      "What are the bonus refuel stops?"
    ];

    state.ui.suggestions.innerHTML = "";
    prompts.forEach((prompt) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "wh-chat-chip";
      chip.textContent = prompt;
      chip.addEventListener("click", async () => {
        openChat();
        addMessage(prompt, "user");
        const result = await findAnswer(prompt);
        addMessage(result.text, "bot", result.actions || []);
      });
      state.ui.suggestions.appendChild(chip);
    });
  }

  function openChat() {
    state.ui.panel.classList.add("open");
    state.ui.panel.setAttribute("aria-hidden", "false");
    state.ui.input.focus();
  }

  function closeChat() {
    state.ui.panel.classList.remove("open");
    state.ui.panel.setAttribute("aria-hidden", "true");
  }

  function scheduleRebuild() {
    clearTimeout(state.rebuildTimer);
    state.rebuildTimer = setTimeout(() => {
      state.index = buildIndex();
    }, 250);
  }

  function attachObservers() {
    const targets = [document.querySelector("main"), document.getElementById("roadtrip-game-modal"), document.querySelector(".footer-decor")].filter(Boolean);
    if (!targets.length || typeof MutationObserver === "undefined") return;

    const observer = new MutationObserver(scheduleRebuild);
    targets.forEach((target) => {
      observer.observe(target, { childList: true, subtree: true, characterData: true });
    });
  }

  ready(() => {
    createStyles();
    state.ui = createUI();
    state.index = buildIndex();

    setSuggestions();
    addMessage("Hi! I can answer questions from this page and tell you when I don’t see an answer here.", "bot", []);

    state.ui.launcher.addEventListener("click", () => {
      if (state.ui.panel.classList.contains("open")) closeChat();
      else openChat();
    });

    state.ui.close.addEventListener("click", closeChat);

    state.ui.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const question = safeText(state.ui.input.value);
      if (!question) return;

      addMessage(question, "user");
      state.ui.input.value = "";

      const result = await findAnswer(question);
      addMessage(result.text, "bot", result.actions || []);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.ui.panel.classList.contains("open")) {
        closeChat();
      }
    });

    attachObservers();
  });
})();
