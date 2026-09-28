ALTER TABLE employees
  ADD COLUMN device_user_id VARCHAR(20) NULL AFTER shift_id,
  ADD UNIQUE KEY uniq_employee_device_user (company_id, device_user_id);
