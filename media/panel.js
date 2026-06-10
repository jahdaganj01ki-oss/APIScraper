(function () {
  // @ts-nocheck
  const vscode = acquireVsCodeApi();

  const $ = (id) => document.getElementById(id);
  const urlInput = $("url");
  const analyzeBtn = $("analyze");
  const stopBtn = $("stop");
  const statusEl = $("status");
  const phaseEl = $("phase");
  const logsEl = $("logs");
  const summaryEl = $("summary");
  const toolbarEl = $("toolbar");
  const resultsEl = $("results");
  const emptyEl = $("empty");
  const filterEl = $("filter");
  const spinner = $("spinner");

  let currentResult = null;

  function setRunning(running) {
    analyzeBtn.disabled = running;
    stopBtn.disabled = !running;
    spinner.style.visibility = running ? "visible" : "hidden";
  }

  function collectOverrides() {
    return {
      dynamicEnabled: $("opt-dynamic").checked,
      includeThirdParty: $("opt-thirdparty").checked,
      includeStaticAssets: $("opt-assets").checked,
      maxDepth: Number($("opt-depth").value) || 0,
      maxPages: Number($("opt-maxpages").value) || 1
    };
  }

  function startAnalyze() {
    const url = urlInput.value.trim();
    if (!url) {
      return;
    }
    logsEl.textContent = "";
    statusEl.classList.remove("hidden");
    emptyEl.classList.add("hidden");
    vscode.postMessage({ type: "analyze", url, overrides: collectOverrides() });
  }

  analyzeBtn.addEventListener("click", startAnalyze);
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      startAnalyze();
    }
  });
  stopBtn.addEventListener("click", () => vscode.postMessage({ type: "stop" }));

  document.querySelectorAll("[data-export]").forEach((btn) => {
    btn.addEventListener("click", () =>
      vscode.postMessage({ type: "export", format: btn.getAttribute("data-export") })
    );
  });

  filterEl.addEventListener("input", () => renderResults());

  function methodClass(m) {
    return "method method-" + m.toLowerCase();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderSummary(result) {
    const s = result.stats;
    const warn = s.warnings && s.warnings.length
      ? `<div class="warnings">${s.warnings.map((w) => "⚠ " + escapeHtml(w)).join("<br/>")}</div>`
      : "";
    summaryEl.innerHTML =
      `<div class="cards">
        <div class="card"><div class="num">${result.endpoints.length}</div><div>Endpoints</div></div>
        <div class="card"><div class="num">${s.requestsObserved}</div><div>Requests seen</div></div>
        <div class="card"><div class="num">${s.pagesVisited}</div><div>Pages crawled</div></div>
        <div class="card"><div class="num">${(s.durationMs / 1000).toFixed(1)}s</div><div>Duration</div></div>
        <div class="card"><div class="num">${s.dynamicUsed ? "Yes" : "No"}</div><div>Browser used</div></div>
      </div>${warn}`;
    summaryEl.classList.remove("hidden");
  }

  function kindBadge(kind) {
    if (kind === "graphql") return '<span class="kind graphql">GraphQL</span>';
    if (kind === "websocket") return '<span class="kind ws">WS</span>';
    return "";
  }

  function renderResults() {
    if (!currentResult) {
      return;
    }
    const q = filterEl.value.trim().toLowerCase();
    const byHost = new Map();
    for (const ep of currentResult.endpoints) {
      const hay = (ep.host + " " + ep.pathTemplate + " " + ep.methods.join(" ")).toLowerCase();
      if (q && !hay.includes(q)) {
        continue;
      }
      if (!byHost.has(ep.host)) {
        byHost.set(ep.host, []);
      }
      byHost.get(ep.host).push(ep);
    }

    let html = "";
    for (const [host, eps] of byHost) {
      html += `<details open class="host"><summary>${escapeHtml(host)} <span class="count">${eps.length}</span></summary>`;
      for (const ep of eps) {
        const methods = ep.methods.map((m) => `<span class="${methodClass(m)}">${m}</span>`).join("");
        const params = ep.params
          .map((p) => `<code class="param param-${p.in}">${escapeHtml(p.name)}<sup>${p.in[0]}</sup></code>`)
          .join(" ");
        const sources = ep.sources.map((s) => `<span class="src src-${s}">${s}</span>`).join("");
        html += `<div class="ep">
          <div class="ep-head" data-id="${escapeHtml(ep.id)}">
            <span class="methods">${methods}</span>
            <span class="path">${escapeHtml(ep.pathTemplate)} ${kindBadge(ep.kind)}</span>
            <span class="grow"></span>
            <span class="meta">${sources} <span class="hits">×${ep.count}</span></span>
          </div>
          <div class="ep-body">
            ${params ? `<div class="params">${params}</div>` : ""}
            ${ep.statuses.length ? `<div class="line"><b>Status:</b> ${ep.statuses.join(", ")}</div>` : ""}
            ${ep.contentTypes.length ? `<div class="line"><b>Content-Type:</b> ${escapeHtml(ep.contentTypes.join(", "))}</div>` : ""}
            ${ep.examples.length ? `<div class="line"><b>Example:</b> <code>${escapeHtml(ep.examples[0])}</code></div>` : ""}
            ${ep.graphqlOperations && ep.graphqlOperations.length ? `<div class="line"><b>GraphQL ops:</b> ${escapeHtml(ep.graphqlOperations.join(", "))}</div>` : ""}
            ${ep.sampleResponse ? `<details class="sample"><summary>Sample response</summary><pre>${escapeHtml(ep.sampleResponse.slice(0, 1500))}</pre></details>` : ""}
          </div>
        </div>`;
      }
      html += `</details>`;
    }

    resultsEl.innerHTML = html || `<div class="empty"><p>No endpoints match the filter.</p></div>`;

    resultsEl.querySelectorAll(".ep-head").forEach((head) => {
      head.addEventListener("click", () => head.parentElement.classList.toggle("open"));
    });
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
      case "started":
        setRunning(true);
        phaseEl.textContent = "Starting…";
        break;
      case "phase":
        phaseEl.textContent = msg.phase;
        break;
      case "log":
        logsEl.textContent += msg.line + "\n";
        logsEl.scrollTop = logsEl.scrollHeight;
        break;
      case "result":
        currentResult = msg.result;
        renderSummary(msg.result);
        toolbarEl.classList.remove("hidden");
        renderResults();
        break;
      case "error":
        phaseEl.textContent = "Error";
        logsEl.textContent += "ERROR: " + msg.message + "\n";
        break;
      case "finished":
        setRunning(false);
        phaseEl.textContent = "Done";
        break;
    }
  });

  vscode.postMessage({ type: "ready" });
})();
