let db = null;
chrome.runtime.onInstalled.addListener(() => {
  if (!window.indexedDB) {
    console.error(
      "Indexed DB is not a part of your browser. Will not be able to use this extension"
    );
  } else {
    const request = window.indexedDB.open("browserTime_db", 2);
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
      quotaStore.createIndex("url", "url", { unique: false });
      quotaStore.createIndex("domain", "domain", { unique: true });
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
      let meta = db.createObjectStore("meta-data", {
        keypath: "id",
        autoIncrement: true,
      })
      meta.createIndex("type", "type", { unique: true });
      // fetching history items from previous 5 days and 500 records
      const now = new Date();
      now.setDate(now.getDate() - 5);
      now.setHours(0);
      now.setMinutes(0);
      now.setSeconds(0);
      const start = now.setMilliseconds(0);
      const fiveMinute = 60 * 5;
      chrome.history.search(
        {
          text: "",
          startTime: start,
          maxResults: 500,
        },
        (historyItems) => {
          for (const hI of historyItems) {
            let url = new URL(hI.url);
            chrome.history.getVisits({ url: hI.url }, (visitItems) => {
              for (const vI of visitItems) {
                const addHistoryTransaction = db.transaction(
                  "history",
                  "readwrite"
                );
                const historyStore =
                  addHistoryTransaction.objectStore("history");
                addHistoryTransaction.onerror = function (err) {};
                addHistoryTransaction.oncomplete = function () {};
                let request = historyStore.add({
                  url: hI.url,
                  domain: url.host,
                  starttime: vI.visitTime,
                  endtime: vI.visitTime + fiveMinute,
                  date: new Date(vI.visitTime).toDateString(),
                  timespent: 300,
                });
                request.onsuccess = function () {};
              }
            });
          }
        }
      );
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
  console.log("tab activated");
  chrome.tabs.get(tabId, (tab) => {
    if (tab.pendingUrl) {
      addHistory(
        tab.pendingUrl,
        new URL(tab.pendingUrl).host,
        tabId,
        windowId,
        tab.sessionid
      ).then((res) => {
        if (res) console.log("Added to history");
        else console.log("Error adding to history");
      });
    } else if (tab.url) {
      addHistory(
        tab.url,
        new URL(tab.url).host,
        tabId,
        windowId,
        tab.sessionId
      ).then((res) => {
        if (res) console.log("Added to history");
        else console.log("Error adding to history");
      });
    }
  });
});

// // chrome.tabs.onHighlighted.addListener(({ tabIds, windowId }) => {
// //   console.log('tab(s) highlighted');
// //   console.log('tab ids', tabIds);
// //   console.log('window id', windowId);
// // })

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.pendingUrl) {
    addHistory(
      tab.pendingUrl,
      new URL(tab.pendingUrl).host,
      tab.id,
      tab.windowId,
      tab.sessionid
    ).then((res) => {
      if (res) console.log("Added to history");
      else console.log("Error adding to history");
    });
  } else if (tab.url) {
    addHistory(
      tab.url,
      new URL(tab.url).host,
      tab.id,
      tab.windowId,
      tab.sessionId
    ).then((res) => {
      if (res) console.log("Added to history");
      else console.log("Error adding to history");
    });
  }
});

// chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
//   console.log("removing tab");
//   console.log("tabId", tabId);
//   console.log("removed tab info", removeInfo);
// });

// chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
//   console.log("tab replaced");
//   console.log("added tab id", addedTabId);
//   console.log("removed tab id", removedTabId);
// });

chrome.tabs.onUpdated.addListener((tabId, changedInfo, tab) => {
  console.log("update update update");
  console.log("tab id", tabId);
  console.log("change info", changedInfo);
  console.log("updated tab", tab);
  if ("url" in changedInfo) {
    // update history
    // use tabId
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

function getList(date = null) {
  let useDate = new Date();
  if (date) {
    useDate = new Date(date);
  }
  if (db) {
    const getHistoryTransaction = db.transaction("history", "readonly");
    const historyStore = getHistoryTransaction.objectStore("history");
    return new Promise((resolve, reject) => {
      getHistoryTransaction.oncomplete = function () {};
      getHistoryTransaction.onerror = function (err) {
        console.log("History get transaction errored: ", err.stack || err);
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
          const getQuotaTransaction = db.transaction("quota", "readonly");
          const quotaStore = getQuotaTransaction.objectStore("quota");
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

function addHistory(
  url,
  domain,
  tabId = null,
  windowId = null,
  sessionId = null
) {
  if (db) {
    const calcNow = new Date();
    const now = calcNow.setMilliseconds(0);
    const addTransaction = db.transaction("history", "readwrite");
    const historyStore = addTransaction.objectStore("history");
    return new Promise((resolve, reject) => {
      addTransaction.oncomplete = function () {
        resolve(true);
      };
      addTransaction.onerror = function (err) {
        console.log("History adding transaction errored: ", err.stack || err);
        resolve(false);
      };
      let request = historyStore.add({
        url,
        domain,
        tabId,
        windowId,
        sessionId,
        starttime: now,
        timespent: 0,
        date: calcNow.toDateString(),
      });
      request.onsuccess = function () {};
    });
  }
}

function updateHistory(url, tabId, windowId) {
  if (db) {
    const today = new Date().toDateString();
    const getTransaction = db.transaction("history", "readwrite");
    const getHistoryStore = getTransaction.objectStore("history");
    getTransaction.oncomplete = function () {};
    getTransaction.onerror = function (err) {
      console.log("History get transaction errored: ", err.stack || err);
    };
    let request = getHistoryStore.getAll();
    request.onsuccess = function (event) {
      const result = event.target.result;
      result
        .filter((r) => r.date === today)
        .filter((r) => r.url === url)
        .filter((r) => r.windowId === windowId)
        .filter((r) => r.tabId === tabId)
        .sort();
      console.log(result);
    };
  }
}
