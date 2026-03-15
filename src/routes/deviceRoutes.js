const controller = require("../controllers/deviceController");
const authController = require("../controllers/authController");

const routes = [
  { method: "POST", pattern: /^\/auth\/register$/, handler: authController.register },
  { method: "POST", pattern: /^\/auth\/login$/, handler: authController.login },
  { method: "GET", pattern: /^\/auth\/me$/, handler: authController.me, authRequired: true },

  { method: "GET", pattern: /^\/devices$/, handler: controller.listDevices },

  { method: "GET", pattern: /^\/me\/devices$/, handler: controller.listMyDevices, authRequired: true },
  { method: "GET", pattern: /^\/me\/map\/devices$/, handler: controller.listMyMapDevices, authRequired: true },
  {
    method: "POST",
    pattern: /^\/me\/devices\/register$/,
    handler: controller.registerMyDevice,
    authRequired: true,
  },
  {
    method: "PUT",
    pattern: /^\/me\/devices\/(?<id>[^/]+)$/,
    handler: controller.updateMyDevice,
    authRequired: true,
  },
  {
    method: "PUT",
    pattern: /^\/me\/devices\/(?<id>[^/]+)\/password$/,
    handler: controller.setMyDevicePassword,
    authRequired: true,
  },
  {
    method: "POST",
    pattern: /^\/me\/devices\/(?<id>[^/]+)\/share$/,
    handler: controller.shareMyDevice,
    authRequired: true,
  },
  {
    method: "DELETE",
    pattern: /^\/me\/devices\/(?<id>[^/]+)\/share\/(?<userId>[^/]+)$/,
    handler: controller.revokeMyDeviceShare,
    authRequired: true,
  },
  {
    method: "GET",
    pattern: /^\/me\/devices\/(?<id>[^/]+)\/share$/,
    handler: controller.listMyDeviceShares,
    authRequired: true,
  },

  { method: "GET", pattern: /^\/devices\/(?<id>[^/]+)\/latest$/, handler: controller.getLatest },
  {
    method: "GET",
    pattern: /^\/devices\/(?<id>[^/]+)\/positions$/,
    handler: controller.getPositions,
  },
  { method: "GET", pattern: /^\/devices\/(?<id>[^/]+)\/trips$/, handler: controller.getTrips },
  {
    method: "GET",
    pattern: /^\/devices\/(?<id>[^/]+)\/trips\/(?<tripId>[^/]+)\/positions$/,
    handler: controller.getTripPositions,
  },
  { method: "GET", pattern: /^\/devices\/(?<id>[^/]+)\/events$/, handler: controller.getEvents },
  {
    method: "POST",
    pattern: /^\/devices\/(?<id>[^/]+)\/commands\/engine-stop$/,
    handler: controller.postEngineStop,
    authRequired: true,
  },
  {
    method: "POST",
    pattern: /^\/devices\/(?<id>[^/]+)\/commands\/engine-resume$/,
    handler: controller.postEngineResume,
    authRequired: true,
  },
  {
    method: "GET",
    pattern: /^\/devices\/(?<id>[^/]+)\/commands$/,
    handler: controller.getDeviceCommands,
    authRequired: true,
  },
  { method: "GET", pattern: /^\/devices\/(?<id>[^/]+)\/status$/, handler: controller.getStatus },
];

module.exports = {
  routes,
};
