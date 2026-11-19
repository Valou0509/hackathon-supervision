CREATE DATABASE IF NOT EXISTS supervision_db;
USE supervision_db;

CREATE TABLE IF NOT EXISTS variables (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    ip_automate VARCHAR(45) NOT NULL,
    port_modbus INT NOT NULL DEFAULT 502,
    registre INT NOT NULL,
    frequence_sec INT NOT NULL DEFAULT 5,
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mesures (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    variable_id INT NOT NULL,
    valeur FLOAT NOT NULL,
    horodatage DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (variable_id) REFERENCES variables(id) ON DELETE CASCADE,
    INDEX idx_variable_horodatage (variable_id, horodatage)
);

-- Données de test pointant vers le conteneur simulateur
INSERT INTO variables (nom, ip_automate, port_modbus, registre, frequence_sec) VALUES
('Température Four (°C)', 'modbus-sim', 502, 0, 2),
('Pression Circuit (kPa)', 'modbus-sim', 502, 1, 3);