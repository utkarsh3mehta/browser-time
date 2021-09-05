// variable initialation
let db = null;
const dbversion = 4,
  quotaTableName = "quotav4",
  historyTableName = "historyv6",
  metaDataTableName = "metaDatav2";
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
      historyStore.createIndex("windowId, date", ["windowId", "date"], {
        unique: false,
      });
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
                    count: 1,
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
  // console.log("tab activated");
  chrome.tabs.get(tabId, (tab) => {
    if (ignoreURL(tab.url)) {
      getMetaDataByType("currentTab")
        .then((currentTab) => {
          updateHistoryEndtime(
            currentTab.tabId,
            currentTab.windowId,
            currentTab.url
          )
            .then((isUpdated) => {})
            .catch((err) => {
              // console.error("error updating end time for previous tab");
            });
          updateHistoryStarttime(tabId, windowId, tab.url)
            .then((isUpdated) => {})
            .catch((err) => {
              // console.error("error updating start time of new tab");
            });
          updateCurrentTab(tabId, windowId, tab.sessionId, tab.url)
            .then(() => {})
            .catch((err) => {
              // console.error("error updating current tab info");
            });
        })
        .catch((err) => {
          if (err instanceof Error) {
            addCurrentTab(tabId, windowId, tab.sessionId, tab.url)
              .then(() => {
                getHistoryDateValue(windowId, new Date().toDateString())
                  .then((list) => {
                    list
                      .filter((h) => h.date === new Date().toDateString())
                      .filter((h) => h.tabId !== tabId)
                      .forEach((h) =>
                        updateHistoryEndtime(h.tabId, h.windowId, h.url)
                      );
                  })
                  .catch((err) => {
                    addToHistory(
                      null,
                      tabId,
                      windowId,
                      tab.url,
                      null,
                      Date.now()
                    )
                      .then(() => {})
                      .catch((err) => {
                        // console.error("error adding to history ");
                      });
                  });
              })
              .catch((err) => {
                // error adding current tab
                // console.error("error adding current tab");
              });
          }
        });
    } else {
      // switched to an ignoring protocol. Stop timer on prev tab
      getMetaDataByType("currentTab")
        .then((currentTab) => {
          updateHistoryEndtime(
            currentTab.tabId,
            currentTab.windowId,
            currentTab.url
          )
            .then(() => {})
            .catch((err) => {
              // console.error("error updating end time for previous tab");
            });
          updateCurrentTab(tabId, windowId, tab.sessionId, tab.url)
            .then(() => {})
            .catch((err) => {
              // console.error("error updating current tab info");
            });
        })
        .catch((err) => {
          addCurrentTab(tabId, windowId, tab.sessionId, tab.url)
            .then(() => {
              getHistoryDateValue(windowId, new Date().toDateString())
                .then((list) => {
                  list
                    .filter((h) => h.date === new Date().toDateString())
                    .filter((h) => h.tabId !== tabId)
                    .forEach((h) =>
                      updateHistoryEndtime(h.tabId, h.windowId, h.url)
                    );
                })
                .catch((err) => {
                  addToHistory(null, tabId, windowId, tab.url, null, Date.now())
                    .then(() => {})
                    .catch((err) => {
                      // console.error("Error adding to history ");
                    });
                });
            })
            .catch((err) => {
              // error adding current tab
            });
        });
    }
  });
});

chrome.tabs.onCreated.addListener((tab) => {
  // console.log("tab created");
  if (tab.pendingUrl && ignoreURL(tab.pendingUrl)) {
    addToHistory(tab.sessionId, tab.id, tab.windowId, tab.pendingUrl)
      .then(() => {})
      .catch((err) => {
        // console.error(err);
      });
  } else if (tab.url && ignoreURL(tab.url)) {
    addToHistory(tab.sessionId, tab.id, tab.windowId, tab.url)
      .then(() => {})
      .catch((err) => {
        // console.error(err);
      });
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  chrome.tabs.get(tabId, (tab) => {
    if (ignoreURL(tab.url)) {
      updateHistoryEndtime(tabId, removeInfo.windowId, tab.url)
        .then(() => {})
        .catch((err) => {
          // console.error("Error updating end time on tab removal");
        });
    }
  });
});

// chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
//   console.log("tab replaced");
//   console.log("added tab id", addedTabId);
//   console.log("removed tab id", removedTabId);
// });

// chrome.tabs.onUpdated.addListener((tabId, changedInfo, tab) => {
//   console.log("tab updated", tabId, changedInfo, tab);
//   if ("url" in changedInfo && ignoreURL(changedInfo.url)) {
//     getHistoryTabDateKey(tabId, tab.windowId, new Date().toDateString())
//       .then((list) => {
//         // console.log(list);
//         let historyItem = list.reduce((prev, next) =>
//           next.lastUpdatedAt > prev.lastUpdatedAt ? next : prev
//         );
//         console.log(
//           "history item reduced based on last updated at",
//           historyItem
//         );
//         updateHistoryEndtime(
//           historyItem.tabId,
//           historyItem.windowId,
//           historyItem.url
//         )
//           .then(() => {})
//           .catch((err) =>
//             console.error(
//               "Error updating history item for tab update: ",
//               err.stack || err
//             )
//           );
//         addToHistory(
//           tab.sessionId,
//           tab.id,
//           tab.windowId,
//           tab.url,
//           Date.now(),
//           null
//         )
//           .then(() => {})
//           .catch((err) => {
//             console.error(
//               "Error adding history item for tab update: ",
//               err.stack || err
//             );
//           });
//       })
//       .catch((err) => {
//         console.error(
//           "Error fetching list of history items based on tabId, windowId and date: ",
//           err
//         );
//       });
//   }
// });

function ignoreURL(url) {
  let protocol = new URL(url).protocol;
  if (protocol === "chrome:") return false;
  return true;
}

function addQuota(url, domain, quota) {
  if (db) {
    const addTransaction = db.transaction(quotaTableName, "readwrite");
    const quotaStore = addTransaction.objectStore(quotaTableName);
    return new Promise((resolve, reject) => {
      addTransaction.oncomplete = function () {
        resolve(true);
      };
      addTransaction.onerror = function (err) {
        // console.error("Quota adding transaction errored: ", err.stack || err);
        resolve(false);
      };
      quotaStore.add({ url, domain, quota: quota * 1000 });
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
        // console.error("History get transaction errored: ", err.stack || err);
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
    });
  }
}

function getHistoryUrlKey(tabId, windowId, url) {
  // console.log("get history url key", tabId, windowId, url);
  if (db) {
    const getHistoryTransaction = db.transaction(
      [historyTableName],
      "readonly"
    );
    const historyStore = getHistoryTransaction.objectStore(historyTableName);
    return new Promise((resolve, reject) => {
      getHistoryTransaction.oncomplete = function () {};
      getHistoryTransaction.onerror = function (err) {
        // console.error("Error getting history key by url: ", err.stack || err);
        reject(err);
      };
      let request = historyStore
        .index("tabId, windowId, url")
        .getKey(IDBKeyRange.only([tabId, windowId, url]));
      request.onsuccess = function (ev) {
        let data = ev.target.result;
        if (data) {
          resolve(data);
        } else {
          reject(new Error("No key found"));
        }
      };
    });
  }
}

function getHistoryUrlValue(tabId, windowId, url) {
  // console.log("get history url values", tabId, windowId, url);
  if (db) {
    return getHistoryUrlKey(tabId, windowId, url).then((key) => {
      const getHistoryTransaction = db.transaction(
        [historyTableName],
        "readonly"
      );
      const historyStore = getHistoryTransaction.objectStore(historyTableName);
      return new Promise((resolve, reject) => {
        getHistoryTransaction.oncomplete = function () {};
        getHistoryTransaction.onerror = function (err) {
          // console.error(
          //   `Error getting history item for tab ${tabId} on window ${windowId} and url ${url}: `,
          //   err.stack || err
          // );
          reject(err);
        };
        let request = historyStore.get(key);
        request.onsuccess = function (ev) {
          let data = ev.target.result;
          if (data) resolve(data);
          else reject(new Error(`No history value found for key ${key}.`));
        };
      });
    });
  }
}

function getHistoryDateValue(windowId, date) {
  // console.log("get history date values", windowId, date);
  if (db) {
    const getHistoryTransaction = db.transaction(
      [historyTableName],
      "readonly"
    );
    const historyStore = getHistoryTransaction.objectStore(historyTableName);
    return new Promise((resolve, reject) => {
      getHistoryTransaction.oncomplete = function () {};
      getHistoryTransaction.onerror = function (err) {
        // console.error("Error getting history transaction: ", err.stack || err);
        reject(err);
      };
      let request = historyStore
        .index("windowId, date")
        .getAll(IDBKeyRange.only([windowId, date]));
      request.onsuccess = function (ev) {
        let data = ev.target.result;
        if (data) {
          if (data.length > 0) resolve(data);
          else resolve([]);
        } else
          reject(
            new Error(`No history item(s) present for ${windowId} on ${date}`)
          );
      };
    });
  }
}

function getHistoryTabDateKey(tabId, windowId, date) {
  // console.log("get history tab date values", tabId, windowId, date);
  if (db) {
    const getHistoryTransaction = db.transaction(
      [historyTableName],
      "readonly"
    );
    const historyStore = getHistoryTransaction.objectStore(historyTableName);
    return new Promise((resolve, reject) => {
      getHistoryTransaction.oncomplete = function () {};
      getHistoryTransaction.onerror = function (err) {
        // console.error("Error getting history transaction: ", err.stack || err);
        reject(err);
      };
      let request = historyStore
        .index("tabId, windowId, date")
        .getAll(IDBKeyRange.only([tabId, windowId, date]));
      request.onsuccess = function (ev) {
        let data = ev.target.result;
        if (data) resolve(data);
        else reject(new Error("No data found"));
      };
    });
  }
}

function getHistoryDataByKey(key) {
  // console.log("get history data by key", key);
  if (db) {
    const getHistoryTransaction = db.transaction(
      [historyTableName],
      "readonly"
    );
    const historyStore = getHistoryTransaction.objectStore(historyTableName);
    return new Promise((resolve, reject) => {
      getHistoryTransaction.oncomplete = function () {};
      getHistoryTransaction.onerror = function (err) {
        // console.error("Error getting history item by key: ", err.stack || err);
        reject(err);
      };
      let request = historyStore.get(key);
      request.onsuccess = function (ev) {
        let data = ev.target.result;
        if (data) resolve(data);
        else reject(new Error("No history item at key ", key));
      };
    });
  }
}

function getMetaData() {
  // console.log("get all meta data");
  if (db) {
    const getMetaDataTransaction = db.transaction(
      [metaDataTableName],
      "readonly"
    );
    const metaDataStore = getMetaDataTransaction.objectStore(metaDataTableName);
    return new Promise((resolve, reject) => {
      getMetaDataTransaction.oncomplete = function () {};
      getMetaDataTransaction.onerror = function (err) {
        // console.error("Error getting all meta data: ", err.stack || err);
        reject(err);
      };
      let request = metaDataStore.getAll();
      request.onsuccess = function (ev) {
        let data = ev.target.result;
        if (data) resolve(data);
        else reject(new Error("No data in meta data"));
      };
    });
  }
}

function getMetaDataByType(type) {
  // console.log("get meta data by type", type);
  if (db) {
    const getMetaDataTransaction = db.transaction(
      [metaDataTableName],
      "readonly"
    );
    const metaDataStore = getMetaDataTransaction.objectStore(metaDataTableName);
    return new Promise((resolve, reject) => {
      getMetaDataTransaction.oncomplete = function () {};
      getMetaDataTransaction.onerror = function (err) {
        // console.error(
        //   `Error getting meta data based on type ${type}:`,
        //   err.stack || err
        // );
        reject(err);
      };
      let request = metaDataStore.index("type").get(type);
      request.onsuccess = function (ev) {
        let data = ev.target.result;
        if (data) resolve(ev.target.result);
        else reject(new Error(`No value found in meta data for ${type}`));
      };
    });
  }
}

function addToHistory(
  sessionId,
  tabId,
  windowId,
  url,
  starttime = null,
  endtime = null
) {
  // console.log(
  //   "adding to history",
  //   sessionId,
  //   tabId,
  //   windowId,
  //   url,
  //   starttime,
  //   endtime
  // );
  if (ignoreURL(url)) {
    if (db) {
      const addHistoryTransaction = db.transaction(
        [historyTableName],
        "readwrite"
      );
      const historyStore = addHistoryTransaction.objectStore(historyTableName);
      return new Promise((resolve, reject) => {
        addHistoryTransaction.oncomplete = function () {
          resolve(true);
        };
        addHistoryTransaction.onerror = function (err) {
          // console.error("Error adding to history store: ", err.stack || err);
          reject(err);
        };
        let now = new Date().toISOString();
        if (starttime || endtime) {
          if (starttime) {
            historyStore.add({
              tabId,
              windowId,
              url,
              domain: new URL(url).host,
              sessionId: sessionId,
              createdAt: now,
              lastUpdatedAt: now,
              starttime,
              count: 1,
              date: new Date().toDateString(),
            });
          } else if (endtime) {
            starttime = endtime - oneSecond;
            historyStore.add({
              tabId,
              windowId,
              url,
              domain: new URL(url).host,
              sessionId: sessionId,
              createdAt: now,
              lastUpdatedAt: now,
              starttime,
              count: 1,
              date: new Date().toDateString(),
              endtime,
              timespent: oneSecond,
            });
          }
        } else {
          historyStore.add({
            tabId,
            windowId,
            url,
            domain: new URL(url).host,
            sessionId: sessionId,
            createdAt: now,
            lastUpdatedAt: now,
          });
        }
      });
    }
  }
}

function addCurrentTab(tabId, windowId, sessionId, url) {
  // console.log("adding current tab", tabId, windowId, sessionId, url);
  if (db) {
    const addCurrentTabTransaction = db.transaction(
      [metaDataTableName],
      "readwrite"
    );
    const metaDataStore =
      addCurrentTabTransaction.objectStore(metaDataTableName);
    return new Promise((resolve, reject) => {
      addCurrentTabTransaction.oncomplete = function () {
        resolve(true);
      };
      addCurrentTabTransaction.onerror = function (err) {
        // console.error("Error adding current tab meta data: ", err.stack || err);
        reject(err);
      };
      metaDataStore.add(
        {
          type: "currentTab",
          tabId,
          windowId,
          sessionId,
          url,
        },
        "currentTab"
      );
    });
  }
}

function updateCurrentTab(tabId, windowId, sessionId, url) {
  // console.log("updating current tab", tabId, windowId, sessionId, url);
  if (db) {
    return getMetaDataByType("currentTab")
      .then((currentTab) => {
        const putCurrentTabTransaction = db.transaction(
          [metaDataTableName],
          "readwrite"
        );
        const currentTabStore =
          putCurrentTabTransaction.objectStore(metaDataTableName);
        return new Promise((resolve, reject) => {
          putCurrentTabTransaction.oncomplete = function () {
            resolve(true);
          };
          putCurrentTabTransaction.onerror = function (err) {
            // console.error(
            //   "Error updating meta data transaction: ",
            //   err.stack || err
            // );
            reject(err);
          };
          (currentTab.tabId = tabId), (currentTab.windowId = windowId);
          currentTab.sessionId = sessionId;
          currentTab.url = url;
          currentTabStore.put(currentTab, "currentTab");
        });
      })
      .catch((err) => {
        return addCurrentTab(tabId, windowId, sessionId, url)
          .then(() => Promise.resolve(true))
          .catch((err) => Promise.reject(err));
      });
  }
}

function updateHistoryStarttime(tabId, windowId, url) {
  // console.log("updating history start time", tabId, windowId, url);
  if (db) {
    return getHistoryUrlKey(tabId, windowId, url)
      .then((key) => {
        return getHistoryDataByKey(key)
          .then((data) => {
            const putHistoryTransaction = db.transaction(
              [historyTableName],
              "readwrite"
            );
            const historyStore =
              putHistoryTransaction.objectStore(historyTableName);
            return new Promise((resolve, reject) => {
              putHistoryTransaction.oncomplete = function () {
                resolve(true);
              };
              putHistoryTransaction.onerror = function (err) {
                // console.error(
                //   "Error updating history item transaction: ",
                //   err.stack || err
                // );
                reject(err);
              };
              let now = new Date();
              if (!("date" in data)) {
                data["date"] = now.toDateString();
              }
              if (!("count" in data)) {
                data["count"] = 1;
              } else {
                data["count"] += 1;
              }
              data["starttime"] = Date.now();
              data["lastUpdatedAt"] = now.toISOString();
              historyStore.put(data, key);
            });
          })
          .catch((err) => {
            // error getting data from history using key
            // console.error("Error getting data from history using key");
            return Promise.reject(
              new Error("Error getting data from history using key")
            );
          });
      })
      .catch((err) => {
        // error getting key from history using tabId, windowId and URL
        // console.error(
        //   "Error getting key from history using tabId, windowId and URL: ",
        //   err.stack || err
        // );
        return addToHistory(null, tabId, windowId, url, Date.now(), null)
          .then(() => Promise.resolve(true))
          .catch((err) =>
            Promise.reject(
              new Error("Error adding history item with decided start time")
            )
          );
      });
  }
}

function updateHistoryEndtime(tabId, windowId, url) {
  // console.log("updating history end time", tabId, windowId, url);
  if (db) {
    return getHistoryUrlKey(tabId, windowId, url)
      .then((key) => {
        return getHistoryDataByKey(key)
          .then((data) => {
            const putHistoryTransaction = db.transaction(
              [historyTableName],
              "readwrite"
            );
            const historyStore =
              putHistoryTransaction.objectStore(historyTableName);
            return new Promise((resolve, reject) => {
              putHistoryTransaction.oncomplete = function () {
                resolve(true);
              };
              putHistoryTransaction.onerror = function (err) {
                // console.error(
                //   `Error updating history item transaction: `,
                //   err.stack || err
                // );
                reject(err);
              };
              data["endtime"] = Date.now();
              if (!("timespent" in data)) {
                data["timespent"] = 0 + data["endtime"] - data["starttime"];
              } else if ("timestamp" in data && data["timestamp"] === NaN) {
                data["timespent"] = 0 + data["endtime"] - data["starttime"];
              } else {
                data["timespent"] =
                  data["timespent"] + data["endtime"] - data["starttime"];
              }
              data["lastUpdatedAt"] = new Date().toISOString();
              historyStore.put(data, key);
            });
          })
          .catch((err) => {
            // error getting data from history using key;
            // console.error("error getting data from history using key");
            return Promise.reject(
              new Error("Error getting data from history using key")
            );
          });
      })
      .catch((err) => {
        // error getting key from history using tabId, windowId, url
        // console.error(
        //   "error getting key from history using tabId, windowId, url"
        // );
        return addToHistory(null, tabId, windowId, url, null, Date.now())
          .then(() => Promise.resolve(true))
          .catch((err) =>
            Promise.reject(
              new Error("Error adding new history item with decided end time")
            )
          );
      });
  }
}
