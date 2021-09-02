function get_all() {
  chrome.runtime.sendMessage({
    message: "get_all",
  });
}

const dateLabel = document.querySelector("label#date");

window.addEventListener("load", (event) => {
  get_all();
  dateLabel.innerText = new Date().toDateString();
});

const flash = document.querySelector("label#flash");
const form_domain = document.querySelector("form#domain-form");
const table = document.getElementById("table-body");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("request", request);
  console.log("sender", sender);
  console.log("send response", sendResponse);
  if (request.message === "add_response") {
    flash.innerText = request.payload
      ? "Quota added successfully"
      : "Error adding quota. Please try again";
    get_all();
  } else if (request.message === "get_all_response") {
    if (request.payload) {
      const payload = request.payload;
      table.innerHTML = "";
      payload.forEach((quota) => {
        const row = document.createElement("tr");
        let quotaNumber =
          quota.quota < 60 ? quota.quota : (quota.quota / 60).toFixed(2);
        const iconColumn = document.createElement("td");
        iconColumn.innerText = quota.domain.split('.').map(d => d[0]).join('.');
        row.appendChild(iconColumn);
        const countColumn = document.createElement("td");
        row.appendChild(countColumn);
        const timespendColumn = document.createElement("td");
        row.appendChild(timespendColumn);
        const overtimeColumn = document.createElement("td");
        row.appendChild(overtimeColumn);
        const quotaColumn = document.createElement("td");
        quotaColumn.innerText =
          quota.quota < 60 ? `${quotaNumber}m` : `${quotaNumber}h`;
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
      url: form_data.get("url"),
      domain: url.host,
      quota: form_data.get("quota"),
    },
  });
});
