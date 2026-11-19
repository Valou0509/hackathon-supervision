const cron = require('node-cron');
const ModbusRTU = require('modbus-serial');
const { pool } = require('./db');

// Stocke les tâches cron actives pour pouvoir les relancer à chaud
const activeTasks = new Map();
const readingLocks = new Set();

// Convertit une fréquence en secondes en expression node-cron valide
function buildCronExpression(freqSec) {
  const sec = Math.max(1, Math.floor(Number(freqSec) || 5));
  if (sec < 60) {
    return `*/${sec} * * * * *`;
  }
  const minutes = Math.min(59, Math.max(1, Math.round(sec / 60)));
  return `0 */${minutes} * * * *`;
}

// Lit un registre Holding Modbus TCP et enregistre la valeur en BDD
async function pollVariable(variable) {
  if (readingLocks.has(variable.id)) return;
  readingLocks.add(variable.id);

  const client = new ModbusRTU();
  try {
    client.setTimeout(1500);
    await client.connectTCP(variable.ip_automate, {
      port: Number(variable.port_modbus) || 502
    });
    client.setID(1);

    const data = await client.readHoldingRegisters(Number(variable.registre), 1);
    const valeur = data.data[0];

    await pool.query(
      'INSERT INTO mesures (variable_id, valeur) VALUES (?, ?)',
      [variable.id, valeur]
    );
    console.log(`[Modbus] ${variable.nom} (${variable.ip_automate}:${variable.registre}) = ${valeur}`);
  } catch (err) {
    console.error(`[Erreur Modbus] ${variable.nom} (${variable.ip_automate}) : ${err.message}`);
  } finally {
    try {
      client.close(() => {});
    } catch (_) {}
    readingLocks.delete(variable.id);
  }
}

// Recharge toutes les tâches périodiques depuis la BDD sans redémarrer le serveur
async function reloadTasks() {
  for (const task of activeTasks.values()) {
    task.stop();
  }
  activeTasks.clear();

  const variables = await pool.query('SELECT * FROM variables WHERE actif = TRUE');
  for (const variable of variables) {
    const expr = buildCronExpression(variable.frequence_sec);
    const task = cron.schedule(expr, () => pollVariable(variable));
    activeTasks.set(variable.id, task);
  }
  console.log(`[Scheduler] ${activeTasks.size} tâche(s) de surveillance active(s).`);
}

module.exports = { reloadTasks };