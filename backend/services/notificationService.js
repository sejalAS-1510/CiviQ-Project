const Notification = require("../models/Notification");

async function createNotification(payload) {
  try {
    const notification = await Notification.create(payload);
    return { success: true, data: notification };
  } catch (error) {
    console.warn(
      "[notification] Failed to create notification:",
      error.message,
    );
    return { success: false, error };
  }
}

async function createNotifications(payloads = []) {
  const results = await Promise.all(
    payloads.map((payload) => createNotification(payload)),
  );
  return results;
}

module.exports = {
  createNotification,
  createNotifications,
};
