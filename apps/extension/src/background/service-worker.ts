import { handleAccessStateAlarm, scheduleNextAccessStateAlarm } from "./alarms";
import { rebuildDnrRules } from "./dnr-rules";
import { registerAttemptTracker } from "./attempt-tracker";
import { routeMessage } from "./message-router";

chrome.runtime.onInstalled.addListener(() => {
  void rebuildDnrRules().then(() => scheduleNextAccessStateAlarm());
});

chrome.runtime.onStartup.addListener(() => {
  void rebuildDnrRules().then(() => scheduleNextAccessStateAlarm());
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  routeMessage(message).then(sendResponse);
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void handleAccessStateAlarm(alarm.name);
});

registerAttemptTracker();
