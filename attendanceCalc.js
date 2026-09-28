// Turns one employee's raw punches for one day into a computed attendance status.
// Raw punches are never modified — this only derives a read-only summary from them.
//
// MVP simplification: takes the earliest punch as check-in and the latest as
// check-out (ignores in_out_mode and multiple in/out pairs for now). Also
// compares time-of-day only, so a shift that crosses midnight is handled
// approximately, not exactly — fine for a first version, worth revisiting
// once real device data (multiple ins/outs, overnight shifts) shows up.

function timeToMinutes(timeStr) {
  // 'HH:MM:SS' or 'HH:MM' -> minutes since midnight
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function dateToMinutes(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function calculateDailyStatus(punchTimes, shift) {
  if (!punchTimes || punchTimes.length === 0) {
    return {
      status: 'absent',
      checkIn: null,
      checkOut: null,
      workedMinutes: null,
      lateMinutes: 0,
      overtimeMinutes: 0,
    };
  }

  const sorted = [...punchTimes].sort((a, b) => a - b);
  const checkIn = sorted[0];
  const checkOut = sorted.length > 1 ? sorted[sorted.length - 1] : null;

  // No shift assigned — we can still report check-in/out, just can't judge late/early/overtime.
  if (!shift) {
    return {
      status: checkOut ? 'present' : 'present',
      checkIn,
      checkOut,
      workedMinutes: checkOut ? Math.round((checkOut - checkIn) / 60000) : null,
      lateMinutes: 0,
      overtimeMinutes: 0,
    };
  }

  const shiftStart = timeToMinutes(shift.start_time);
  let shiftEnd = timeToMinutes(shift.end_time);
  if (shiftEnd <= shiftStart) shiftEnd += 24 * 60; // overnight shift
  const shiftDuration = shiftEnd - shiftStart - (shift.break_minutes || 0);
  const grace = shift.grace_minutes || 0;

  const checkInMinutes = dateToMinutes(checkIn);
  const lateMinutes = Math.max(0, checkInMinutes - (shiftStart + grace));

  let workedMinutes = null;
  let earlyLeave = false;
  let overtimeMinutes = 0;

  if (checkOut) {
    let checkOutMinutes = dateToMinutes(checkOut);
    if (checkOutMinutes < checkInMinutes) checkOutMinutes += 24 * 60; // crossed midnight
    workedMinutes = Math.max(0, checkOutMinutes - checkInMinutes);
    earlyLeave = checkOutMinutes < shiftEnd;
    overtimeMinutes = Math.max(0, checkOutMinutes - shiftEnd);
  }

  let status = 'present';
  if (workedMinutes !== null && workedMinutes < shiftDuration / 2) {
    status = 'half_day';
  } else if (lateMinutes > 0) {
    status = 'late';
  } else if (earlyLeave) {
    status = 'early_leave';
  } else if (overtimeMinutes > 0) {
    status = 'overtime';
  }

  return { status, checkIn, checkOut, workedMinutes, lateMinutes, overtimeMinutes };
}

module.exports = { calculateDailyStatus };
