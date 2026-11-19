require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, waitForDb } = require('./db');
const { reloadTasks } = require('./modbusService');

const app = express();
app.use(cors());
app.use(express.json());

// Vérification de l'état de l'API
app.get('/api/status', (req, res) => {
  res.json({ status: 'OK', message: 'Backend opérationnel' });
});

// 1. Lister toutes les variables configurées
app.get('/api/variables', async (req, res) => {
  try {
    const rows = await pool.query('SELECT * FROM variables ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Ajouter une variable et mettre à jour le scheduler dynamiquement
app.post('/api/variables', async (req, res) => {
  const { nom, ip_automate, port_modbus = 502, registre, frequence_sec = 5, actif = true } = req.body;
  if (!nom || !ip_automate || registre === undefined) {
    return res.status(400).json({ error: 'Champs nom, ip_automate et registre obligatoires.' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO variables (nom, ip_automate, port_modbus, registre, frequence_sec, actif) VALUES (?, ?, ?, ?, ?, ?)',
      [nom, ip_automate, Number(port_modbus), Number(registre), Number(frequence_sec), Boolean(actif)]
    );
    await reloadTasks();
    res.status(201).json({ id: result.insertId, nom, ip_automate, port_modbus, registre, frequence_sec, actif });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Modifier une variable existante
app.put('/api/variables/:id', async (req, res) => {
  const { id } = req.params;
  const { nom, ip_automate, port_modbus = 502, registre, frequence_sec = 5, actif = true } = req.body;
  try {
    await pool.query(
      'UPDATE variables SET nom = ?, ip_automate = ?, port_modbus = ?, registre = ?, frequence_sec = ?, actif = ? WHERE id = ?',
      [nom, ip_automate, Number(port_modbus), Number(registre), Number(frequence_sec), Boolean(actif), id]
    );
    await reloadTasks();
    res.json({ message: 'Variable mise à jour.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Supprimer une variable
app.delete('/api/variables/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM variables WHERE id = ?', [req.params.id]);
    await reloadTasks();
    res.json({ message: 'Variable supprimée.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Récupérer les dernières mesures d'une variable (pour ChartJS)
app.get('/api/variables/:id/mesures', async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 30));
  try {
    const rows = await pool.query(
      `SELECT id, valeur, horodatage FROM mesures
       WHERE variable_id = ?
       ORDER BY horodatage DESC
       LIMIT ?`,
      [req.params.id, limit]
    );
    res.json(rows.reverse()); // Ordre chronologique pour le graphique
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Exporter les données historiques en CSV sur une plage de dates
app.get('/api/variables/:id/export', async (req, res) => {
  const { id } = req.params;
  const { debut, fin } = req.query;

  try {
    const [variable] = await pool.query('SELECT nom FROM variables WHERE id = ?', [id]);
    if (!variable) return res.status(404).json({ error: 'Variable introuvable.' });

    let sql = 'SELECT horodatage, valeur FROM mesures WHERE variable_id = ?';
    const params = [id];

    if (debut) {
      sql += ' AND horodatage >= ?';
      params.push(debut.replace('T', ' '));
    }
    if (fin) {
      sql += ' AND horodatage <= ?';
      params.push(fin.replace('T', ' '));
    }
    sql += ' ORDER BY horodatage ASC';

    const rows = await pool.query(sql, params);

    // Génération CSV compatible Excel (séparateur point-virgule + BOM UTF-8)
    const header = 'Horodatage;Variable;Valeur\n';
    const lines = rows.map((r) => {
      const dateStr = new Date(r.horodatage).toISOString().replace('T', ' ').slice(0, 19);
      return `${dateStr};"${variable.nom}";${r.valeur}`;
    });
    const csvContent = '\uFEFF' + header + lines.join('\n');

    const safeName = variable.nom.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="export_${safeName}.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.BACKEND_PORT || 3000;

waitForDb()
  .then(async () => {
    await reloadTasks();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`API REST démarrée sur le port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });