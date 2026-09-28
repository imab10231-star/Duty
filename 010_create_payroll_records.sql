CREATE TABLE IF NOT EXISTS payroll_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  employee_id INT NOT NULL,
  month TINYINT NOT NULL,
  year SMALLINT NOT NULL,

  basic_salary DECIMAL(12,2) NOT NULL,
  total_days_in_month TINYINT NOT NULL,
  present_days DECIMAL(5,1) NOT NULL DEFAULT 0,
  absent_days DECIMAL(5,1) NOT NULL DEFAULT 0,
  half_days INT NOT NULL DEFAULT 0,
  leave_days INT NOT NULL DEFAULT 0,
  late_days INT NOT NULL DEFAULT 0,
  overtime_minutes INT NOT NULL DEFAULT 0,

  absent_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
  overtime_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  bonus DECIMAL(12,2) NOT NULL DEFAULT 0,
  other_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_payable DECIMAL(12,2) NOT NULL DEFAULT 0,

  status ENUM('draft', 'finalized') NOT NULL DEFAULT 'draft',
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_payroll_period (company_id, employee_id, month, year),
  INDEX idx_payroll_company_period (company_id, month, year),
  INDEX idx_payroll_employee (employee_id),

  CONSTRAINT fk_payroll_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_payroll_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
