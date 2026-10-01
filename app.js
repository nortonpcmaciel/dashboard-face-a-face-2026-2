const SHEET_CONFIG = {
  id: "1w7wbP4KKNrUXlu2UVEDfLnVl1urjS4OslCvx6bekxUs",
  gid: "0",
  refreshIntervalMs: 60_000,
};

const COLORS = ["#e5a84f", "#f0cf91", "#9f6b31", "#74573a", "#c47c35", "#6f747c"];
const charts = new Map();

// Retrato anônimo da planilha em 01/10/2026. É usado somente quando a fonte
// privada não pode ser consultada diretamente pelo navegador.
const SNAPSHOT_ROWS = [
  ["30/09/2026", "Solteiro", 24, "PIB em Redenção/PA", "", "Sim", "Sim", "Não", "Não contatado"],
  ["30/09/2026", "Solteiro", 26, "PIB em Redenção/PA", "", "Sim", "Sim", "Sim, na PIB", "Não contatado"],
  ["30/09/2026", "Casado", 28, "INOVI", "INOVI CUMARU", "Sim", "Não", "Sim, em outra igreja", "Não contatado"],
  ["30/09/2026", "Solteiro", 25, "INOVI", "INOVI CUMARU", "Não", "Não", "Não", "Não contatado"],
  ["30/09/2026", "Casado", 63, "PIB em Redenção/PA", "", "Sim", "Sim", "Sim, na PIB", "Não contatado"],
  ["30/09/2026", "Casado", 41, "Outra Igreja", "SETA", "Não", "Sim", "Sim, em outra igreja", "Não contatado"],
  ["30/09/2026", "Solteiro", 27, "INOVI", "INOVI CUMARU", "Sim", "Não", "Não", "Não contatado"],
  ["30/09/2026", "Solteiro", 21, "PIB em Redenção/PA", "", "Sim", "Não", "Não", "Não contatado"],
  ["30/09/2026", "Divorciado", 36, "PIB em Redenção/PA", "", "Sim", "Sim", "Sim, em outra igreja", "Não contatado"],
  ["30/09/2026", "União Estável", 30, "INOVI", "INOVI CUMARU", "Não", "Não", "Não", "Não contatado"],
  ["30/09/2026", "Casado", 30, "PIB em Redenção/PA", "", "Sim", "Sim", "Sim, na PIB", "Não contatado"],
  ["30/09/2026", "Solteiro", 50, "INOVI", "INOVI CUMARU", "Sim", "Não", "Sim, em outra igreja", "Não contatado"],
  ["30/09/2026", "Solteiro", 24, "PIB em Redenção/PA", "", "Não", "Sim", "Não", "Não contatado"],
  ["01/10/2026", "Solteiro", 18, "PIB em Redenção/PA", "", "Sim", "Sim", "Sim, na PIB", "Não contatado"],
].map(([timestamp, marital, age, church, otherChurch, cell, baptism, encounter, confirmation]) => ({
  timestamp,
  marital,
  age,
  church,
  otherChurch,
  cell,
  baptism,
  encounter,
  confirmation,
}));

const FIELD_MATCHERS = {
  timestamp: ["carimbo de data/hora", "timestamp"],
  marital: ["estado civil"],
  age: ["idade"],
  church: ["qual sua igreja"],
  otherChurch: ["outra igreja", "nos diga qual e sua igreja", "inovi"],
  cell: ["participa de alguma celula", "participa de celula"],
  baptism: ["batizado nas aguas", "batismo"],
  encounter: ["ja participou de algum encontro", "participou do encontro"],
  confirmation: ["confirmacao", "status de confirmacao"],
};

function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseAge(value) {
  const match = String(value ?? "").match(/\d{1,3}/);
  const age = match ? Number(match[0]) : NaN;
  return age >= 0 && age <= 120 ? age : null;
}

function titleCase(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)(\p{L})/gu, (_, spacing, letter) => `${spacing}${letter.toUpperCase()}`);
}

function findColumn(headers, key) {
  const matchers = FIELD_MATCHERS[key];
  return headers.findIndex((header) => {
    const clean = normalize(header);
    return matchers.some((matcher) => clean.includes(normalize(matcher)));
  });
}

function rowsFromGviz(response) {
  if (!response?.table?.cols || !response?.table?.rows) {
    throw new Error("A resposta da planilha não contém uma tabela válida.");
  }

  const headers = response.table.cols.map((column) => column.label || column.id || "");
  const indexes = Object.fromEntries(
    Object.keys(FIELD_MATCHERS).map((key) => [key, findColumn(headers, key)]),
  );

  const required = ["marital", "age", "church", "cell", "baptism", "encounter"];
  const missing = required.filter((key) => indexes[key] < 0);
  if (missing.length) {
    throw new Error(`Campos obrigatórios não encontrados: ${missing.join(", ")}`);
  }

  const valueAt = (cells, index) => {
    if (index < 0 || !cells[index]) return "";
    return cells[index].f ?? cells[index].v ?? "";
  };

  return response.table.rows
    .map((row) => ({
      timestamp: valueAt(row.c, indexes.timestamp),
      marital: valueAt(row.c, indexes.marital),
      age: parseAge(valueAt(row.c, indexes.age)),
      church: valueAt(row.c, indexes.church),
      otherChurch: valueAt(row.c, indexes.otherChurch),
      cell: valueAt(row.c, indexes.cell),
      baptism: valueAt(row.c, indexes.baptism),
      encounter: valueAt(row.c, indexes.encounter),
      confirmation: valueAt(row.c, indexes.confirmation),
    }))
    .filter((row) => Object.values(row).some((value) => value !== "" && value !== null));
}

function loadSheetData() {
  return new Promise((resolve, reject) => {
    const callbackName = `__faceAFace_${Date.now()}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => finish(new Error("Tempo limite ao consultar a planilha.")), 12_000);

    const finish = (error, data) => {
      window.clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
      error ? reject(error) : resolve(data);
    };

    window[callbackName] = (response) => {
      if (response?.status === "error") {
        finish(new Error(response.errors?.[0]?.detailed_message || "Acesso à planilha negado."));
        return;
      }

      try {
        finish(null, rowsFromGviz(response));
      } catch (error) {
        finish(error);
      }
    };

    script.onerror = () => finish(new Error("A planilha não está publicada para leitura externa."));
    const query = new URLSearchParams({
      gid: SHEET_CONFIG.gid,
      tqx: `out:json;responseHandler:${callbackName}`,
    });
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_CONFIG.id}/gviz/tq?${query}`;
    document.head.appendChild(script);
  });
}

function countBy(rows, key, fallback = "Não informado") {
  const counts = new Map();
  rows.forEach((row) => {
    const raw = String(row[key] ?? "").trim();
    const value = raw || fallback;
    const comparable = normalize(value);
    const existing = [...counts.keys()].find((label) => normalize(label) === comparable);
    const label = existing || titleCase(value);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function ageBuckets(rows) {
  const buckets = [
    ["Até 17", 0, 17],
    ["18–24", 18, 24],
    ["25–34", 25, 34],
    ["35–44", 35, 44],
    ["45–54", 45, 54],
    ["55+", 55, 120],
  ];
  return buckets
    .map(([label, min, max]) => [
      label,
      rows.filter((row) => Number.isFinite(row.age) && row.age >= min && row.age <= max).length,
    ])
    .filter(([, value]) => value > 0);
}

function yesCount(rows, key) {
  return rows.filter((row) => normalize(row[key]).startsWith("sim")).length;
}

function percentage(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function destroyChart(id) {
  charts.get(id)?.destroy();
  charts.delete(id);
}

const centerTextPlugin = {
  id: "centerText",
  afterDraw(chart) {
    if (chart.config.type !== "doughnut") return;
    const { ctx, chartArea } = chart;
    const total = chart.data.datasets[0].data.reduce((sum, value) => sum + Number(value), 0);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f8f1e5";
    ctx.font = "400 34px 'Bebas Neue', sans-serif";
    ctx.fillText(total, (chartArea.left + chartArea.right) / 2, (chartArea.top + chartArea.bottom) / 2 - 7);
    ctx.fillStyle = "#777b82";
    ctx.font = "600 9px Inter, sans-serif";
    ctx.fillText("INSCRITOS", (chartArea.left + chartArea.right) / 2, (chartArea.top + chartArea.bottom) / 2 + 19);
    ctx.restore();
  },
};

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 650 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#f5eee2",
        titleColor: "#1a1b1d",
        bodyColor: "#3d3f42",
        borderColor: "rgba(216,155,70,.45)",
        borderWidth: 1,
        padding: 11,
        displayColors: true,
        boxPadding: 4,
      },
      datalabels: { display: false },
    },
  };
}

function renderLegend(targetId, entries, colors) {
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  document.getElementById(targetId).innerHTML = entries
    .map(([label, value], index) => `
      <div class="legend-item">
        <span class="legend-item__dot" style="background:${colors[index % colors.length]}"></span>
        <span>${label}</span>
        <strong>${value} <small>· ${percentage(value, total)}%</small></strong>
      </div>
    `)
    .join("");
}

function renderDonut(canvasId, legendId, entries) {
  destroyChart(canvasId);
  const colors = entries.map((_, index) => COLORS[index % COLORS.length]);
  charts.set(
    canvasId,
    new Chart(document.getElementById(canvasId), {
      type: "doughnut",
      data: {
        labels: entries.map(([label]) => label),
        datasets: [{
          data: entries.map(([, value]) => value),
          backgroundColor: colors,
          borderColor: "#17191c",
          borderWidth: 4,
          hoverOffset: 4,
        }],
      },
      options: {
        ...baseChartOptions(),
        cutout: "68%",
      },
      plugins: [centerTextPlugin],
    }),
  );
  renderLegend(legendId, entries, colors);
}

function renderBar(canvasId, entries, horizontal = false) {
  destroyChart(canvasId);
  const maxValue = Math.max(...entries.map(([, value]) => value), 1);
  charts.set(
    canvasId,
    new Chart(document.getElementById(canvasId), {
      type: "bar",
      data: {
        labels: entries.map(([label]) => label),
        datasets: [{
          data: entries.map(([, value]) => value),
          backgroundColor: entries.map((_, index) => index === 0 ? "#e5a84f" : "rgba(229,168,79,.42)"),
          borderColor: entries.map(() => "rgba(242,197,116,.48)"),
          borderWidth: 1,
          borderRadius: 7,
          borderSkipped: false,
          maxBarThickness: horizontal ? 31 : 48,
        }],
      },
      options: {
        ...baseChartOptions(),
        indexAxis: horizontal ? "y" : "x",
        layout: { padding: { top: horizontal ? 2 : 18, right: 15 } },
        scales: {
          x: {
            beginAtZero: true,
            suggestedMax: horizontal ? maxValue + 1 : undefined,
            grid: { color: "rgba(255,255,255,.055)", drawBorder: false },
            border: { display: false },
            ticks: {
              color: "#6f747c",
              font: { family: "Inter", size: 15 },
              precision: 0,
            },
          },
          y: {
            beginAtZero: true,
            suggestedMax: horizontal ? undefined : maxValue + 1,
            grid: { color: horizontal ? "transparent" : "rgba(255,255,255,.055)", drawBorder: false },
            border: { display: false },
            ticks: {
              color: "#a7a8aa",
              font: { family: "Inter", size: 15, weight: 600 },
              precision: 0,
              callback(value) {
                const label = this.getLabelForValue(value);
                const maxLength = window.innerWidth < 600 ? 22 : 36;
                return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
              },
            },
          },
        },
        plugins: {
          ...baseChartOptions().plugins,
          datalabels: {
            display: true,
            color: "#f8f1e5",
            anchor: horizontal ? "end" : "end",
            align: horizontal ? "right" : "top",
            clamp: true,
            font: { family: "Inter", size: 15, weight: 700 },
          },
        },
      },
      plugins: [ChartDataLabels],
    }),
  );
}

function updateMetrics(registrationRows, analysisRows) {
  const ages = analysisRows.map((row) => parseAge(row.age)).filter(Number.isFinite);
  analysisRows.forEach((row) => { row.age = parseAge(row.age); });
  const registrationsTotal = registrationRows.length;
  const analysisTotal = analysisRows.length;
  const baptized = yesCount(analysisRows, "baptism");
  const cellParticipants = yesCount(analysisRows, "cell");
  const confirmed = analysisTotal;
  const average = ages.length ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length) : 0;
  const min = ages.length ? Math.min(...ages) : 0;
  const max = ages.length ? Math.max(...ages) : 0;
  const baptizedPercent = percentage(baptized, analysisTotal);
  const cellPercent = percentage(cellParticipants, analysisTotal);
  const confirmedPercent = percentage(confirmed, registrationsTotal);

  document.getElementById("totalRegistrations").textContent = registrationsTotal.toLocaleString("pt-BR");
  document.getElementById("confirmedCount").textContent = confirmed.toLocaleString("pt-BR");
  document.getElementById("confirmedCaption").textContent = "pago/agendado";
  document.getElementById("confirmedProgress").style.width = `${confirmedPercent}%`;
  document.getElementById("averageAge").textContent = average;
  document.getElementById("ageRange").textContent = `Faixa de ${min} a ${max} anos`;
  document.getElementById("baptizedRate").textContent = `${baptizedPercent}%`;
  document.getElementById("baptizedCaption").textContent = `${baptized} de ${analysisTotal} inscritos`;
  document.getElementById("baptizedProgress").style.width = `${baptizedPercent}%`;
  document.getElementById("cellRate").textContent = `${cellPercent}%`;
  document.getElementById("cellCaption").textContent = `${cellParticipants} de ${analysisTotal} inscritos`;
  document.getElementById("cellProgress").style.width = `${cellPercent}%`;
}

function renderDashboard(rows, source) {
  // Linhas marcadas como ERRO na coluna Confirmação não representam
  // inscrições válidas e ficam fora de todos os indicadores e gráficos.
  const validRows = rows.filter((row) => normalize(row.confirmation) !== "erro");
  const analysisRows = validRows.filter((row) => {
    const confirmation = normalize(row.confirmation);
    return confirmation === "pago" || confirmation === "pagar";
  });

  updateMetrics(validRows, analysisRows);

  const marital = countBy(analysisRows, "marital");
  const age = ageBuckets(analysisRows);
  const baptism = countBy(analysisRows, "baptism");
  const cell = countBy(analysisRows, "cell");
  const encounter = countBy(analysisRows, "encounter");
  const church = countBy(analysisRows, "church");
  const otherChurches = countBy(
    analysisRows.filter((row) => String(row.otherChurch || "").trim()),
    "otherChurch",
  ).map(([label, count]) => [label.toLocaleUpperCase("pt-BR"), count]);

  renderDonut("maritalChart", "maritalLegend", marital);
  renderBar("ageChart", age);
  renderDonut("baptismChart", "baptismLegend", baptism);
  renderDonut("cellChart", "cellLegend", cell);
  renderBar("encounterChart", encounter);
  renderBar("churchChart", church, true);
  renderBar("otherChurchesChart", otherChurches.length ? otherChurches : [["Sem respostas", 0]], true);

  document.getElementById("maritalHighlight").textContent = marital[0]
    ? `${marital[0][0]} · ${percentage(marital[0][1], analysisRows.length)}%`
    : "Sem respostas";
  document.getElementById("ageHighlight").textContent = age[0]
    ? `Maior grupo: ${age.slice().sort((a, b) => b[1] - a[1])[0][0]} anos`
    : "Sem idades válidas";
  document.getElementById("otherChurchesCount").textContent = `${otherChurches.reduce((sum, [, count]) => sum + count, 0)} respostas detalhadas`;

  const now = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  document.getElementById("lastUpdate").textContent = `Atualizado em ${now} · ${source === "live" ? "Google Planilhas" : "retrato local"}`;
}

function setConnectionState(state) {
  const control = document.querySelector(".live-control");
  const label = document.getElementById("connectionLabel");
  control.classList.remove("is-live", "is-offline");

  if (state === "live") {
    control.classList.add("is-live");
    label.textContent = "Atualizar";
  } else if (state === "offline") {
    control.classList.add("is-offline");
    label.textContent = "Retrato local";
  } else {
    label.textContent = "Atualizando...";
  }
}

function showFallbackNotice(error) {
  const banner = document.getElementById("statusBanner");
  banner.hidden = false;
  document.getElementById("statusTitle").textContent = "Planilha privada · retrato local ativo";
  document.getElementById("statusText").textContent =
    "Para sincronização automática, publique a planilha para leitura ou use um proxy autenticado.";
  console.info("Fonte ao vivo indisponível:", error?.message);
}

async function refreshData() {
  const button = document.getElementById("refreshButton");
  button.classList.add("is-loading");
  setConnectionState("loading");
  try {
    const rows = await loadSheetData();
    renderDashboard(rows, "live");
    setConnectionState("live");
    document.getElementById("statusBanner").hidden = true;
  } catch (error) {
    renderDashboard(SNAPSHOT_ROWS.map((row) => ({ ...row })), "snapshot");
    setConnectionState("offline");
    showFallbackNotice(error);
  } finally {
    button.classList.remove("is-loading");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  Chart.defaults.color = "#8d9197";
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  document.getElementById("refreshButton").addEventListener("click", refreshData);
  document.getElementById("statusRetry").addEventListener("click", refreshData);
  refreshData();
  window.setInterval(refreshData, SHEET_CONFIG.refreshIntervalMs);
});
