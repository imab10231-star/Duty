CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  employee_id VARCHAR(30) NOT NULL,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(150) NULL,
  department_id INT NULL,
  designation_id INT NULL,
  shift_id INT NULL,
  joining_date DATE NOT NULL,
  salary DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_employee_id_per_company (company_id, employee_id),
  INDEX idx_employees_company (company_id),
  INDEX idx_employees_status (status),
  INDEX idx_employees_department (department_id),
  INDEX idx_employees_designation (designation_id),
  INDEX idx_employees_shift (shift_id),

  CONSTRAINT fk_employees_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_employees_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_employees_designation FOREIGN KEY (designation_id) REFERENCES designations(id) ON DELETE SET NULL,
  CONSTRAINT fk_employees_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
);
