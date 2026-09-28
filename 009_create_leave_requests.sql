CREATE TABLE IF NOT EXISTS leave_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  employee_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INT NOT NULL,
  reason VARCHAR(255) NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL,
  decision_note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_leave_requests_company (company_id),
  INDEX idx_leave_requests_employee (employee_id),
  INDEX idx_leave_requests_status (status),
  INDEX idx_leave_requests_dates (start_date, end_date),

  CONSTRAINT fk_leave_requests_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_requests_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_requests_leave_type FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
);
