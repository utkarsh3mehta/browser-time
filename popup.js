const dateLabel = document.querySelector("label#date");
const flash = document.querySelector("label#flash");
// const form_domain = document.querySelector("form#domain-form");
const table = document.getElementById("table-body");
const prevLabel = document.getElementById("prev-day-label");
const nextLabel = document.getElementById("next-day-label");
const oneSecond = 1000;
const oneMinute = oneSecond * 60;
const oneHour = oneMinute * 60;
const oneDay = oneHour * 24;
const oneMonth = oneDay * 30;

function timeFormatter(milliseconds = null) {
  let timestring = "";
  if (milliseconds) {
    if (milliseconds >= oneSecond) {
      if (milliseconds >= oneMinute) {
        if (milliseconds >= oneHour) {
          if (milliseconds >= oneDay) {
            if (milliseconds >= oneMonth) {
              let months = Math.floor(milliseconds / oneMonth);
              timestring += months + "M\u00a0";
              milliseconds = milliseconds % oneMonth;
            }
            let days = Math.floor(milliseconds / oneDay);
            timestring += days + "d\u00a0";
            milliseconds = milliseconds % oneDay;
          }
          let hours = Math.floor(milliseconds / oneHour);
          timestring += hours + "h\u00a0";
          milliseconds = milliseconds % oneHour;
        }
        let minutes = Math.floor(milliseconds / oneMinute);
        timestring += minutes + "m\u00a0";
        milliseconds = milliseconds % oneMinute;
      }
      let seconds = Math.floor(milliseconds / oneSecond);
      timestring += seconds + "s";
    } else {
      timestring = "0s";
    }
    return timestring;
  } else return "0s";
}

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

window.addEventListener("load", (event) => {
  get_all();
  dateLabel.textContent = new Date().toDateString();
});

prevLabel.addEventListener("click", () => prevDate(dateLabel.textContent));
nextLabel.addEventListener("click", () => nextDate(dateLabel.textContent));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "add_response") {
    flash.textContent = request.payload
      ? "Quota added successfully"
      : "Error adding quota. Please try again or maybe quota for this domain already exists";
    get_all(dateLabel.textContent);
  } else if (request.message === "get_all_response") {
    if (request.payload) {
      const payload = request.payload;
      table.innerHTML = "";
      payload.forEach((quota) => {
        const row = document.createElement("tr");
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
        iconImage.style.verticalAlign = "bottom";
        iconColumn.appendChild(iconImage);
        row.appendChild(iconColumn);
        const countColumn = document.createElement("td");
        countColumn.textContent = `${quota.count}x`;
        row.appendChild(countColumn);
        const timespendColumn = document.createElement("td");
        let timespent = timeFormatter(quota.timespent);
        timespendColumn.textContent = timespent;
        row.appendChild(timespendColumn);
        const overtimeColumn = document.createElement("td");
        overtimeColumn.classList.add("bad", "overtime");
        overtimeColumn.textContent = overtime ? overtime : "";
        row.appendChild(overtimeColumn);
        const quotaColumn = document.createElement("td");
        quotaColumn.setAttribute("id", quota.url);
        if (quota.quota) {
          quotaColumn.textContent = timeFormatter(quota.quota);
          quotaColumn.classList.add("quota");
        } else {
          let setActionButton = document.createElement("button");
          setActionButton.classList.add("button", "pointer");
          setActionButton.textContent = "Set";
          setActionButton.addEventListener("click", () =>
            setButtonClick(quota.url)
          );
          quotaColumn.appendChild(setActionButton);
        }
        row.appendChild(quotaColumn);
        table.appendChild(row);
      });
    } else {
      flash.textContent = "Error fetching quota list";
    }
  }
});

function setButtonClick(url) {
  let tableElement = document.getElementById(url);
  const addForm = document.createElement("form");
  const inputURL = document.createElement("input");
  const inputQuota = document.createElement("input");
  const addButton = document.createElement("button");
  const cancelLabel = document.createElement("label");
  inputURL.setAttribute("type", "url");
  inputURL.setAttribute("name", "url");
  inputURL.setAttribute("id", "url");
  inputURL.value = url;
  inputURL.style.display = "none";
  inputQuota.setAttribute("type", "number");
  inputQuota.setAttribute("name", "quota");
  inputQuota.setAttribute("id", "quota");
  inputQuota.setAttribute("min", 1);
  inputQuota.setAttribute("max", 999);
  inputQuota.setAttribute("placeholder", "minutes");
  inputQuota.classList.add("p-half", "col-12");
  addButton.textContent = "+";
  addButton.setAttribute("type", "submit");
  addButton.classList.add("p-half", "add-button", "pointer");
  cancelLabel.textContent = "x";
  cancelLabel.classList.add("p-half", "add-button", "bad", "pointer");
  cancelLabel.style.fontWeight = "lighter";
  cancelLabel.style.lineHeight = "15px";
  cancelLabel.addEventListener("click", (event) => {
    let setActionButton = document.createElement("button");
    setActionButton.classList.add("button", "pointer");
    setActionButton.textContent = "Set";
    setActionButton.addEventListener("click", () => setButtonClick(url));
    tableElement.innerHTML = "";
    tableElement.appendChild(setActionButton);
  });
  addForm.appendChild(inputURL);
  addForm.appendChild(inputQuota);
  addForm.appendChild(addButton);
  addForm.appendChild(cancelLabel);
  addForm.classList.add("d-flex", "align-center", "p-half", "c-g-half");
  addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    let form_data = new FormData(addForm);
    let form_url = new URL(form_data.get("url"));
    // console.log("submitting form for ", url);
    // console.log("form url ", form_url);
    chrome.runtime.sendMessage({
      message: "add",
      payload: {
        url: url,
        domain: form_url.host,
        quota: form_data.get("quota"),
      },
    });
  });
  tableElement.innerHTML = "";
  tableElement.appendChild(addForm);
  inputQuota.focus();
  // let domain_input = document.getElementById("url");
  // let quota_input = document.getElementById("quota");
  // domain_input.value = url;
  // quota_input.focus();
}

function prevDate(now) {
  let yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0);
  yesterday.setMinutes(0);
  yesterday.setSeconds(0);
  yesterday.setMilliseconds(0);
  dateLabel.textContent = yesterday.toDateString();
  flash.textContent = "";
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
    dateLabel.textContent = tomorrow.toDateString();
    flash.textContent = "";
    flash.classList.remove("bad");
    get_all(tomorrow);
  } else {
    flash.textContent = "Cannot be done.";
    flash.classList.add("bad");
  }
}