ALTER TABLE attendance_logs
  ADD UNIQUE KEY uniq_attendance_punch (employee_id, punch_time, source);
