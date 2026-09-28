CREATE TABLE IF NOT EXISTS attendance_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  employee_id INT NOT NULL,
  device_id VARCHAR(50) NULL,
  device_user_id VARCHAR(50) NULL,
  punch_time DATETIME NOT NULL,
  verify_mode VARCHAR(20) NULL,
  in_out_mode ENUM('in', 'out') NULL,
  work_code VARCHAR(20) NULL,
  source ENUM('manual', 'device') NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_attendance_company (company_id),
  INDEX idx_attendance_employee_time (employee_id, punch_time),
  INDEX idx_attendance_punch_time (punch_time),

  CONSTRAINT fk_attendance_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
