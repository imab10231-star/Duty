CREATE TABLE IF NOT EXISTS devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  port INT NOT NULL DEFAULT 4370,
  inport INT NOT NULL DEFAULT 4000,
  timeout_ms INT NOT NULL DEFAULT 10000,
  location VARCHAR(150) NULL,
  model VARCHAR(100) NULL,
  status ENUM('unknown', 'online', 'offline') NOT NULL DEFAULT 'unknown',
  last_sync_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_device_ip_per_company (company_id, ip_address),
  INDEX idx_devices_company (company_id),

  CONSTRAINT fk_devices_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
