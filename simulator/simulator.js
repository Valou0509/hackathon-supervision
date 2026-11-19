const ModbusRTU = require('modbus-serial');

// Valeurs initiales des registres [Température, Pression, Niveau]
const registers = [24, 105, 60];

// Variation réaliste toutes les secondes
setInterval(() => {
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  registers[0] = clamp(registers[0] + Math.round((Math.random() - 0.5) * 2), 20, 30);
  registers[1] = clamp(registers[1] + Math.round((Math.random() - 0.5) * 4), 95, 115);
  registers[2] = clamp(registers[2] + Math.round((Math.random() - 0.5) * 3), 40, 80);
}, 1000);

const vector = {
  getHoldingRegister: (addr) => registers[addr] ?? 0,
  getInputRegister: (addr) => registers[addr] ?? 0,
  setRegister: (addr, value) => {
    registers[addr] = value;
  }
};

const serverTCP = new ModbusRTU.ServerTCP(vector, {
  host: '0.0.0.0',
  port: 502,
  debug: false,
  unitID: 1
});

serverTCP.on('initialized', () => {
  console.log('Simulateur Modbus TCP prêt sur le port 502 (registres 0, 1, 2)');
});

serverTCP.on('socketError', (err) => {
  console.error('Erreur socket Modbus :', err.message);
});