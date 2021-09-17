// variable initialation
let db = null;
const dbversion = 10,
  quotaTableName = "quotav" + dbversion,
  historyTableName = "historyv" + dbversion,
  metaDataTableName = "metaDatav" + dbversion,
  faviconTableName = "faviconv" + dbversion;
// history v7: added index tabId, windowId, url and date
// v10: no history at begining

const oneSecond = 1000;
const oneMinute = oneSecond * 60;
const oneHour = oneMinute * 60;
const oneDay = oneHour * 24;

const defaultTimespent = oneMinute;
const maxHistoryResult = 1;
const onboardingLoadTime = 1000;

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
      historyStore.createIndex(
        "tabId, windowId, url, date",
        ["tabId", "windowId", "url", "date"],
        { unique: false }
      );
      let meta = db.createObjectStore(metaDataTableName, {
        keypath: "type",
      });
      meta.createIndex("type", "type", { unique: false });
      let favicon = db.createObjectStore(faviconTableName, {
        keypath: "domain",
      });
      favicon.createIndex("domain", "domain", { unique: true });
      // wait 1 seconds;
      setTimeout(() => {
        // fetching history items from previous start days and maxHistoryResult records
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
                    endtime: vI.visitTime + defaultTimespent,
                    date: new Date(vI.visitTime).toDateString(),
                    timespent: defaultTimespent,
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
    addQuota(
      request.payload.url,
      request.payload.domain,
      request.payload.quota
    ).then((res) => {
      chrome.runtime.sendMessage({
        message: "add_response",
        payload: res,
      });
    });
  } else if (request.message === "get_all") {
    if (request.payload) {
      console.log("request payload", request.payload);
      console.log("get list", getList);
      getList(request.payload.date).then((res) => {
        chrome.runtime.sendMessage({
          message: "get_all_response",
          payload: res,
        });
      });
    } else {
      console.log("get list", getList);
      getList().then((res) => {
        chrome.runtime.sendMessage({
          message: "get_all_response",
          payload: res,
        });
      });
    }
  } else if (request.message === "get_favIcon") {
    getFavicon(request.payload.domain).then((data) => {
        chrome.runtime.sendMessage({
          message: "get_favIcon_response",
          payload: data,
        });
      })
      .catch((err) => {
        chrome.runtime.sendMessage({
          message: "get_favIcon_response",
          payload: false,
        });
      });
  }
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  console.log("tab activated");
  chrome.tabs.get(tabId, (tab) => {
    if (ignoreURL(tab.url)) {
      getMetaDataByType("currentTab")
        .then((currentTab) => {
          console.log("tab activated: get current tab:", currentTab);
          updateHistoryEndtime(
            currentTab.tabId,
            currentTab.windowId,
            currentTab.url,
            new Date().toDateString()
          )
            .then(() => {
              console.log(
                "tab activated: get current tab: updated history end time for ",
                currentTab.tabId,
                currentTab.windowId,
                currentTab.url
              );
            })
            .catch((err) => {
              console.error(
                "tab activated: get current tab: error updating end time for previous tab"
              );
            });
          updateHistoryStarttime(
            tabId,
            windowId,
            tab.url,
            new Date().toDateString()
          )
            .then(() => {
              console.log(
                "tab activated: get current tab: updated history start time for ",
                tabId,
                windowId,
                tab.url
              );
            })
            .catch((err) => {
              console.error(
                "tab activated: get current tab: error updating start time of new tab"
              );
            });
          updateCurrentTab(tabId, windowId, tab.sessionId, tab.url)
            .then(() => {
              console.log(
                "tab activated: get current tab: update current tab",
                tabId,
                windowId,
                tab.sessionId,
                tab.url
              );
            })
            .catch((err) => {
              console.error(
                "tab activated: get current tab: error updating current tab info"
              );
            });
        })
        .catch((err) => {
          if (err instanceof Error) {
            console.log(
              "tab activated: current tab info not found. creating one"
            );
            addCurrentTab(tabId, windowId, tab.sessionId, tab.url)
              .then(() => {
                console.log(
                  "tab activated: current tab info added. Ending all other tab info"
                );
                getHistoryDateValue(windowId, new Date().toDateString())
                  .then((list) => {
                    if (list) {
                      console.log(
                        "list of other tabs of same window and date found"
                      );
                      list
                        .filter((h) => h.date === new Date().toDateString())
                        .filter((h) => h.tabId !== tabId)
                        .forEach((h) =>
                          updateHistoryEndtime(
                            h.tabId,
                            h.windowId,
                            h.url,
                            h.date
                          )
                        );
                    } else {
                      console.log(
                        "tab activated: new current tab info added: no list of other tabs of same window and date found. Creating one history item for current tab"
                      );
                      addToHistory(
                        null,
                        tabId,
                        windowId,
                        tab.url,
                        Date.now(),
                        null
                      )
                        .then(() => {
                          console.log(
                            "tab activated: new current tab info added: added to history"
                          );
                        })
                        .catch((err) => {
                          console.error(
                            "tab activated: new current tab info added: error adding to history "
                          );
                        });
                    }
                  })
                  .catch((err) => {
                    console.error(
                      "tab activate: new current tab info added: error getting list of tabs with same windowId and date"
                    );
                  });
              })
              .catch((err) => {
                // error adding current tab
                console.error("tab activated: error adding current tab");
              });
          }
        });
    } else {
      // switched to an ignoring protocol. Stop timer on prev tab
      console.log("tab activated: switching to a chrome: extension page");
      getMetaDataByType("currentTab")
        .then((currentTab) => {
          console.log("tab activated: get current tab:", currentTab);
          updateHistoryEndtime(
            currentTab.tabId,
            currentTab.windowId,
            currentTab.url,
            new Date().toDateString()
          )
            .then(() => {
              console.log(
                "tab activated: get current tab: update history end time"
              );
            })
            .catch((err) => {
              console.error(
                "tab activated: get current tab: error updating end time for previous tab"
              );
            });
          updateCurrentTab(tabId, windowId, tab.sessionId, tab.url)
            .then(() => {
              console.log(
                "tab activated: get current tab: updated current tab"
              );
            })
            .catch((err) => {
              console.error(
                "tab activated: get current tab: error updating current tab info"
              );
            });
        })
        .catch((err) => {
          addCurrentTab(tabId, windowId, tab.sessionId, tab.url)
            .then(() => {
              console.log(
                "tab activated: current tab info added. Ending all other tab info"
              );
              getHistoryDateValue(windowId, new Date().toDateString())
                .then((list) => {
                  if (list) {
                    console.log(
                      "list of other tabs of same window and date found"
                    );
                    list
                      .filter((h) => h.date === new Date().toDateString())
                      .filter((h) => h.tabId !== tabId)
                      .forEach((h) =>
                        updateHistoryEndtime(h.tabId, h.windowId, h.url, h.date)
                      );
                  } else {
                    console.log(
                      "tab activated: new current tab info added: no list of other tabs of same window and date found. Creating one history item for current tab"
                    );
                    addToHistory(
                      null,
                      tabId,
                      windowId,
                      tab.url,
                      Date.now(),
                      null
                    )
                      .then(() => {
                        console.log(
                          "tab activated: new current tab info added: added to history"
                        );
                      })
                      .catch((err) => {
                        console.error(
                          "tab activated: new current tab info added: error adding to history "
                        );
                      });
                  }
                })
                .catch((err) => {
                  console.error(
                    "tab activate: new current tab info added: error getting list of tabs with same windowId and date"
                  );
                });
            })
            .catch((err) => {
              // error adding current tab
              console.error("tab activated: error adding current tab");
            });
        });
    }
  });
});

chrome.tabs.onCreated.addListener((tab) => {
  console.log("tab created");
  if (tab.pendingUrl && ignoreURL(tab.pendingUrl)) {
    addToHistory(
      tab.sessionId,
      tab.id,
      tab.windowId,
      tab.pendingUrl,
      null,
      null
    )
      .then(() => {
        console.log("tab created: added to history");
      })
      .catch((err) => {
        console.error("tab created: error adding to history");
      });
  } else if (tab.url && ignoreURL(tab.url)) {
    addToHistory(tab.sessionId, tab.id, tab.windowId, tab.url, null, null)
      .then(() => {
        console.log("tab created: added to history");
      })
      .catch((err) => {
        console.error(err);
        console.error("tab created: error adding to history");
      });
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log("tab removed");
  getHistoryTabDateKey(tabId, removeInfo.windowId, new Date().toDateString())
    .then((list) => {
      if (list && list.length > 0) {
        console.log("tab removed: list from getHistoryTabDateKey", list);
        list.forEach((h) => {
          updateHistoryEndtime(h.tabId, h.windowId, h.url, h.date)
            .then(() => {
              console.log(
                "tab removed: get history tab date key list: updated end time"
              );
            })
            .catch((err) => {
              console.log(
                "tab remove: get history tab date key list: error updating end time"
              );
            });
        });
      } else {
        console.log(
          "tab removed: list from getHistoryTabDateKey: no list found."
        );
      }
    })
    .catch((err) => {
      console.log(
        "tab removed: error from getHistoryTabDateKey: no list found."
      );
    });
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  console.log("tab replaced");
  console.log("added tab id", addedTabId);
  console.log("removed tab id", removedTabId);
});

chrome.tabs.onUpdated.addListener((tabId, changedInfo, tab) => {
  console.log("tab updated", tabId, changedInfo);
  if ("favIconUrl" in changedInfo) {
    let domain = new URL(tab.url).host;
    getFavicon(domain)
      .then((data) => {
        if (data.favIconUrl !== changedInfo.favIconUrl) {
          updateFavicon(domain, changedInfo.favIconUrl)
            .then(() => {})
            .catch(() => {});
        }
      })
      .catch((err) => {
        createFavicon(domain, changedInfo.favIconUrl)
          .then(() => {})
          .catch((err) => {});
      });
  }
  if (
    "url" in changedInfo ||
    ("status" in changedInfo && changedInfo.status === "loading")
  ) {
    console.log("tab updated: url changed");
    getMetaDataByType("currentTab")
      .then((currentTab) => {
        console.log("tab updated: get current tab: ", currentTab);
        updateHistoryEndtime(
          currentTab.tabId,
          currentTab.windowId,
          currentTab.url,
          new Date().toDateString()
        )
          .then(() => {
            console.log("tab updated: updated end time for previous tab");
            updateCurrentTab(tabId, tab.windowId, tab.sessionId, tab.url)
              .then(() => {
                console.log("tab updated: updated current tab info");
                if (ignoreURL(tab.url)) {
                  getHistoryTabUrlDateKey(
                    tabId,
                    tab.windowId,
                    tab.url,
                    new Date().toDateString()
                  )
                    .then((key) => {
                      console.log(
                        "tab updated: row with similar details found at ",
                        key
                      );
                      updateHistoryStarttime(
                        tabId,
                        tab.windowId,
                        tab.url,
                        new Date().toDateString()
                      )
                        .then(() => {
                          console.log(
                            "tab updated: update tab start time for a historic tab"
                          );
                        })
                        .catch((err) => {
                          console.log(
                            "tab updated: error updating start time for a history tab"
                          );
                        });
                    })
                    .catch((err) => {
                      console.log(
                        "tab updated: no data found for tab. Creating new row"
                      );
                      addToHistory(
                        tab.sessionId,
                        tab.id,
                        tab.windowId,
                        tab.url,
                        Date.now(),
                        null
                      )
                        .then(() => {
                          console.log(
                            "tab updated: added to history cause browsed to new url"
                          );
                        })
                        .catch((err) => {
                          console.log("tab updated: error adding to history");
                        });
                    });
                }
              })
              .catch((err) => {
                console.log("tab updated: error updating current tab info");
              });
          })
          .catch((err) => {
            console.log("tab updated: error update end timie for previous tab");
          });
      })
      .catch((err) => {
        console.log("tab updated: Current tab info not found.");
        addCurrentTab(tabId, tab.windowId, tab.sessionId, tab.url)
          .then(() => {
            console.log("tab updated: Current tab info added");
          })
          .catch((err) => {
            console.log("tab updated: Error adding current tab info");
          });
      });
  }
});

function ignoreURL(url) {
  try {
    let protocol = new URL(url).protocol;
    if (protocol === "chrome:") return false;
    return true;
  } catch {
    return false;
  }
}

function addQuota(url, domain, quota) {
  console.log("adding quota", url, domain, quota);
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
      quotaStore.add({ url, domain, quota: quota * oneMinute });
    });
  }
}

function getList(date = null) {
  console.log("getting list for date", date);
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
        // chrome.topSites.get((mostVisitedUrls) => {
        //   mostVisitedUrls.forEach((mvu) => {
        //     let todayTopResults = result
        //       .filter((r) => r.date === useDate.toDateString())
        //       .filter((r) => r.domain === new URL(mvu.url).host);
        //     if (todayTopResults.length !== 0) {
        //       let domain = new URL(mvu.url).host;
        //       let count = todayTopResults
        //         .map((r) => ("count" in r && !!r.count ? r.count : 0))
        //         .reduce((acc, next) => acc + next, 0);
        //       let timespent = todayTopResults
        //         .map((r) =>
        //           "timespent" in r && !!r.timespent ? r.timespent : 0
        //         )
        //         .reduce((acc, next) => acc + next, 0);
        //       historyList.push({
        //         url: mvu.url,
        //         domain,
        //         count,
        //         timespent,
        //         quota: null,
        //       });
        //     }
        //   });
        // console.log("history list after most visited url", historyList);
        const getQuotaTransaction = db.transaction(quotaTableName, "readonly");
        const quotaStore = getQuotaTransaction.objectStore(quotaTableName);
        let quotaRequest = quotaStore.getAll();
        quotaRequest.onsuccess = function (event) {
          let quotaResult = event.target.result;
          let otherHistoryList = [];
          let otherHistoryItems = result
            .filter((hI) => hI.date === useDate.toDateString())
            .filter(
              (hI) => !historyList.map((h) => h.domain).includes(hI.domain)
            );
          otherHistoryItems.forEach((hI) => {
            if (!otherHistoryList.map((l) => l.domain).includes(hI.domain)) {
              let domain = hI.domain;
              let count = otherHistoryItems
                .filter((hIThis) => hIThis.domain === domain)
                .map((hIThis) =>
                  "count" in hIThis && hIThis.count ? hIThis.count : 0
                )
                .reduce((acc, next) => acc + next, 0);
              let timespent = otherHistoryItems
                .filter((hIThis) => hIThis.domain === domain)
                .map((hIThis) =>
                  "timespent" in hIThis && hIThis.timespent
                    ? hIThis.timespent
                    : 0
                )
                .reduce((acc, next) => acc + next, 0);
              otherHistoryList.push({
                url: hI.url,
                domain,
                count,
                timespent,
                quota: null,
              });
            }
          });
          historyList = [...historyList, ...otherHistoryList];
          historyList.sort((a, b) => b.timespent - a.timespent);
          if (historyList.length !== 0) {
            historyList.forEach((hl) => {
              let historyQuota = quotaResult.find(
                (r) => r.domain === hl.domain
              );
              if (historyQuota) hl.quota = historyQuota.quota;
            });
          }
          let quotaList = [];
          console.log("quotaList", quotaList);
          console.log("quota result", quotaRequest);
          quotaResult
            .filter(
              (q) => !historyList.map((hl) => hl.domain).includes(q.domain)
            )
            .filter(
              (q) =>
                !otherHistoryList.map((ohl) => ohl.domain).includes(q.domain)
            )
            .forEach((q) => {
              console.log("foreach quotaresult", quotaList);
              if (!quotaList.map((l) => l.domain).includes(q.domain)) {
                let todayQuotaResults = result
                  .filter((r) => r.date === useDate.toDateString())
                  .filter((r) => r.domain === q.domain);
                if (todayQuotaResults.length !== 0) {
                  let domain = q.domain;
                  let count = todayQuotaResults
                    .map((r) => ("count" in r ** !!r.count ? r.count : 0))
                    .reduce((acc, (next) => acc + next), 0);
                  let timespent = todayQuotaResults
                    .map((r) =>
                      "timespent" in r && !!r.timespent ? r.timespent : 0
                    )
                    .reduce((acc, next) => acc + next, 0);
                  quotaList.push({
                    url: q.url,
                    domain,
                    count,
                    timespent,
                    quota: q.quota,
                  });
                } else {
                  quotaList.push({
                    url: q.url,
                    domain: q.domain,
                    count: 0,
                    timespent: 0,
                    quota: q.quota,
                  });
                }
              }
            });
          quotaList.sort((a, b) => b.timespent - a.timespent);
          console.log("quota list after quota result foreach", quotaList);
          historyList = [...historyList, ...quotaList];
          console.log("final history list", historyList);
          resolve(historyList);
        };
        // });
      };
    });
  }
}

function getHistoryUrlKey(tabId, windowId, url) {
  console.log("get history url key", tabId, windowId, url);
  if (db) {
    const getHistoryTransaction = db.transaction(
      [historyTableName],
      "readonly"
    );
    const historyStore = getHistoryTransaction.objectStore(historyTableName);
    return new Promise((resolve, reject) => {
      getHistoryTransaction.oncomplete = function () {};
      getHistoryTransaction.onerror = function (err) {
        console.error("Error getting history key by url: ", err.stack || err);
        reject(err);
      };
      let request = historyStore
        .index("tabId, windowId, url")
        .getKey(IDBKeyRange.only([tabId, windowId, url]));
      request.onsuccess = function (ev) {
        let data = ev.target.result;
        if (data) {
          console.log("inside getHistoryUrlKey. Sending response as", data);
          resolve(data);
        } else {
          console.log("inside getHistoryUrlKey. No key found. Throwing error");
          reject(new Error("No key found"));
        }
      };
    });
  }
}

function getHistoryUrlValue(tabId, windowId, url) {
  console.log("get history url values", tabId, windowId, url);
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
          console.error(
            `Error getting history item for tab ${tabId} on window ${windowId} and url ${url}: `,
            err.stack || err
          );
          reject(err);
        };
        let request = historyStore.get(key);
        request.onsuccess = function (ev) {
          let data = ev.target.result;
          if (data) {
            console.log("inside getHistoryUrlValue. Sending response", data);
            resolve(data);
          } else {
            console.log(
              "inside getHistoryUrlValue. No data found. Throwing error"
            );
            reject(new Error(`No history value found for key ${key}.`));
          }
        };
      });
    });
  }
}

function getHistoryDateValue(windowId, date) {
  console.log("get history date values", windowId, date);
  if (db) {
    const getHistoryTransaction = db.transaction(
      [historyTableName],
      "readonly"
    );
    const historyStore = getHistoryTransaction.objectStore(historyTableName);
    return new Promise((resolve, reject) => {
      getHistoryTransaction.oncomplete = function () {};
      getHistoryTransaction.onerror = function (err) {
        console.error("Error getting history transaction: ", err.stack || err);
        reject(err);
      };
      let request = historyStore
        .index("windowId, date")
        .getAll(IDBKeyRange.only([windowId, date]));
      request.onsuccess = function (ev) {
        let data = ev.target.result;
        if (data) {
          console.log("inside getHistoryDateValue. Sending response", data);
          if (data.length > 0) resolve(data);
          else resolve([]);
        } else {
          console.log(
            "inside getHistoryDateValue. No data found. Throwing error"
          );
          reject(
            new Error(`No history item(s) present for ${windowId} on ${date}`)
          );
        }
      };
    });
  }
}

function getHistoryTabDateKey(tabId, windowId, date) {
  console.log("get history tab date values", tabId, windowId, date);
  if (db) {
    const getHistoryTransaction = db.transaction(
      [historyTableName],
      "readonly"
    );
    const historyStore = getHistoryTransaction.objectStore(historyTableName);
    return new Promise((resolve, reject) => {
      getHistoryTransaction.oncomplete = function () {};
      getHistoryTransaction.onerror = function (err) {
        console.error("Error getting history transaction: ", err.stack || err);
        reject(err);
      };
      let request = historyStore
        .index("tabId, windowId, date")
        .getAll(IDBKeyRange.only([tabId, windowId, date]));
      request.onsuccess = function (ev) {
        let data = ev.target.result;
        if (data) {
          console.log("inside getHistoryTabDateKey. Sending response", data);
          resolve(data);
        } else {
          console.log(
            "inside getHistoryTabDateKey. No data found. Throwing error"
          );
          reject(new Error("No data found"));
        }
      };
    });
  }
}

function getHistoryTabUrlDateKey(tabId, windowId, url, date) {
  console.log("get history tab url date key", tabId, windowId, url, date);
  if (db) {
    const getHistoryTransaction = db.transaction(
      [historyTableName],
      "readonly"
    );
    const historyStore = getHistoryTransaction.objectStore(historyTableName);
    return new Promise((resolve, reject) => {
      getHistoryTransaction.oncomplete = function () {};
      getHistoryTransaction.onerror = function (err) {
        console.error("Error getting history key by url: ", err.stack || err);
        reject(err);
      };
      let request = historyStore
        .index("tabId, windowId, url, date")
        .getKey(IDBKeyRange.only([tabId, windowId, url, date]));
      request.onsuccess = function (ev) {
        let data = ev.target.result;
        if (data) {
          console.log("inside getHistoryTabUrlDateKey. Sending response", data);
          resolve(data);
        } else {
          console.log(
            "inside getHistoryTabUrlDateKey. No data found. Throwing error"
          );
          reject(new Error("No key found"));
        }
      };
    });
  }
}

function getHistoryTabUrlDateValue(tabId, windowId, url, date) {
  console.log(
    "get history tab, url and date values",
    tabId,
    windowId,
    url,
    date
  );
  if (db) {
    return getHistoryTabUrlDateKey(tabId, windowId, url, date).then((key) => {
      const getHistoryTransaction = db.transaction(
        [historyTableName],
        "readonly"
      );
      const historyStore = getHistoryTransaction.objectStore(historyTableName);
      return new Promise((resolve, reject) => {
        getHistoryTransaction.oncomplete = function () {};
        getHistoryTransaction.onerror = function (err) {
          console.error(
            `Error getting history item for tab ${tabId} on window ${windowId} and url ${url}: `,
            err.stack || err
          );
          reject(err);
        };
        let request = historyStore.get(key);
        request.onsuccess = function (ev) {
          let data = ev.target.result;
          if (data) {
            console.log(
              "inside getHistoryTabUrlDateValue. Sending response",
              data
            );
            resolve(data);
          } else {
            console.log(
              "inside getHistoryTabUrlDateValue. No data found. Throwing error"
            );
            reject(new Error(`No history value found for key ${key}.`));
          }
        };
      });
    });
  }
}

function getHistoryDataByKey(key) {
  console.log("get history data by key", key);
  if (db) {
    const getHistoryTransaction = db.transaction(
      [historyTableName],
      "readonly"
    );
    const historyStore = getHistoryTransaction.objectStore(historyTableName);
    return new Promise((resolve, reject) => {
      getHistoryTransaction.oncomplete = function () {};
      getHistoryTransaction.onerror = function (err) {
        console.error("Error getting history item by key: ", err.stack || err);
        reject(err);
      };
      let request = historyStore.get(key);
      request.onsuccess = function (ev) {
        let data = ev.target.result;
        if (data) {
          console.log("inside getHistoryDataByKey. Sending response", data);
          resolve(data);
        } else {
          console.log(
            "inside getHistoryDataByKey. No data found. Throwing error"
          );
          reject(new Error("No history item at key ", key));
        }
      };
    });
  }
}

function getMetaData() {
  console.log("get all meta data");
  if (db) {
    const getMetaDataTransaction = db.transaction(
      [metaDataTableName],
      "readonly"
    );
    const metaDataStore = getMetaDataTransaction.objectStore(metaDataTableName);
    return new Promise((resolve, reject) => {
      getMetaDataTransaction.oncomplete = function () {};
      getMetaDataTransaction.onerror = function (err) {
        console.error("Error getting all meta data: ", err.stack || err);
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
  console.log("get meta data by type", type);
  if (db) {
    const getMetaDataTransaction = db.transaction(
      [metaDataTableName],
      "readonly"
    );
    const metaDataStore = getMetaDataTransaction.objectStore(metaDataTableName);
    return new Promise((resolve, reject) => {
      getMetaDataTransaction.oncomplete = function () {};
      getMetaDataTransaction.onerror = function (err) {
        console.error(
          `Error getting meta data based on type ${type}:`,
          err.stack || err
        );
        reject(err);
      };
      let request = metaDataStore.index("type").get(type);
      request.onsuccess = function (ev) {
        let data = ev.target.result;
        if (data) {
          console.log("inside getMetaDataByType. Sending response", data);
          resolve(ev.target.result);
        } else {
          console.log(
            "inside getMetaDataByType. No data found. Throwing error"
          );
          reject(new Error(`No value found in meta data for ${type}`));
        }
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
  console.log(
    "adding to history",
    sessionId,
    tabId,
    windowId,
    url,
    starttime,
    endtime
  );
  if (ignoreURL(url)) {
    console.log("add to history: url considered");
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
          console.error("Error adding to history store: ", err.stack || err);
          reject(err);
        };
        let now = new Date().toISOString();
        if (starttime || endtime) {
          if (starttime) {
            console.log("add to history: adding to history with start time");
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
            console.log("add to history: adding to history with end time");
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
          console.log("add to history: adding to history");
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
  } else return Promise.resolve(true);
}

function addCurrentTab(tabId, windowId, sessionId, url) {
  console.log("adding current tab", tabId, windowId, sessionId, url);
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
        console.error("Error adding current tab meta data: ", err.stack || err);
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
  console.log("updating current tab", tabId, windowId, sessionId, url);
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
            console.error(
              "Error updating meta data transaction: ",
              err.stack || err
            );
            reject(err);
          };
          (currentTab.tabId = tabId), (currentTab.windowId = windowId);
          currentTab.sessionId = sessionId;
          currentTab.url = url;
          currentTabStore.put(currentTab, "currentTab");
        });
      })
      .catch((err) => {
        console.log(
          "inside updateCurrentTab. no current tab found. Creating new current tab"
        );
        return addCurrentTab(tabId, windowId, sessionId, url)
          .then(() => Promise.resolve(true))
          .catch((err) => Promise.reject(err));
      });
  }
}

function updateHistoryStarttime(tabId, windowId, url, date) {
  console.log("updating history start time", tabId, windowId, url);
  if (db) {
    if (!ignoreURL(url)) {
      console.log("updateHistoryStarttime: ignore url. sending true");
      return Promise.resolve(true);
    }
    return getHistoryTabUrlDateKey(tabId, windowId, url, date)
      .then((key) => {
        console.log(
          "updateHistoryStarttime: response from getHistoryTabUrlDataKey",
          key
        );
        return getHistoryDataByKey(key)
          .then((data) => {
            console.log(
              "updateHistoryStarttime: response from getHistoryDataByKey",
              data
            );
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
                console.error(
                  "Error updating history item transaction: ",
                  err.stack || err
                );
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
              console.log(
                "updateHistoryStartTime: updating history item with",
                data
              );
              historyStore.put(data, key);
            });
          })
          .catch((err) => {
            // error getting data from history using key
            console.error("Error getting data from history using key");
            return Promise.reject(
              new Error("Error getting data from history using key")
            );
          });
      })
      .catch((err) => {
        // error getting key from history using tabId, windowId and URL
        console.error(
          "Error getting key from history using tabId, windowId and URL: ",
          err.stack || err
        );
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

function updateHistoryEndtime(tabId, windowId, url, date) {
  console.log("updating history end time", tabId, windowId, url);
  if (db) {
    if (!ignoreURL(url)) {
      console.log("updateHistoryEndTime: ignore url. sending true");
      return Promise.resolve(true);
    }
    return getHistoryTabUrlDateKey(tabId, windowId, url, date)
      .then((key) => {
        console.log(
          "updateHistoryEndtime: response from getHistoryTabUrlDateKey",
          key
        );
        return getHistoryDataByKey(key)
          .then((data) => {
            console.log(
              "updateHistoryEndtime: response from getHistoryDataByKey",
              data
            );
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
                console.error(
                  `Error updating history item transaction: `,
                  err.stack || err
                );
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
              console.log(
                "updateHistoryEndtime: updating history item with",
                data
              );
              historyStore.put(data, key);
            });
          })
          .catch((err) => {
            // error getting data from history using key;
            console.error("error getting data from history using key");
            return Promise.reject(
              new Error("Error getting data from history using key")
            );
          });
      })
      .catch((err) => {
        // error getting key from history using tabId, windowId, url
        console.error(
          "error getting key from history using tabId, windowId, url"
        );
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

function createFavicon(domain, favIconUrl) {
  if (db) {
    const faviconTransaction = db.transaction([faviconTableName], "readwrite");
    const faviconStore = faviconTransaction.objectStore(faviconTableName);
    return new Promise((resolve, reject) => {
      faviconTransaction.oncomplete = function () {
        resolve(true);
      };
      faviconTransaction.onerror = function (err) {
        reject(err);
      };
      faviconStore.add({ domain, favIconUrl }, domain);
    });
  }
}

function getFavicon(domain) {
  if (db) {
    const getFaviconTransaction = db.transaction(
      [faviconTableName],
      "readonly"
    );
    const faviconStore = getFaviconTransaction.objectStore(faviconTableName);
    return new Promise((resolve, reject) => {
      getFaviconTransaction.oncomplete = function () {};
      getFaviconTransaction.onerror = function (err) {
        reject(err);
      };
      let request = faviconStore.get(domain);
      request.onsuccess = function (ev) {
        let data = ev.target.result;
        if (data) resolve(data);
        else reject(new Error(`No favicon found for domain ${domain}`));
      };
    });
  }
}

function updateFavicon(domain, favIconUrl) {
  if (db) {
    return getFavicon(domain)
      .then((data) => {
        const putFaviconTransaction = db.transaction(
          [faviconTableName],
          "readwrite"
        );
        const faviconStore =
          putFaviconTransaction.objectStore(faviconTableName);
        return new Promise((resolve, reject) => {
          putFaviconTransaction.oncomplete = function () {
            resolve(true);
          };
          putFaviconTransaction.onerror = function (err) {
            reject(err);
          };
          data.favIconUrl = favIconUrl;
          faviconStore.put(data, domain);
        });
      })
      .catch((err) => {
        createFavicon(domain, favIconUrl)
          .then(() => Promise.resolve(true))
          .catch((err) => Promise.reject(err));
      });
  }
}
