document.addEventListener('DOMContentLoaded', () => {

  (function () {
    const modal = document.getElementById("logic-builder-modal");
    const btnOpen = document.getElementById("open-logic-builder");
    if (!modal || !btnOpen) return; // wizard might not be on every admin page

    const btnClose = document.getElementById("logic-builder-close");
    const btnCancel = document.getElementById("logic-builder-cancel");
    const btnClear = document.getElementById("logic-builder-clear");
    const btnSave = document.getElementById("logic-builder-save");
    const btnAddCond = document.getElementById("logic-add-condition");
    const tbody = document.getElementById("logic-conditions-body");

    // --- Question metadata from backend -----------------------------------
    const logicQuestions = window.LOGIC_QUESTIONS || [];

    // Map by "ref" (what we store in JSON): code or id as string
    const logicQByRef = {};
    logicQuestions.forEach(q => {
      const ref = q.code || String(q.id);
      logicQByRef[ref] = q;
    });

    // Currently eligible questions (only earlier ones)
    let currentEligibleQuestions = logicQuestions.slice();

    // Shared class for all value controls
    const VALUE_INPUT_CLASS =
      "logic-val-input w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";

    let targetTextarea = null;  // the <textarea> we’ll read/write
    let currentData = null;     // parsed JSON object, or null

    // --- helpers ----------------------------------------------------------

    // Find question meta in LOGIC_QUESTIONS by "reference" (code or id-as-string)
    function getQuestionMetaByRef(ref) {
      if (!ref) return null;
      return logicQuestions.find(q => {
        const base = q.code || String(q.id);
        return base === ref;
      }) || null;
    }

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
      if ("all" in data) return "all";
      // single condition treated as "all"
      return "all";
    }

    function getConditionsFromData(data) {
      if (!data || typeof data !== "object") return [];

      if ("all" in data && Array.isArray(data.all)) return data.all;
      if ("any" in data && Array.isArray(data.any)) return data.any;

      if ("q" in data && "op" in data) return [data]; // single condition
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

    // Try to detect the "current" question via code field (#id_code)
    // If we find a matching entry in LOGIC_QUESTIONS, we can use its sort_index.
    function getCurrentQuestionMeta() {
      const codeInput = document.getElementById("id_code");
      if (!codeInput) return null;
      const codeVal = (codeInput.value || "").trim();
      if (!codeVal) return null;

      return logicQuestions.find(q => q.code === codeVal) || null;
    }

    // Build the appropriate <input>/<select> for the Value column
    function createValueControl(meta, cond) {
      const op = cond && cond.op ? cond.op : "eq";

      // "val" could be a scalar or an array (for in/not_in)
      let existingVal = "";
      if (cond && typeof cond.val !== "undefined") {
        if (Array.isArray(cond.val)) {
          existingVal = cond.val.join(",");
        } else {
          existingVal = String(cond.val);
        }
      }

      // For "in" / "not_in", always use free-text CSV
      if (op === "in" || op === "not_in") {
        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = VALUE_INPUT_CLASS;
        inp.value = existingVal;
        inp.placeholder = "e.g. 1,2,3";
        return inp;
      }

      // If we don't know the question yet, fallback to text
      if (!meta) {
        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = VALUE_INPUT_CLASS;
        inp.value = existingVal;
        inp.placeholder = "e.g. 1";
        return inp;
      }

      const qtype = meta.question_type;
      const choices = meta.choices || [];
      const choiceTypes = ["SINGLE_CHOICE", "MULTI_CHOICE", "DROPDOWN", "IMAGE_CHOICE"];

      // SC/MC/DROPDOWN/IMAGE_CHOICE => dropdown of choices
      if (choiceTypes.includes(qtype) && choices.length > 0) {
        const sel = document.createElement("select");
        sel.className = VALUE_INPUT_CLASS;

        const optEmpty = document.createElement("option");
        optEmpty.value = "";
        optEmpty.textContent = "– select value –";
        sel.appendChild(optEmpty);

        choices.forEach(c => {
          const o = document.createElement("option");
          const v = (c.value !== null && c.value !== undefined) ? c.value : c.id;
          o.value = String(v);
          o.textContent = c.label || `Choice ${c.id}`;
          if (existingVal !== "" && String(existingVal) === String(o.value)) {
            o.selected = true;
          }
          sel.appendChild(o);
        });

        return sel;
      }

      // YESNO => Yes (1) / No (0)
      if (qtype === "YESNO") {
        const sel = document.createElement("select");
        sel.className = VALUE_INPUT_CLASS;

        const optEmpty = document.createElement("option");
        optEmpty.value = "";
        optEmpty.textContent = "– select –";
        sel.appendChild(optEmpty);

        const optYes = document.createElement("option");
        optYes.value = "1";
        optYes.textContent = "Yes";
        if (existingVal === "1") optYes.selected = true;
        sel.appendChild(optYes);

        const optNo = document.createElement("option");
        optNo.value = "0";
        optNo.textContent = "No";
        if (existingVal === "0") optNo.selected = true;
        sel.appendChild(optNo);

        return sel;
      }

      // Default: free text
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = VALUE_INPUT_CLASS;
      inp.value = existingVal;
      inp.placeholder = "e.g. 1";
      return inp;
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
        const o   = document.createElement("option");
        const ref = q.code || String(q.id);
        o.value = ref;
        o.textContent = `${ref} — ${q.text}`;
        selQ.appendChild(o);
      });

      // We might have composite keys for MATRIX like "Q3::col::1"
      let baseQRef = "";
      let matrixColKey = null;
      if (cond && cond.q) {
        if (typeof cond.q === "string" && cond.q.includes("::col::")) {
          const parts = cond.q.split("::col::");
          baseQRef    = parts[0] || "";
          matrixColKey = parts[1] || null;
        } else {
          baseQRef = String(cond.q);
        }
      }
      if (baseQRef) selQ.value = baseQRef;
      if (matrixColKey != null) {
        tr.dataset.matrixColKey = matrixColKey;   // used to preselect column
      }

      tdQ.appendChild(selQ);

      // --- Operator select ---
      const selOp = document.createElement("select");
      selOp.className = "w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";
      [
        ["eq", "equals (=)"],
        ["ne", "not equals (≠)"],
        ["in", "in list"],
        ["not_in", "not in list"],
        ["gt", ">"],
        ["gte", "≥"],
        ["lt", "<"],
        ["lte", "≤"],
      ].forEach(([val, label]) => {
        const o = document.createElement("option");
        o.value = val;
        o.textContent = label;
        selOp.appendChild(o);
      });
      if (cond && cond.op) selOp.value = cond.op;
      tdOp.appendChild(selOp);

      // --- Value cell: we’ll render proper editor based on question type ---
      tdVal.setAttribute("data-role", "logic-val-cell");

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

      // Initial render of the value editor for this row
      renderValueEditorForRow(tr, cond || null);

      // When question changes -> re-render value editor for that row
      selQ.addEventListener("change", () => {
        // clear any stored matrix col key (we’re changing question)
        delete tr.dataset.matrixColKey;
        renderValueEditorForRow(tr, null);
      });
    }

    function renderValueEditorForRow(tr, cond) {
      const tdVal = tr.querySelector('td[data-role="logic-val-cell"]');
      const selQ  = tr.querySelector("td:nth-child(1) select"); // first select in row (Question)
      if (!tdVal || !selQ) return;

      // wipe previous editor
      tdVal.innerHTML = "";

      const ref = (selQ.value || "").trim();
      const qMeta = getQuestionMetaByRef(ref);

      // derive existing val (for prefill) from cond
      let condVal = "";
      if (cond && typeof cond.val !== "undefined") {
        if (Array.isArray(cond.val)) {
          condVal = cond.val.join(",");
        } else {
          condVal = String(cond.val);
        }
      }

      // ---- MATRIX (single/multi) → column dropdown + optional numeric value ----
      if (
        qMeta &&
        qMeta.question_type === "MATRIX" &&
        qMeta.matrix_mode !== "side_by_side" &&
        Array.isArray(qMeta.matrix_cols) &&
        qMeta.matrix_cols.length
      ) {
        const wrapper = document.createElement("div");
        wrapper.className = "space-y-1";
        tdVal.appendChild(wrapper);

        // Column selector
        const selCol = document.createElement("select");
        selCol.className = "w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";
        selCol.setAttribute("data-role", "matrix-col-select");

        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "-- column --";
        selCol.appendChild(blank);

        const colKeyFromCond = tr.dataset.matrixColKey || null;

        qMeta.matrix_cols.forEach(col => {
          if (!col) return;
          // key we’ll encode into cond.q:  use value if present, otherwise "id:<pk>"
          const key = (col.value !== null && col.value !== undefined && col.value !== "")
            ? String(col.value)
            : `id:${col.id}`;

          const o = document.createElement("option");
          o.value = key;
          o.textContent = col.label || (col.value != null ? `Col ${col.value}` : `Column #${col.id}`);

          if (colKeyFromCond && colKeyFromCond === key) {
            o.selected = true;
          }
          selCol.appendChild(o);
        });

        wrapper.appendChild(selCol);

        // Optional value input (e.g. 1 / 0 etc.)
        const inputVal = document.createElement("input");
        inputVal.type = "text";
        inputVal.className = "w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";
        inputVal.placeholder = "e.g. 1 (selected) or 0 (not selected)";
        if (condVal) inputVal.value = condVal;
        wrapper.appendChild(inputVal);

        return;
      }

      // ---- Choice-based questions → dropdown of possible values ----
      const choiceTypes = new Set(["SINGLE_CHOICE", "MULTI_CHOICE", "DROPDOWN", "YESNO", "RATING", "IMAGE_CHOICE"]);
      if (
        qMeta &&
        choiceTypes.has(qMeta.question_type) &&
        Array.isArray(qMeta.choices) &&
        qMeta.choices.length
      ) {
        const selVal = document.createElement("select");
        selVal.className = "w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";

        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "-- value --";
        selVal.appendChild(blank);

        qMeta.choices.forEach(c => {
          if (!c) return;
          const val = (c.value !== null && c.value !== undefined && c.value !== "")
            ? String(c.value)
            : `id:${c.id}`;

          const o = document.createElement("option");
          o.value = val;
          o.textContent = c.label || c.text || `Choice #${c.id}`;
          if (condVal && condVal === val) o.selected = true;
          selVal.appendChild(o);
        });

        tdVal.appendChild(selVal);
        return;
      }

      // ---- Fallback: plain text input (for NUMBER, SLIDER, etc. or unknown) ----
      const inputVal = document.createElement("input");
      inputVal.type = "text";
      inputVal.className = "w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";
      inputVal.placeholder = "e.g. 1 or 1,2,3";
      if (condVal) inputVal.value = condVal;
      tdVal.appendChild(inputVal);
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
        const selects = tr.querySelectorAll("select");
        if (!selects.length) continue;

        const selQ  = selects[0];           // Question
        const selOp = selects[1] || null;   // Operator (2nd select in row)

        const qRefBase = (selQ.value || "").trim();
        const op       = selOp ? (selOp.value || "eq").trim() : "eq";

        if (!qRefBase || !op) {
          // skip incomplete
          continue;
        }

        const qMeta = getQuestionMetaByRef(qRefBase);

        // Default raw value: from text input or value-select
        let rawVal = "";
        // Prefer a text input in this row (for generic numeric / list)
        const textInp = tr.querySelector('td[data-role="logic-val-cell"] input[type="text"]');
        if (textInp) {
          rawVal = (textInp.value || "").trim();
        } else {
          // Or a select in the Value cell
          const valSel = tr.querySelector('td[data-role="logic-val-cell"] select:not([data-role="matrix-col-select"])');
          if (valSel) {
            rawVal = (valSel.value || "").trim();
          }
        }

        let qKey = qRefBase;  // what we’ll store in cond.q
        let val;              // what we’ll store in cond.val

        // --- MATRIX single/multi: encode column into qKey as "QREF::col::<colKey>" ---
        if (
          qMeta &&
          qMeta.question_type === "MATRIX" &&
          qMeta.matrix_mode !== "side_by_side"
        ) {
          const colSel = tr.querySelector('select[data-role="matrix-col-select"]');
          const colKey = colSel ? (colSel.value || "").trim() : "";

          if (!colKey) {
            // no column chosen ⇒ skip this condition
            continue;
          }

          // composite key so backend can treat each matrix column as a logical “sub-question”
          qKey = `${qRefBase}::col::${colKey}`;

          if (!rawVal) {
            // for now, require a value (e.g. 1 / 0); if you later support "exists" checks,
            // this is where you'd allow empty rawVal.
            continue;
          }

          // interpret lists ("1,2") vs simple value
          if (rawVal.includes(",")) {
            val = rawVal.split(",").map(s => s.trim()).filter(Boolean);
          } else {
            val = rawVal;
          }

        } else {
          // --- Non-matrix or SBS (for now): original behaviour ---
          if (!rawVal) {
            // allow blank val? we keep old logic: skip rows that have no val
            continue;
          }
          if (rawVal.includes(",")) {
            val = rawVal.split(",").map(s => s.trim()).filter(Boolean);
          } else {
            val = rawVal;
          }
        }

        conds.push({ q: qKey, op, val });
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

      // 🆕 compute eligible questions = only earlier ones (by sort_index)
      const currentMeta = getCurrentQuestionMeta();
      if (currentMeta && typeof currentMeta.sort_index === "number") {
        currentEligibleQuestions = logicQuestions
          .filter(q => q.sort_index < currentMeta.sort_index)
          .sort((a, b) =>
            (a.sort_index - b.sort_index) || (a.id - b.id)
          );
      } else {
        // new/unsaved question or no code match → allow all existing questions
        currentEligibleQuestions = logicQuestions.slice();
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
});
