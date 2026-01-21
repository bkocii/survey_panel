document.addEventListener('DOMContentLoaded', () => {

  (function () {
    const modal = document.getElementById("logic-builder-modal");
    const btnOpen = document.getElementById("open-logic-builder");
    if (!modal || !btnOpen) return; // wizard might not be on every admin page

    const btnClose  = document.getElementById("logic-builder-close");
    const btnCancel = document.getElementById("logic-builder-cancel");
    const btnClear  = document.getElementById("logic-builder-clear");
    const btnSave   = document.getElementById("logic-builder-save");
    const btnAddCond = document.getElementById("logic-add-condition");
    const tbody     = document.getElementById("logic-conditions-body");

    // --- Question metadata from backend -----------------------------------
    const logicQuestions = window.LOGIC_QUESTIONS || [];

    // Only used for quick lookups
    const logicQByRef = {};
    logicQuestions.forEach(q => {
      const ref = q.code || String(q.id);
      logicQByRef[ref] = q;
    });

    // Current allowed pool (only previous questions)
    let currentEligibleQuestions = logicQuestions.slice();

    const VALUE_INPUT_CLASS =
      "logic-val-input w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";

    let targetTextarea = null;  // the <textarea> we’ll read/write
    let currentData    = null;  // parsed JSON object, or null

    // --- helpers ----------------------------------------------------------

    function getQuestionMetaByRef(ref) {
      if (!ref) return null;
      return logicQuestions.find(q => {
        const base = q.code || String(q.id);
        return base === ref;
      }) || null;
    }

    function openModal() {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
    }

    function closeModal() {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    }

    function getModeFromData(data) {
      if (!data || typeof data !== "object") return "all";
      if ("any" in data) return "any";
      if ("all" in data) return "all";
      return "all";
    }

    function getConditionsFromData(data) {
      if (!data || typeof data !== "object") return [];

      if ("all" in data && Array.isArray(data.all)) return data.all;
      if ("any" in data && Array.isArray(data.any)) return data.any;

      if ("q" in data && "op" in data) return [data];
      return [];
    }

    function setModeRadio(mode) {
      const radios = document.querySelectorAll('input[name="logic_mode"]');
      radios.forEach(r => { r.checked = (r.value === mode); });
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

    function getCurrentQuestionMeta() {
      const codeInput = document.getElementById("id_code");
      if (!codeInput) return null;
      const codeVal = (codeInput.value || "").trim();
      if (!codeVal) return null;
      return logicQuestions.find(q => q.code === codeVal) || null;
    }

    function hideMatrixHeaders() {
      const colHead = document.querySelector('#logic-conditions-table .logic-col-head');
      const rowHead = document.querySelector('#logic-conditions-table .logic-row-head');

      if (colHead) {
        colHead.classList.remove('hidden');
        colHead.classList.add('invisible');  // keep column, hide text
        colHead.textContent = '';            // optional: clear label
      }
      if (rowHead) {
        rowHead.classList.remove('hidden');
        rowHead.classList.add('invisible');  // same for Row
        rowHead.textContent = '';
      }
    }

    function showMatrixHeaders(forMode) {
      const colHead = document.querySelector('#logic-conditions-table .logic-col-head');
      const rowHead = document.querySelector('#logic-conditions-table .logic-row-head');
      if (!colHead || !rowHead) return;

      // Always keep them as table cells
      colHead.classList.remove('hidden', 'invisible');
      rowHead.classList.remove('hidden', 'invisible');

      if (forMode === "multi_single") {
        colHead.textContent = "Column";
        rowHead.textContent = "";
        rowHead.classList.add('invisible');  // keep empty column for alignment
      } else if (forMode === "sbs") {
        colHead.textContent = "Group";
        rowHead.textContent = "Row";
      } else {
        // no matrix -> both present but invisible
        hideMatrixHeaders();
      }
    }

    function ensureValueHint(tdVal) {
      let hint = tdVal.querySelector('[data-role="logic-val-hint"]');
      if (!hint) {
        hint = document.createElement("div");
        hint.setAttribute("data-role", "logic-val-hint");
        hint.className = "mt-1 text-[11px] text-gray-400 leading-snug whitespace-normal break-words w-full max-w-[260px]";
        tdVal.appendChild(hint);
      }
      return hint;
    }

    function getHintElForMainRow(tr) {
      const hintRow = tr.nextElementSibling;
      if (!hintRow || hintRow.getAttribute("data-role") !== "logic-hint-row") return null;
      return hintRow.querySelector("[data-role='logic-hint']");
    }

    function setRowHint(tr, text) {
      const hintRow = tr.nextElementSibling;
      const hintEl  = getHintElForMainRow(tr);
      if (!hintRow || !hintEl) return;

      const has = !!(text && text.trim());
      hintEl.textContent = has ? text : "";
      hintEl.style.display = has ? "block" : "none";
      hintRow.style.display = has ? "table-row" : "none";
    }

    function getRowOperator(tr) {
      const tdOp = tr.querySelector('td[data-role="logic-op-cell"]');
      const selOp = tdOp ? tdOp.querySelector('select') : null;
      return (selOp?.value || "eq").trim();
    }


    // --- main row rendering -----------------------------------------------

    function renderEditorsForRow(tr, cond) {
      const tdQ   = tr.querySelector('td[data-role="logic-q-cell"]');
      const tdCol = tr.querySelector('td[data-role="logic-col-cell"]');
      const tdRow = tr.querySelector('td[data-role="logic-row-cell"]');
      const tdVal = tr.querySelector('td[data-role="logic-val-cell"]');
      if (!tdQ || !tdCol || !tdRow || !tdVal) return;

      const selQ = tdQ.querySelector('select');
      if (!selQ) return;

      // Clear per-row cells
      tdCol.innerHTML = "";
      tdRow.innerHTML = "";
      tdVal.innerHTML = "";

      setRowHint(tr, ""); // reset hint each render

      const ref  = (selQ.value || "").trim();
      const meta = getQuestionMetaByRef(ref);

      // Compute current cond.val as string/CSV (for prefill)
      let condVal = "";
      if (cond && typeof cond.val !== "undefined") {
        if (Array.isArray(cond.val)) {
          condVal = cond.val.join(",");
        } else {
          condVal = String(cond.val);
        }
      }

      // Default: hide matrix-specific headers.
      // Individual branches below will show them when needed.
      hideMatrixHeaders();

      // ---------------- MATRIX SINGLE / MULTI -----------------------------
      if (
        meta &&
        meta.question_type === "MATRIX" &&
        meta.matrix_mode !== "side_by_side" &&
        Array.isArray(meta.matrix_columns) &&
        meta.matrix_columns.length
      ) {
        // We want: Question | Column | [empty Row col] | Operator | Value | Actions
        showMatrixHeaders("multi_single");

        // Pre-existing column key from cond.q (parsed earlier in addRow)
        const colKeyFromCond = tr.dataset.matrixColKey || "";

        // --- Column select in its own cell ---
        const selCol = document.createElement("select");
        selCol.className = "w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";
        selCol.setAttribute("data-role", "matrix-col-select");

        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "-- column --";
        selCol.appendChild(blank);

        meta.matrix_columns.forEach(col => {
          if (!col) return;
          const key =
            col.value !== null && col.value !== undefined && col.value !== ""
              ? String(col.value)
              : `id:${col.id}`;

          const o = document.createElement("option");
          o.value = key;
          o.textContent =
            col.label || (col.value != null ? `Col ${col.value}` : `Column #${col.id}`);

          if (colKeyFromCond && colKeyFromCond === key) {
            o.selected = true;
          }
          selCol.appendChild(o);
        });

        tdCol.appendChild(selCol);

        // Persist selection so operator changes (re-render) won't wipe it
        selCol.addEventListener("change", () => {
          tr.dataset.matrixColKey = (selCol.value || "").trim();
        });


        // --- Value input in its own cell ---
        const inputVal = document.createElement("input");
        inputVal.type = "text";
        inputVal.className = VALUE_INPUT_CLASS;
        inputVal.placeholder = "e.g. 1 (row value) or 1,2,3";
        if (condVal) inputVal.value = condVal;
        tdVal.appendChild(inputVal);

        setRowHint(
          tr,
          "Matrix (single/multi): compares against the selected row value(s) for this column. Use IN/NOT IN for multiple row values."
        );


        // No row dropdown for single/multi
        return;
      }

      // ---------------- MATRIX SBS (side_by_side) -------------------------
      if (
        meta &&
        meta.question_type === "MATRIX" &&
        meta.matrix_mode === "side_by_side" &&
        Array.isArray(meta.sbs_groups) &&
        meta.sbs_groups.length &&
        Array.isArray(meta.matrix_rows) &&
        meta.matrix_rows.length
      ) {
        // We want: Question | Group | Row | Operator | Value | Actions
        showMatrixHeaders("sbs");

        const initialGroupSlug = tr.dataset.sbsGroupSlug || "";
        const initialRowKey    = tr.dataset.sbsRowKey || "";

        // --- Group select (Column cell) ---
        const selGroup = document.createElement("select");
        selGroup.className = "w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";
        selGroup.setAttribute("data-role", "sbs-group-select");

        const gBlank = document.createElement("option");
        gBlank.value = "";
        gBlank.textContent = "-- group --";
        selGroup.appendChild(gBlank);

        meta.sbs_groups.forEach(g => {
          if (!g) return;
          const slug = g.slug || g.name || "";
          if (!slug) return;

          const o = document.createElement("option");
          o.value = slug;
          o.textContent = g.name || slug;
          if (initialGroupSlug && initialGroupSlug === slug) o.selected = true;
          selGroup.appendChild(o);
        });
        tdCol.appendChild(selGroup);

        selGroup.addEventListener("change", () => {
          tr.dataset.sbsGroupSlug = (selGroup.value || "").trim();
        });


        // --- Row select (Row cell) ---
        const selRow = document.createElement("select");
        selRow.className = "w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";
        selRow.setAttribute("data-role", "sbs-row-select");

        const rBlank = document.createElement("option");
        rBlank.value = "";
        rBlank.textContent = "-- row --";
        selRow.appendChild(rBlank);

        meta.matrix_rows.forEach(r => {
          if (!r) return;
          const key =
            r.value !== null && r.value !== undefined && r.value !== ""
              ? String(r.value)
              : `id:${r.id}`;

          const o = document.createElement("option");
          o.value = key;
          o.textContent = r.label || r.text || `Row #${r.id}`;
          if (initialRowKey && initialRowKey === key) o.selected = true;
          selRow.appendChild(o);
        });
        tdRow.appendChild(selRow);

        selRow.addEventListener("change", () => {
          tr.dataset.sbsRowKey = (selRow.value || "").trim();
        });


        // --- Value input (e.g. the answer value for that row+group) ---
        const inputVal = document.createElement("input");
        inputVal.type = "text";
        inputVal.className = VALUE_INPUT_CLASS;
        inputVal.placeholder = "e.g. 2 (column value)";
        if (condVal) inputVal.value = condVal;
        tdVal.appendChild(inputVal);

        setRowHint(
          tr,
          "Matrix (side-by-side): compares the chosen value for the selected group in the selected row."
        );

        return;
      }

      // ---------------- YES/NO SPECIAL CASE -------------------------------
      if (meta && meta.question_type === "YESNO") {
        // keep matrix headers hidden for non-matrix
        hideMatrixHeaders();

        const selVal = document.createElement("select");
        selVal.className = VALUE_INPUT_CLASS;

        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "-- value --";
        selVal.appendChild(blank);

        const optYes = document.createElement("option");
        optYes.value = "1";
        optYes.textContent = "Yes";
        if (condVal === "1") optYes.selected = true;
        selVal.appendChild(optYes);

        const optNo = document.createElement("option");
        optNo.value = "0";
        optNo.textContent = "No";
        if (condVal === "0") optNo.selected = true;
        selVal.appendChild(optNo);

        tdVal.appendChild(selVal);

        setRowHint(tr, "Yes/No: Yes = 1, No = 0.");

        return;
      }

      // ---------------- OTHER CHOICE-BASED QUESTIONS ----------------------
      const choiceTypes = new Set([
        "SINGLE_CHOICE",
        "MULTI_CHOICE",
        "DROPDOWN",
        "RATING",
        "IMAGE_CHOICE"
      ]);

      if (
        meta &&
        choiceTypes.has(meta.question_type) &&
        Array.isArray(meta.choices) &&
        meta.choices.length
      ) {
        hideMatrixHeaders();

        const op = getRowOperator(tr);

        // If IN/NOT_IN => free-text CSV input (so user can type "1,2,3")
        if (op === "in" || op === "not_in") {
          const inputVal = document.createElement("input");
          inputVal.type = "text";
          inputVal.className = VALUE_INPUT_CLASS;
          inputVal.placeholder = "e.g. 1,2,3";
          if (condVal) inputVal.value = condVal;
          tdVal.appendChild(inputVal);

          setRowHint(
            tr,
            "Use comma-separated values (e.g. 1,2,3). Compared against choice.value (or id:<pk> fallback)."
          );
          return;
        }

        // Otherwise EQ/NE/etc => dropdown is fine
        const selVal = document.createElement("select");
        selVal.className = VALUE_INPUT_CLASS;

        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "-- value --";
        selVal.appendChild(blank);

        meta.choices.forEach(c => {
          if (!c) return;
          const val =
            c.value !== null && c.value !== undefined && c.value !== ""
              ? String(c.value)
              : `id:${c.id}`;

          const o = document.createElement("option");
          o.value = val;
          o.textContent = c.label || c.text || `Choice #${c.id}`;
          if (condVal && condVal === val) o.selected = true;
          selVal.appendChild(o);
        });

        tdVal.appendChild(selVal);

        setRowHint(
          tr,
          "Choice-based: equals/not-equals compares against choice.value when set; otherwise uses id:<pk>."
        );

        return;
      }

      // ---------------- FALLBACK: plain text value ------------------------
      hideMatrixHeaders();

      const inputVal = document.createElement("input");
      inputVal.type = "text";
      inputVal.className = VALUE_INPUT_CLASS;
      inputVal.placeholder = "e.g. 1 or 1,2,3";
      if (condVal) inputVal.value = condVal;
      tdVal.appendChild(inputVal);
      setRowHint(
        tr,
        "Enter a value to compare. For lists, choose IN/NOT IN and enter comma-separated values (e.g. 1,2,3)."
      );
    }

    function addRow(cond) {
      // cond: {q, op, val}
      const tr = document.createElement("tr");

      const tdQ   = document.createElement("td");
      const tdCol = document.createElement("td");
      const tdRow = document.createElement("td");
      const tdOp  = document.createElement("td");
      const tdVal = document.createElement("td");
      const tdAct = document.createElement("td");

      tdQ.className   = "py-1 pr-2";
      tdCol.className = "py-1 pr-2";
      tdRow.className = "py-1 pr-2";
      tdOp.className  = "py-1 pr-2";
      tdVal.className = "py-1 pr-2";
      tdAct.className = "py-1 text-center";

      tdQ.setAttribute("data-role", "logic-q-cell");
      tdCol.setAttribute("data-role", "logic-col-cell");
      tdRow.setAttribute("data-role", "logic-row-cell");
      tdOp.setAttribute("data-role", "logic-op-cell");
      tdVal.setAttribute("data-role", "logic-val-cell");

      // --- Question select (limited to earlier questions) ---
      const selQ = document.createElement("select");
      selQ.className = "w-full bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1";
      const optEmpty = document.createElement("option");
      optEmpty.value = "";
      optEmpty.textContent = "-- choose question --";
      selQ.appendChild(optEmpty);

      (currentEligibleQuestions || logicQuestions).forEach(q => {
        const o   = document.createElement("option");
        const ref = q.code || String(q.id);
        o.value = ref;
        o.textContent = `${ref} — ${q.text}`;
        selQ.appendChild(o);
      });


      // Parse q key from cond (handles MATRIX composite keys)
      let baseQRef    = "";
      let matrixColKey = null;
      let sbsGroupSlug = null;
      let sbsRowKey    = null;

      if (cond && cond.q) {
        if (typeof cond.q === "string" && cond.q.includes("::col::")) {
          const parts = cond.q.split("::col::");
          baseQRef    = parts[0] || "";
          matrixColKey = parts[1] || null;
        } else if (typeof cond.q === "string" && cond.q.includes("::sbs::")) {
          const [head, tail] = cond.q.split("::sbs::");
          baseQRef = head || "";
          const segments = (tail || "").split("::");
          for (let i = 0; i < segments.length; i += 2) {
            const k = segments[i];
            const v = segments[i + 1];
            if (k === "group") sbsGroupSlug = v;
            if (k === "row")   sbsRowKey    = v;
          }
        } else {
          baseQRef = String(cond.q);
        }
      }

      if (baseQRef) selQ.value = baseQRef;
      if (matrixColKey != null) tr.dataset.matrixColKey = matrixColKey;
      if (sbsGroupSlug != null) tr.dataset.sbsGroupSlug = sbsGroupSlug;
      if (sbsRowKey != null)    tr.dataset.sbsRowKey    = sbsRowKey;

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

      // --- Remove button ---
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn-shell";
      btnDel.innerHTML = '<span class="btn-ui text-xs">🗑</span>';
      btnDel.addEventListener("click", () => { tr.remove(); });
      tdAct.appendChild(btnDel);

      tr.appendChild(tdQ);
      tr.appendChild(tdCol);
      tr.appendChild(tdRow);
      tr.appendChild(tdOp);
      tr.appendChild(tdVal);
      tr.appendChild(tdAct);

      // HINT ROW (second row)
      const trHint = document.createElement("tr");
      trHint.setAttribute("data-role", "logic-hint-row");

      // Left spacer: spans Question + Column/Group + Row + Operator = 4 cols
      const tdSpacer = document.createElement("td");
      tdSpacer.colSpan = 4;
      tdSpacer.className = "pt-0 pb-2";

      // Hint cell: spans Value (+ Actions). If you want ONLY Value, set colSpan = 1.
      const tdHint = document.createElement("td");
      tdHint.colSpan = 2; // Value + Actions (use 1 if you want Value only)
      tdHint.className = "pt-0 pb-2";

      const hint = document.createElement("div");
      hint.setAttribute("data-role", "logic-hint");
      hint.className = "text-[11px] text-gray-400 leading-snug whitespace-normal break-words";
      hint.style.display = "none";

      // Ensure it doesn’t affect widths; keeps wrapping within the right area
      hint.style.maxWidth = "100%";

      tdHint.appendChild(hint);

      trHint.appendChild(tdSpacer);
      trHint.appendChild(tdHint);

      // default hidden until text is set
      trHint.style.display = "none";

      tbody.appendChild(tr);
      tbody.appendChild(trHint);

      // Store a reference so renderEditorsForRow can update the right hint
      tr.dataset.hintRowId = ""; // optional

      // Initial editors for this row
      renderEditorsForRow(tr, cond || null);

      // Re-render when question or operator changes (operator affects in/not_in behaviour)
      selQ.addEventListener("change", () => {
        delete tr.dataset.matrixColKey;
        delete tr.dataset.sbsGroupSlug;
        delete tr.dataset.sbsRowKey;
        renderEditorsForRow(tr, null);
      });
      selOp.addEventListener("change", () => {
        renderEditorsForRow(tr, null);
      });
    }

    function loadFromTextarea() {
      currentData = null;
      if (!targetTextarea) return;

      const raw = (targetTextarea.value || "").trim();
      if (!raw) {
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

      const mode  = getModeFromData(currentData);
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
      const mode = getSelectedMode();
      const rows = Array.from(tbody.querySelectorAll("tr"));
      const conds = [];

      for (const tr of rows) {
        const tdQ   = tr.querySelector('td[data-role="logic-q-cell"]');
        const tdOp  = tr.querySelector('td[data-role="logic-op-cell"]');
        const tdVal = tr.querySelector('td[data-role="logic-val-cell"]');
        if (!tdQ || !tdOp || !tdVal) continue;

        const selQ  = tdQ.querySelector("select");
        const selOp = tdOp.querySelector("select");
        if (!selQ || !selOp) continue;

        const qRefBase = (selQ.value || "").trim();
        const op       = (selOp.value || "eq").trim();
        if (!qRefBase || !op) continue;

        const meta = getQuestionMetaByRef(qRefBase);

        // Grab raw value from value cell (text or select)
        let rawVal = "";
        const textInp = tdVal.querySelector('input[type="text"]');
        if (textInp) {
          rawVal = (textInp.value || "").trim();
        } else {
          const valSel = tdVal.querySelector("select");
          if (valSel) rawVal = (valSel.value || "").trim();
        }

        let qKey = qRefBase;
        let val;

        // --- MATRIX single/multi: include column key ----------------------
        if (
          meta &&
          meta.question_type === "MATRIX" &&
          meta.matrix_mode !== "side_by_side"
        ) {
          const selCol = tr.querySelector('select[data-role="matrix-col-select"]');
          const colKey = selCol ? (selCol.value || "").trim() : "";
          if (!colKey) continue; // must choose a column

          qKey = `${qRefBase}::col::${colKey}`;

          if (!rawVal) continue; // require value (e.g. 1/0)

          if (rawVal.includes(",")) {
            val = rawVal.split(",").map(s => s.trim()).filter(Boolean);
          } else {
            val = rawVal;
          }
        }
        // --- MATRIX SBS: include group and row --------------------------
        else if (
          meta &&
          meta.question_type === "MATRIX" &&
          meta.matrix_mode === "side_by_side"
        ) {
          const selGroup = tr.querySelector('select[data-role="sbs-group-select"]');
          const selRow   = tr.querySelector('select[data-role="sbs-row-select"]');
          const groupSlug = selGroup ? (selGroup.value || "").trim() : "";
          const rowKey    = selRow ? (selRow.value || "").trim() : "";

          if (!groupSlug || !rowKey) continue; // must choose both

          qKey = `${qRefBase}::sbs::group::${groupSlug}::row::${rowKey}`;

          if (!rawVal) continue; // require value (e.g. 2)
          if (rawVal.includes(",")) {
            val = rawVal.split(",").map(s => s.trim()).filter(Boolean);
          } else {
            val = rawVal;
          }
        }
        // --- Non-matrix / normal questions ------------------------------
        else {
          if (!rawVal) continue;
          if (rawVal.includes(",")) {
            val = rawVal.split(",").map(s => s.trim()).filter(Boolean);
          } else {
            val = rawVal;
          }
        }

        conds.push({ q: qKey, op, val });
      }

      if (!conds.length) return {};
      const wrapperKey = mode === "any" ? "any" : "all";
      return { [wrapperKey]: conds };
    }

    // --- wiring -----------------------------------------------------------

    function recomputeMatrixHeaders() {
      const rows = Array.from(tbody.querySelectorAll("tr"));
      let hasMultiSingle = false;
      let hasSbs = false;

      rows.forEach(tr => {
        const selQ = tr.querySelector("td:nth-child(1) select");
        if (!selQ) return;

        const ref = (selQ.value || "").trim();
        const qMeta = getQuestionMetaByRef(ref);
        if (!qMeta || qMeta.question_type !== "MATRIX") return;

        if (qMeta.matrix_mode === "side_by_side") {
          hasSbs = true;
        } else {
          hasMultiSingle = true;
        }
      });

      if (hasSbs) {
        showMatrixHeaders("sbs");
      } else if (hasMultiSingle) {
        showMatrixHeaders("multi_single");
      } else {
        showMatrixHeaders("none");
      }
    }

    btnOpen.addEventListener("click", function () {
      const targetId = this.dataset.builderTarget || "id_visibility_rules";
      targetTextarea = document.getElementById(targetId);
      if (!targetTextarea) {
        alert("Cannot find visibility rules field.");
        return;
      }

      // Only earlier questions (by sort_index)
      const currentMeta = getCurrentQuestionMeta();
      if (currentMeta && typeof currentMeta.sort_index === "number") {
        currentEligibleQuestions = logicQuestions
          .filter(q => q.sort_index < currentMeta.sort_index)
          .sort((a, b) =>
            (a.sort_index - b.sort_index) || (a.id - b.id)
          );
      } else {
        currentEligibleQuestions = logicQuestions.slice();
      }

      // reset headers on each open
      showMatrixHeaders("none");

      loadFromTextarea();        // this calls addRow(...) for each condition
      recomputeMatrixHeaders();  // align headers with whatever we just loaded

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
        targetTextarea.value = "";
      } else {
        targetTextarea.value = JSON.stringify(data);
      }
      closeModal();
    });

    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });

  })();
});
