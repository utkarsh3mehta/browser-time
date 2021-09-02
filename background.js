let db = null;
chrome.runtime.onInstalled.addListener(() => {
  if (!window.indexedDB) {
    console.error(
      "Indexed DB is not a part of your browser. Will not be able to use this extension"
    );
  } else {
    const request = window.indexedDB.open("browserTime_db", 1);

    request.onerror = function (ev) {
      console.error("request error code", request.errorCode);
      console.error("Error opening DB:", ev.stack || ev);
    };
    request.onupgradeneeded = function (ev) {
      db = ev.target.result;
      let quotaStore = db.createObjectStore("quota", {
        keypath: "id",
        autoIncrement: true,
      });
      quotaStore.createIndex("url", "url", { unique: true });
      quotaStore.createIndex("domain", "domain", { unique: false });
      quotaStore.createIndex("quota", "quota", { unique: false });
      quotaStore.transaction.oncomplete = function () {};
      let historyStore = db.createObjectStore("history", {
        keypath: "id",
        autoIncrement: true,
      });
      historyStore.createIndex("url", "url", { unique: false });
      historyStore.createIndex("domain", "domain", { unique: false });
      historyStore.createIndex("date", "date", { unique: false });
      historyStore.createIndex("timespent", "timespent", { unique: false });
      historyStore.transaction.oncomplete = function () {};
    };
    request.onsuccess = function (ev) {
      db = request.result;
    };
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("request", request);
  console.log("sender", sender);
  console.log("send response", sendResponse);
  if (request.message === "add") {
    let dbrequest = addQuota(
      request.payload.url,
      request.payload.domain,
      request.payload.quota
    );
    dbrequest.then((res) => {
      chrome.runtime.sendMessage({
        message: "add_response",
        payload: res,
      });
    });
  } else if (request.message === "get_all") {
    let dbrequest = getList();
    dbrequest.then((res) => {
      chrome.runtime.sendMessage({
        message: "get_all_response",
        payload: res,
      });
    });
  }
});

function addQuota(url, domain, quota) {
  if (db) {
    const addTransaction = db.transaction("quota", "readwrite");
    const quotaStore = addTransaction.objectStore("quota");

    return new Promise((resolve, reject) => {
      addTransaction.oncomplete = function () {
        resolve(true);
      };

      addTransaction.onerror = function (err) {
        console.log("Quota adding transaction errorer: ", err.stack || err);
        resolve(false);
      };

      let request = quotaStore.add({ url, domain, quota });

      request.onsuccess = function () {};
    });
  }
}

function getList() {
  if (db) {
    const getTransaction = db.transaction("quota", "readonly");
    const quotaStore = getTransaction.objectStore("quota");
    return new Promise((resolve, reject) => {
      getTransaction.oncomplete = function (event) {};
      getTransaction.onerror = function (err) {
        console.log("Quota get transaction errored: ", err.stack || err);
        resolve(false);
      };
      let request = quotaStore.getAll();
      request.onsuccess = function (event) {
        resolve(event.target.result);
      };
    });
  }
}
