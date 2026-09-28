CREATE TABLE IF NOT EXISTS shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_shift_per_company (company_id, name),
  INDEX idx_shifts_company (company_id),
  CONSTRAINT fk_shifts_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
