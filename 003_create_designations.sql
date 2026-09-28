CREATE TABLE IF NOT EXISTS designations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_designation_per_company (company_id, name),
  INDEX idx_designations_company (company_id),
  CONSTRAINT fk_designations_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
