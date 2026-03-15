const trackerSocketMap = new Map();
const socketTrackerMap = new WeakMap();

function registerTrackerSocket(trackerId, socket) {
  if (!trackerId) return;

  const existing = trackerSocketMap.get(trackerId);
  if (existing && existing !== socket) {
    try {
      existing.destroy();
    } catch {
      // nada
    }
  }

  trackerSocketMap.set(trackerId, socket);
  socketTrackerMap.set(socket, trackerId);
}

function unregisterSocket(socket) {
  const trackerId = socketTrackerMap.get(socket);
  if (!trackerId) return;

  const currentSocket = trackerSocketMap.get(trackerId);
  if (currentSocket === socket) {
    trackerSocketMap.delete(trackerId);
  }
}

function getSocketByTrackerId(trackerId) {
  return trackerSocketMap.get(trackerId) || null;
}

function isTrackerOnline(trackerId) {
  return trackerSocketMap.has(trackerId);
}

module.exports = {
  registerTrackerSocket,
  unregisterSocket,
  getSocketByTrackerId,
  isTrackerOnline,
};
