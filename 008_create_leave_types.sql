CREATE TABLE IF NOT EXISTS leave_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  days_per_year INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_leave_type_per_company (company_id, name),
  INDEX idx_leave_types_company (company_id),
  CONSTRAINT fk_leave_types_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
