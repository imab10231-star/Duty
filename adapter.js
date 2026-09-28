// All ZKTeco-specific code lives in this one file. Controllers never talk to
// node-zklib directly — they call the plain methods below. That's the isolation
// the project brief asks for: swapping to a different device SDK later (or
// adding a second brand) means changing this adapter, not the controllers,
// routes, or database layer.
//
// node-zklib talks to the device over TCP/UDP using ZKTeco's published wire
// protocol (see https://www.npmjs.com/package/node-zklib) — no vendor code
// is copied, only its documented public API is used.

const ZKLib = require('node-zklib');

function buildClient(device) {
  return new ZKLib(device.ip_address, device.port, device.timeout_ms, device.inport);
}

// node-zklib rejects with its own ZKError class (not a real Error — no
// .message), so callers who do `err.message` get "undefined". This turns
// whatever it throws into a normal Error with a readable message.
function normalizeError(err) {
  if (err instanceof Error) return err;
  if (err && typeof err.toast === 'function') return new Error(err.toast());
  return new Error(String(err));
}

// Connects, runs `fn(client)`, and always disconnects afterward — every
// adapter method below goes through this so a failed connection never
// leaves a dangling socket.
async function withConnection(device, fn) {
  const client = buildClient(device);
  try {
    await client.createSocket();
  } catch (err) {
    throw normalizeError(err);
  }
  try {
    return await fn(client);
  } catch (err) {
    throw normalizeError(err);
  } finally {
    try { await client.disconnect(); } catch (_) { /* already gone — fine */ }
  }
}

// Connects and reads the device's own status/info (used counts, capacity).
// Returns a plain object; throws with a readable message if unreachable.
async function testConnection(device) {
  try {
    const info = await withConnection(device, (client) => client.getInfo());
    return { reachable: true, info };
  } catch (err) {
    return { reachable: false, error: err.message };
  }
}

// Returns the device's enrolled users as { deviceUserId, name }[].
// node-zklib returns { uid, userId, name, ... } per user — deviceUserId here
// is `userId`, the device's own ID string (what attendance records reference),
// not the internal `uid` slot number.
async function getUsers(device) {
  const { data } = await withConnection(device, (client) => client.getUsers());
  return (data || []).map((u) => ({ deviceUserId: String(u.userId), name: u.name }));
}

// Returns raw punches as { deviceUserId, punchTime }[]. The device doesn't
// reliably report in/out direction in this basic record format, so that's
// left null — attendanceCalc already handles that (earliest/latest punch of
// the day = check-in/out) regardless.
async function getAttendanceLogs(device) {
  const { data } = await withConnection(device, (client) => client.getAttendances());
  return (data || []).map((r) => ({ deviceUserId: String(r.deviceUserId), punchTime: r.recordTime }));
}

module.exports = { testConnection, getUsers, getAttendanceLogs };
