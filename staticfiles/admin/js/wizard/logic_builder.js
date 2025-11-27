(function () {
  const modal      = document.getElementById("logic-builder-modal");
  const btnOpen    = document.getElementById("open-logic-builder");
  if (!modal || !btnOpen) return; // wizard might not be on every admin page

  const btnClose   = document.getElementById("logic-builder-close");
  const btnCancel  = document.getElementById("logic-builder-cancel");
  const btnClear   = document.getElementById("logic-builder-clear");
  const btnSave    = document.getElementById("logic-builder-save");
  const btnAddCond = document.getElementById("logic-add-condition");
  const tbody      = document.getElementById("logic-conditions-body");

  const logicQuestions = window.LOGIC_QUESTIONS || [];
  let targetTextarea   = null;   // the <textarea> we’ll read/write
  let currentData      = null;   // parsed JSON object, or null

  // --- helpers ----------------------------------------------------------

  function openModal() {
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function getModeFromData(data) {
    if (!data || typeof data !== "object") return "all";
    if ("any" in data) return "any";
    // single condition or {"all":[...]}
    if ("all" in data) return "all";
    return "all";
  }

  function getConditionsFromData(data) {
    if (!data || typeof data !== "object") return [];

    if ("all" in data && Array.isArray(data.all)) return data.all;
    if ("any" in data && Array.isArray(data.any)) return data.any;

    // If it looks like a single condition object
    if ("q" in data && "op" in data) return [data];
    return [];
  }

  function setModeRadio(mode) {
    const radios = document.querySelectorAll('input[name="logic_mode"]');
    radios.forEach(r => {
      r.checked = (r.value === mode);
    });
  }

  function getSelectedMode() {
    const radios = document.querySelectorAll('input[name="logic_mode"]');
    for (const r of radios) {
      if (r.checked) return r.value === "any" ? "any" : "all";
    }
    return "all";
  }

  function clearRows() {
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  }

  function addRow(cond) {
    // cond: {q, op, val}
    const tr = document.createElement("tr");

    const tdQ   = document.createElement("td");
    const tdOp  = document.createElement("td");
    const tdVal = document.createElement("td");
    const tdAct = document.createElement("td");

    tdQ.className   = "py-1 pr-2";
    tdOp.className  = "py-1 pr-2";
    tdVal.className = "py-1 pr-2";
    tdAct.className = "py-1 text-center";

    // --- Question select ---
    const selQ = document.createElement("select");
    selQ.className = "w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";
    const optEmpty = document.createElement("option");
    optEmpty.value = "";
    optEmpty.textContent = "-- choose question --";
    selQ.appendChild(optEmpty);

    logicQuestions.forEach(q => {
      const o = document.createElement("option");
      const ref = q.code || String(q.id);
      o.value = ref;
      o.textContent = `${ref} — ${q.text}`;
      selQ.appendChild(o);
    });

    if (cond && cond.q) selQ.value = String(cond.q);

    tdQ.appendChild(selQ);

    // --- Operator select ---
    const selOp = document.createElement("select");
    selOp.className = "w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";
    [
      ["eq",     "equals (=)"],
      ["ne",     "not equals (≠)"],
      ["in",     "in list"],
      ["not_in","not in list"],
      ["gt",    ">"],
      ["gte",   "≥"],
      ["lt",    "<"],
      ["lte",   "≤"],
    ].forEach(([val, label]) => {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = label;
      selOp.appendChild(o);
    });
    if (cond && cond.op) selOp.value = cond.op;
    tdOp.appendChild(selOp);

    // --- Value input ---
    const inputVal = document.createElement("input");
    inputVal.type = "text";
    inputVal.className = "w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";
    if (cond && typeof cond.val !== "undefined") {
      if (Array.isArray(cond.val)) {
        inputVal.value = cond.val.join(","); // represent lists as "1,2,3"
      } else {
        inputVal.value = String(cond.val);
      }
    }
    inputVal.placeholder = "e.g. 1 or 1,2,3";
    tdVal.appendChild(inputVal);

    // --- Remove button ---
    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn-shell";
    btnDel.innerHTML = '<span class="btn-ui text-xs">🗑</span>';
    btnDel.addEventListener("click", () => {
      tr.remove();
    });
    tdAct.appendChild(btnDel);

    tr.appendChild(tdQ);
    tr.appendChild(tdOp);
    tr.appendChild(tdVal);
    tr.appendChild(tdAct);

    tbody.appendChild(tr);
  }

  function loadFromTextarea() {
    currentData = null;
    if (!targetTextarea) return;

    const raw = (targetTextarea.value || "").trim();
    if (!raw) {
      // no logic => default mode ALL, one empty row
      setModeRadio("all");
      clearRows();
      addRow({ q: "", op: "eq", val: "" });
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      currentData = parsed;
    } catch (e) {
      console.warn("Logic JSON parse error:", e);
      alert("Existing display logic is not valid JSON. We’ll start fresh.");
      setModeRadio("all");
      clearRows();
      addRow({ q: "", op: "eq", val: "" });
      return;
    }

    const mode = getModeFromData(currentData);
    const conds = getConditionsFromData(currentData);

    setModeRadio(mode);
    clearRows();
    if (!conds.length) {
      addRow({ q: "", op: "eq", val: "" });
    } else {
      conds.forEach(c => addRow(c));
    }
  }

  function buildDataFromUI() {
    const mode = getSelectedMode(); // "all" or "any"
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const conds = [];

    for (const tr of rows) {
      const selQ   = tr.querySelector("select");
      const selOp  = tr.querySelectorAll("select")[1];
      const inpVal = tr.querySelector("input[type='text']");

      if (!selQ || !selOp || !inpVal) continue;

      const q   = (selQ.value || "").trim();
      const op  = (selOp.value || "eq").trim();
      const raw = (inpVal.value || "").trim();

      if (!q || !op) {
        // skip incomplete rows
        continue;
      }

      let val;
      if (raw.includes(",")) {
        // list values -> ["1","2"] -> [1,2] or strings
        val = raw.split(",").map(s => s.trim()).filter(Boolean);
      } else {
        val = raw;
      }

      conds.push({ q, op, val });
    }

    if (!conds.length) {
      // No conditions ⇒ empty rules
      return {};
    }

    const wrapperKey = mode === "any" ? "any" : "all";
    return { [wrapperKey]: conds };
  }

  // --- wiring -----------------------------------------------------------

  btnOpen.addEventListener("click", function () {
    const targetId = this.dataset.builderTarget || "id_visibility_rules";
    targetTextarea = document.getElementById(targetId);
    if (!targetTextarea) {
      alert("Cannot find visibility rules field.");
      return;
    }

    loadFromTextarea();
    openModal();
  });

  btnClose?.addEventListener("click", closeModal);
  btnCancel?.addEventListener("click", closeModal);

  btnClear?.addEventListener("click", function () {
    if (!targetTextarea) return;
    if (!confirm("Clear all display logic for this question?")) return;

    targetTextarea.value = "";
    clearRows();
    setModeRadio("all");
    addRow({ q: "", op: "eq", val: "" });
  });

  btnAddCond?.addEventListener("click", function () {
    addRow({ q: "", op: "eq", val: "" });
  });

  btnSave?.addEventListener("click", function () {
    if (!targetTextarea) return;
    const data = buildDataFromUI();

    if (!Object.keys(data).length) {
      // treat as "no logic"
      targetTextarea.value = "";
    } else {
      targetTextarea.value = JSON.stringify(data);
    }

    closeModal();
  });

  // Close on backdrop click
  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeModal();
  });
})();
