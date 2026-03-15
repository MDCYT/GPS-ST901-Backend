const {
  getPendingCommandsByTrackerId,
  markCommandSent,
  markCommandFailed,
} = require("../services/commandService");
const { getSocketByTrackerId } = require("./connectionRegistry");

function normalizePayload(payload) {
  const text = String(payload || "").trim();
  if (!text) return "";
  return text.endsWith("#") ? text : `${text}#`;
}

async function dispatchPendingCommandsForTracker(trackerId) {
  const socket = getSocketByTrackerId(trackerId);
  if (!socket) {
    return { dispatched: 0, reason: "offline" };
  }

  const pending = await getPendingCommandsByTrackerId(trackerId, 20);
  if (pending.length === 0) {
    return { dispatched: 0, reason: "no-pending" };
  }

  let dispatched = 0;

  for (const command of pending) {
    if (String(command.command_payload || "").trim().startsWith("{")) {
      await markCommandFailed(command.id, "legacy-json-payload-not-supported-for-st901");
      continue;
    }

    const payload = normalizePayload(command.command_payload);
    if (!payload) continue;

    socket.write(payload);
    await markCommandSent(command.id, `sent:${payload}`);
    dispatched += 1;
  }

  return { dispatched, reason: "ok" };
}

module.exports = {
  dispatchPendingCommandsForTracker,
};
