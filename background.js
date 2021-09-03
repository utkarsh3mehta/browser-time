let db = null;
chrome.runtime.onInstalled.addListener(() => {
  if (!window.indexedDB) {
    console.error(
      "Indexed DB is not a part of your browser. Will not be able to use this extension"
    );
  } else {
    const request = window.indexedDB.open("browserTime_db", 1);
    request.onerror = function (ev) {
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
      // wait 2 seconds;
      setTimeout(() => {
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
      }, 2000);
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

function addQuota(url, domain, quota) {
  if (db) {
    const addTransaction = db.transaction("quota", "readwrite");
    const quotaStore = addTransaction.objectStore("quota");

    return new Promise((resolve, reject) => {
      addTransaction.oncomplete = function () {
        resolve(true);
      };

      addTransaction.onerror = function (err) {
        console.log("Quota adding transaction errored: ", err.stack || err);
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
