function get_all(date = null) {
  if (date) {
    chrome.runtime.sendMessage({
      message: "get_all",
      payload: {
        date: date,
      },
    });
  } else {
    chrome.runtime.sendMessage({
      message: "get_all",
    });
  }
}

const dateLabel = document.querySelector("label#date");
window.addEventListener("load", (event) => {
  get_all();
  dateLabel.innerText = new Date().toDateString();
});

const flash = document.querySelector("label#flash");
const form_domain = document.querySelector("form#domain-form");
const table = document.getElementById("table-body");
const prevLabel = document.getElementById("prev-day-label");
const nextLabel = document.getElementById("next-day-label");
const oneMinute = 1000 * 60;
const oneHour = 1000 * 60 * 60;

prevLabel.addEventListener("click", () => prevDate(dateLabel.innerText));
nextLabel.addEventListener("click", () => nextDate(dateLabel.innerText));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "add_response") {
    flash.innerText = request.payload
      ? "Quota added successfully"
      : "Error adding quota. Please try again or maybe quota for this domain already exists";
    get_all(dateLabel.innerText);
  } else if (request.message === "get_all_response") {
    if (request.payload) {
      const payload = request.payload;
      table.innerHTML = "";
      payload.forEach((quota) => {
        const row = document.createElement("tr");
        let quotaNumber =
          quota.quota < oneHour
            ? (quota.quota / oneMinute).toFixed(1)
            : (quota.quota / oneHour).toFixed(1);
        let timespentNumber =
          quota.timespent < oneHour
            ? (quota.timespent / oneMinute).toFixed(1)
            : (quota.timespent / oneHour).toFixed(1);
        let overtime =
          quota.quota && quota.timespent > quota.quota
            ? `+${((quota.timespent / quota.quota) * 100).toFixed(1)}%`
            : null;
        const iconColumn = document.createElement("td");
        const iconImage = document.createElement("img");
        iconImage.setAttribute(
          "src",
          `chrome://favicon/${new URL(quota.url).protocol}//${quota.domain}`
        );
        iconImage.setAttribute("title", quota.domain);
        iconImage.setAttribute("alt", "ico");
        iconImage.style.borderRadius = "50%";
        iconImage.style.width = "20px";
        iconImage.style.height = "20px";
        iconImage.style.objectFit = "none";
        iconColumn.appendChild(iconImage);
        row.appendChild(iconColumn);
        const countColumn = document.createElement("td");
        countColumn.innerText = `${quota.count}x`;
        row.appendChild(countColumn);
        const timespendColumn = document.createElement("td");
        let timespent =
          quota.timespent < oneHour
            ? `${timespentNumber}m`
            : `${timespentNumber}h`;
        timespendColumn.innerText = timespent;
        row.appendChild(timespendColumn);
        const overtimeColumn = document.createElement("td");
        overtimeColumn.classList.add("bad", "overtime");
        overtimeColumn.innerText = overtime ? overtime : "";
        row.appendChild(overtimeColumn);
        const quotaColumn = document.createElement("td");
        if (quota.quota) {
          quotaColumn.innerText =
            quota.quota < oneHour ? `${quotaNumber}m` : `${quotaNumber}h`;
          quotaColumn.classList.add("quota");
        } else {
          let setActionButton = document.createElement("button");
          setActionButton.classList.add("button", "pointer");
          setActionButton.innerText = "Set";
          setActionButton.setAttribute(
            "data-url",
            `${new URL(quota.url).protocol}//${quota.domain}`
          );
          setActionButton.addEventListener("click", () =>
            setButtonClick(`${new URL(quota.url).protocol}//${quota.domain}`)
          );
          quotaColumn.appendChild(setActionButton);
        }
        row.appendChild(quotaColumn);
        table.appendChild(row);
      });
    } else {
      flash.innerText = "Error fetching quota list";
    }
  }
});

form_domain.addEventListener("submit", (event) => {
  event.preventDefault();
  let form_data = new FormData(form_domain);
  let url = new URL(form_data.get("url"));
  chrome.runtime.sendMessage({
    message: "add",
    payload: {
      url: url,
      domain: url.host,
      quota: form_data.get("quota"),
    },
  });
  let domain_input = document.getElementById("url");
  let quota_input = document.getElementById("quota");
  domain_input.value = "";
  quota_input.value = "";
});

function setButtonClick(url) {
  let domain_input = document.getElementById("url");
  let quota_input = document.getElementById("quota");
  domain_input.value = url;
  quota_input.focus();
}

function prevDate(now) {
  let yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0);
  yesterday.setMinutes(0);
  yesterday.setSeconds(0);
  yesterday.setMilliseconds(0);
  dateLabel.innerText = yesterday.toDateString();
  flash.innerText = "";
  flash.classList.remove("bad");
  get_all(yesterday);
}

function nextDate(now) {
  if (new Date().toDateString() !== now) {
    let tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0);
    tomorrow.setMinutes(0);
    tomorrow.setSeconds(0);
    tomorrow.setMilliseconds(0);
    dateLabel.innerText = tomorrow.toDateString();
    flash.innerText = "";
    flash.classList.remove("bad");
    get_all(tomorrow);
  } else {
    flash.innerText = "Cannot be done.";
    flash.classList.add("bad");
  }
}
