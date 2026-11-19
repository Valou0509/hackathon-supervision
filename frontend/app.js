// S'adapte automatiquement à l'IP du PC serveur sur le réseau local
const API_URL = `http://${window.location.hostname}:3000/api`;

const PALETTE = ['#0d6efd', '#198754', '#dc3545', '#fd7e14', '#6f42c1', '#0dcaf0'];

let variablesList = [];
const charts = new Map();
const pollingTimers = new Map();

// --- Utilitaires UI ---

function showAlert(message, type = 'success') {
  const zone = document.getElementById('alert-zone');
  zone.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show shadow-sm" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
  setTimeout(() => {
    const alertEl = zone.querySelector('.alert');
    if (alertEl) bootstrap.Alert.getOrCreateInstance(alertEl).close();
  }, 4000);
}

async function checkApiStatus() {
  const badge = document.getElementById('api-status');
  try {
    const res = await fetch(`${API_URL}/status`);
    if (!res.ok) throw new Error();
    badge.className = 'badge bg-success py-2 px-3';
    badge.innerHTML = '<span class="status-dot bg-light"></span>API Connectée';
  } catch {
    badge.className = 'badge bg-danger py-2 px-3';
    badge.innerHTML = '<span class="status-dot bg-light"></span>API Hors ligne';
  }
}

// --- Chargement global ---

async function loadAll() {
  try {
    const res = await fetch(`${API_URL}/variables`);
    variablesList = await res.json();
    renderVariablesTable();
    renderExportSelect();
    renderDashboard();
  } catch (err) {
    showAlert('Impossible de joindre le serveur backend.', 'danger');
  }
}

// --- Onglet 1 : Graphiques ChartJS temps réel ---

function clearDashboardTimersAndCharts() {
  for (const timerId of pollingTimers.values()) clearInterval(timerId);
  pollingTimers.clear();
  for (const chart of charts.values()) chart.destroy();
  charts.clear();
}

function renderDashboard() {
  clearDashboardTimersAndCharts();
  const container = document.getElementById('charts-container');
  const emptyMsg = document.getElementById('empty-dashboard');
  container.innerHTML = '';

  const activeVars = variablesList.filter((v) => Boolean(v.actif));
  if (activeVars.length === 0) {
    emptyMsg.classList.remove('d-none');
    return;
  }
  emptyMsg.classList.add('d-none');

  activeVars.forEach((v, index) => {
    const color = PALETTE[index % PALETTE.length];
    const col = document.createElement('div');
    col.className = 'col-12 col-xl-6';
    col.innerHTML = `
      <div class="card shadow-sm h-100">
        <div class="card-header bg-white d-flex justify-content-between align-items-center py-3">
          <div>
            <h5 class="mb-0 fw-semibold">${v.nom}</h5>
            <small class="text-muted">
              <i class="bi bi-hdd-network me-1"></i>${v.ip_automate}:${v.port_modbus}
              &bull; Registre ${v.registre}
              &bull; Rafraîchissement : ${v.frequence_sec}s
            </small>
          </div>
          <span class="badge bg-light text-dark border value-badge" id="val-${v.id}">--</span>
        </div>
        <div class="card-body">
          <div class="chart-wrapper">
            <canvas id="chart-${v.id}"></canvas>
          </div>
        </div>
      </div>
    `;
    container.appendChild(col);

    const ctx = document.getElementById(`chart-${v.id}`).getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: v.nom,
          data: [],
          borderColor: color,
          backgroundColor: `${color}22`,
          borderWidth: 2,
          fill: true,
          tension: 0.25,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8 } },
          y: { beginAtZero: false }
        }
      }
    });

    charts.set(v.id, chart);

    // Lecture immédiate puis rafraîchissement à la fréquence configurée
    updateChart(v.id);
    const intervalMs = Math.max(1, Number(v.frequence_sec)) * 1000;
    pollingTimers.set(v.id, setInterval(() => updateChart(v.id), intervalMs));
  });
}

async function updateChart(varId) {
  const chart = charts.get(varId);
  if (!chart) return;

  try {
    const res = await fetch(`${API_URL}/variables/${varId}/mesures?limit=30`);
    const mesures = await res.json();

    chart.data.labels = mesures.map((m) =>
      new Date(m.horodatage).toLocaleTimeString('fr-FR')
    );
    chart.data.datasets[0].data = mesures.map((m) => m.valeur);
    chart.update();

    const badge = document.getElementById(`val-${varId}`);
    if (badge && mesures.length > 0) {
      badge.textContent = mesures[mesures.length - 1].valeur;
    }
  } catch (err) {
    console.error(`Erreur rafraîchissement variable ${varId}:`, err);
  }
}

// --- Onglet 2 : Configuration (CRUD) ---

function renderVariablesTable() {
  const tbody = document.getElementById('variables-tbody');
  if (variablesList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Aucune variable enregistrée.</td></tr>';
    return;
  }

  tbody.innerHTML = variablesList.map((v) => `
    <tr>
      <td class="fw-semibold">${v.nom}</td>
      <td><code>${v.ip_automate}:${v.port_modbus}</code></td>
      <td>${v.registre}</td>
      <td>${v.frequence_sec} s</td>
      <td>
        ${v.actif
          ? '<span class="badge bg-success">Actif</span>'
          : '<span class="badge bg-secondary">Inactif</span>'}
      </td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary me-1" onclick="editVariable(${v.id})" title="Modifier">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteVariable(${v.id})" title="Supprimer">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

window.editVariable = function (id) {
  const v = variablesList.find((item) => item.id === id);
  if (!v) return;

  document.getElementById('var-id').value = v.id;
  document.getElementById('var-nom').value = v.nom;
  document.getElementById('var-ip').value = v.ip_automate;
  document.getElementById('var-port').value = v.port_modbus;
  document.getElementById('var-registre').value = v.registre;
  document.getElementById('var-freq').value = v.frequence_sec;
  document.getElementById('var-actif').checked = Boolean(v.actif);

  document.getElementById('form-title').innerHTML = '<i class="bi bi-pencil-square me-1 text-warning"></i>Modifier la variable';
  document.getElementById('btn-cancel-edit').classList.remove('d-none');
};

function resetForm() {
  document.getElementById('variable-form').reset();
  document.getElementById('var-id').value = '';
  document.getElementById('var-port').value = 502;
  document.getElementById('var-freq').value = 5;
  document.getElementById('var-actif').checked = true;
  document.getElementById('form-title').innerHTML = '<i class="bi bi-plus-circle me-1 text-primary"></i>Ajouter une variable';
  document.getElementById('btn-cancel-edit').classList.add('d-none');
}

document.getElementById('btn-cancel-edit').addEventListener('click', resetForm);

document.getElementById('variable-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('var-id').value;
  const payload = {
    nom: document.getElementById('var-nom').value.trim(),
    ip_automate: document.getElementById('var-ip').value.trim(),
    port_modbus: Number(document.getElementById('var-port').value),
    registre: Number(document.getElementById('var-registre').value),
    frequence_sec: Number(document.getElementById('var-freq').value),
    actif: document.getElementById('var-actif').checked
  };

  const url = id ? `${API_URL}/variables/${id}` : `${API_URL}/variables`;
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error();
    showAlert(id ? 'Variable mise à jour et surveillance rechargée.' : 'Variable ajoutée et surveillance démarrée.');
    resetForm();
    await loadAll();
  } catch {
    showAlert("Erreur lors de l'enregistrement de la variable.", 'danger');
  }
});

window.deleteVariable = async function (id) {
  if (!confirm('Supprimer cette variable et tout son historique de mesures ?')) return;
  try {
    const res = await fetch(`${API_URL}/variables/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    showAlert('Variable supprimée.', 'warning');
    await loadAll();
  } catch {
    showAlert('Erreur lors de la suppression.', 'danger');
  }
};

// --- Onglet 3 : Export CSV ---

function renderExportSelect() {
  const select = document.getElementById('export-var-id');
  select.innerHTML = variablesList
    .map((v) => `<option value="${v.id}">${v.nom} (${v.ip_automate} - Reg. ${v.registre})</option>`)
    .join('');
}

document.getElementById('export-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const varId = document.getElementById('export-var-id').value;
  if (!varId) return;

  const debutVal = document.getElementById('export-debut').value;
  const finVal = document.getElementById('export-fin').value;

  const params = new URLSearchParams();
  // Conversion en UTC pour correspondre au CURRENT_TIMESTAMP de MariaDB
  if (debutVal) params.append('debut', new Date(debutVal).toISOString().slice(0, 19));
  if (finVal) params.append('fin', new Date(finVal).toISOString().slice(0, 19));

  const queryString = params.toString() ? `?${params.toString()}` : '';
  window.location.href = `${API_URL}/variables/${varId}/export${queryString}`;
});

// --- Initialisation ---
checkApiStatus();
setInterval(checkApiStatus, 10000);
loadAll();