let db = null;
const dbversion = 4,
  quotaTableName = "quotav4",
  historyTableName = "historyv4",
  metaDataTableName = "meta-datav2";
const oneSecond = 1000;
const fiveMinute = 5 * 60 * 1000;
const maxHistoryResult = 500;
const onboardingLoadTime = 5000;
chrome.runtime.onInstalled.addListener(() => {
  if (!window.indexedDB) {
    console.error(
      "Indexed DB is not a part of your browser. Will not be able to use this extension"
    );
  } else {
    const request = window.indexedDB.open("browserTime_db", dbversion);
    request.onerror = function (ev) {
      console.error("Error opening DB:", ev.stack || ev);
    };
    request.onupgradeneeded = function (ev) {
      db = ev.target.result;
      let quotaStore = db.createObjectStore(quotaTableName, {
        keypath: "id",
        autoIncrement: true,
      });
      quotaStore.createIndex("url", "url", { unique: false });
      quotaStore.createIndex("domain", "domain", { unique: true });
      quotaStore.createIndex("quota", "quota", { unique: false });
      let historyStore = db.createObjectStore(historyTableName, {
        keypath: "id",
        autoIncrement: true,
      });
      historyStore.createIndex("url", "url", { unique: false });
      historyStore.createIndex("domain", "domain", { unique: false });
      historyStore.createIndex("date", "date", { unique: false });
      historyStore.createIndex("timespent", "timespent", { unique: false });
      historyStore.createIndex("tabId", "tabId", { unique: false });
      historyStore.createIndex("windowId", "windowId", { unique: false });
      historyStore.createIndex(
        "tabId, windowId, url",
        ["tabId", "windowId", "url"],
        { unique: false }
      );
      historyStore.createIndex(
        "tabId, windowId, date",
        ["tabId", "windowId", "date"],
        { unique: false }
      );
      let meta = db.createObjectStore(metaDataTableName, {
        keypath: "type",
      });
      meta.createIndex("type", "type", { unique: false });
      // wait 5 seconds;
      setTimeout(() => {
        // fetching history items from previous 5 days and 500 records
        const now = new Date();
        now.setDate(now.getDate() - 5);
        now.setHours(0);
        now.setMinutes(0);
        now.setSeconds(0);
        const start = now.setMilliseconds(0);
        chrome.history.search(
          {
            text: "",
            startTime: start,
            maxResults: maxHistoryResult,
          },
          (historyItems) => {
            for (const hI of historyItems) {
              let url = new URL(hI.url);
              chrome.history.getVisits({ url: hI.url }, (visitItems) => {
                let now = new Date().toISOString();
                for (const vI of visitItems) {
                  const addHistoryTransaction = db.transaction(
                    historyTableName,
                    "readwrite"
                  );
                  const historyStore =
                    addHistoryTransaction.objectStore(historyTableName);
                  addHistoryTransaction.onerror = function (err) {};
                  addHistoryTransaction.oncomplete = function () {};
                  let request = historyStore.add({
                    url: hI.url,
                    domain: url.host,
                    tabId: null,
                    windowId: null,
                    sessionId: null,
                    createdAt: now,
                    lastUpdatedAt: now,
                    starttime: vI.visitTime,
                    endtime: vI.visitTime + fiveMinute,
                    date: new Date(vI.visitTime).toDateString(),
                    timespent: fiveMinute,
                  });
                  request.onsuccess = function () {};
                }
              });
            }
          }
        );
      }, onboardingLoadTime);
    };
    request.onsuccess = function (ev) {
      db = request.result;
    };
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
    let dbrequest;
    if (request.payload) {
      dbrequest = getList(request.payload.date);
    } else {
      dbrequest = getList();
    }
    dbrequest.then((res) => {
      chrome.runtime.sendMessage({
        message: "get_all_response",
        payload: res,
      });
    });
  }
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  console.log("tab activated", tabId, windowId);
});

chrome.tabs.onCreated.addListener((tab) => {
  console.log("tab created");
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log("removing tab");
  console.log("tabId", tabId);
  console.log("removed tab info: windowId", removeInfo.windowId);
  console.log(
    "removed tab info: isWindowClosing: ",
    removeInfo.isWindowClosing
  );
});

// chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
//   console.log("tab replaced");
//   console.log("added tab id", addedTabId);
//   console.log("removed tab id", removedTabId);
// });

chrome.tabs.onUpdated.addListener((tabId, changedInfo, tab) => {
  console.log("update update update");
  console.log("tab id", tabId);
  console.log("change info", changedInfo);
  console.log("updated tab url", tab.pendingUrl, tab.url);
});

function addQuota(url, domain, quota) {
  if (db) {
    const addTransaction = db.transaction(quotaTableName, "readwrite");
    const quotaStore = addTransaction.objectStore(quotaTableName);

    return new Promise((resolve, reject) => {
      addTransaction.oncomplete = function () {
        resolve(true);
      };

      addTransaction.onerror = function (err) {
        console.error("Quota adding transaction errored: ", err.stack || err);
        resolve(false);
      };

      let request = quotaStore.add({ url, domain, quota });

      request.onsuccess = function () {};
    });
  }
}

function getList(date = null) {
  let useDate = new Date();
  if (date) {
    useDate = new Date(date);
  }
  if (db) {
    const getHistoryTransaction = db.transaction(historyTableName, "readonly");
    const historyStore = getHistoryTransaction.objectStore(historyTableName);
    return new Promise((resolve, reject) => {
      getHistoryTransaction.oncomplete = function () {};
      getHistoryTransaction.onerror = function (err) {
        console.error("History get transaction errored: ", err.stack || err);
        resolve(false);
      };
      let historyRequest = historyStore.getAll();
      historyRequest.onsuccess = function (event) {
        let result = event.target.result;
        let historyList = [];
        chrome.topSites.get((mostVisitedUrls) => {
          mostVisitedUrls.forEach((mvu) => {
            let todayTopResults = result
              .filter((r) => r.date === useDate.toDateString())
              .filter((r) => r.url === mvu.url);
            if (todayTopResults.length !== 0) {
              let domain = new URL(mvu.url).host;
              let count = todayTopResults.length;
              let timespent = todayTopResults
                .map((r) => r.timespent)
                .reduce((acc, next) => acc + next, 0);
              historyList.push({
                url: mvu.url,
                domain,
                count,
                timespent,
                quota: null,
              });
            }
          });
          historyList = historyList.slice(0, 5);
          const getQuotaTransaction = db.transaction(
            quotaTableName,
            "readonly"
          );
          const quotaStore = getQuotaTransaction.objectStore(quotaTableName);
          let quotaRequest = quotaStore.getAll();
          quotaRequest.onsuccess = function (event) {
            let quotaResult = event.target.result;
            if (historyList.length !== 0) {
              historyList.forEach((hl) => {
                let historyQuota = quotaResult.find(
                  (r) => r.domain === hl.domain
                );
                if (historyQuota) hl.quota = historyQuota.quota;
              });
            }
            quotaResult
              .filter(
                (q) => !historyList.map((hl) => hl.domain).includes(q.domain)
              )
              .forEach((q) => {
                let todayQuotaResults = result
                  .filter((r) => r.date === useDate.toDateString())
                  .filter((r) => r.url === q.url);
                if (todayQuotaResults.length !== 0) {
                  let domain = q.domain;
                  let count = todayQuotaResults.length;
                  let timespent = todayQuotaResults
                    .map((r) => r.timespent)
                    .reduce((acc, next) => acc + next, 0);
                  historyList.push({
                    url: q.url,
                    domain,
                    count,
                    timespent,
                    quota: q.quota,
                  });
                } else {
                  historyList.push({
                    url: q.url,
                    domain: q.domain,
                    count: 0,
                    timespent: 0,
                    quota: q.quota,
                  });
                }
              });
            resolve(historyList);
          };
        });
      };
      // };
    });
  }
}
