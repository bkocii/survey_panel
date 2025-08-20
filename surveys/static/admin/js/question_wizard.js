// question_wizard.js
let previousQuestionType = null;

document.addEventListener("DOMContentLoaded", function () {

    // 🔄 Show/hide specific question field groups based on selected type
    function updateFieldVisibility() {
        const type = document.getElementById("id_question_type")?.value;
        const fieldGroups = document.querySelectorAll(".question-field");

        // Hide all custom fields by default
        fieldGroups.forEach(group => group.style.display = "none");


        // Always-visible fields
        const alwaysFields = [
            "code-field", "text-field", "question_type-field", "required-field",
            "helper_text-field", "helper_media-field", "helper_media_type-field", "lookup-field"
        ];
        alwaysFields.forEach(cls => {
            document.querySelector("." + cls)?.style.setProperty("display", "block");
        });

        // Show choices-related fields
        if (["SINGLE_CHOICE", "MULTI_CHOICE", "DROPDOWN", "RATING", "IMAGE_CHOICE", "IMAGE_RATING"].includes(type)) {
            document.querySelector(".choices-field")?.style.setProperty("display", "block");
        }

        // Show slider-specific fields
        if (type === "SLIDER") {
            ["min_value-field", "max_value-field", "step_value-field"].forEach(cls => {
                document.querySelector("." + cls)?.style.setProperty("display", "block");
            });
        }

        // Media-specific flag
        if (["PHOTO_UPLOAD", "PHOTO_MULTI_UPLOAD", "VIDEO_UPLOAD", "AUDIO_UPLOAD"].includes(type)) {
            document.querySelector(".allow_multiple_files-field")?.style.setProperty("display", "block");
        }

        // For multiple image choice
        if (type === "IMAGE_CHOICE") {
            document.querySelector(".allows_multiple-field")?.style.setProperty("display", "block");
        }

        // Matrix type
        if (type === "MATRIX") {
            document.querySelector(".matrix_mode-field")?.style.setProperty("display", "block");
        }
        window.updatePreview = updatePreview;

    }

    // 📦 Show/hide and reset inline form blocks (Choices, Matrix rows/cols)
    let previousQuestionType = null;

    function toggleInlinesByType() {
        const type = document.getElementById("id_question_type")?.value;

        const inlineBlocks = {
            "choice-inline": {
                prefix: "choices",
                types: ["SINGLE_CHOICE", "MULTI_CHOICE", "RATING", "DROPDOWN", "IMAGE_CHOICE", "IMAGE_RATING"]
            },
            "matrix-row-inline": {
                prefix: "matrix_rows",
                types: ["MATRIX"]
            },
            "matrix-column-inline": {
                prefix: "matrix_cols",
                types: ["MATRIX"]
            },
        };

        const shouldShow = new Set();

        // Determine which blocks to show
        Object.entries(inlineBlocks).forEach(([inlineId, config]) => {
            if (config.types.includes(type)) {
                shouldShow.add(inlineId);
            }
        });

        // Clear all and toggle visibility
        Object.entries(inlineBlocks).forEach(([inlineId, config]) => {
            const wrapper = document.getElementById(inlineId);
            const container = document.getElementById(`${config.prefix}-forms`);
            const totalForms = document.getElementById(`id_${config.prefix}-TOTAL_FORMS`);

            const shouldForceClear =
                previousQuestionType !== type || !shouldShow.has(inlineId);

            if (shouldForceClear && container && totalForms) {
                container.innerHTML = "";           // ✅ Actually removes DOM elements
                totalForms.value = "0";
            }

            if (wrapper) {
                if (shouldShow.has(inlineId)) {
                    wrapper.classList.remove("hidden");
                } else {
                    wrapper.classList.add("hidden");
                }
            }
        });

        previousQuestionType = type;

        if (typeof updatePreview === "function") updatePreview();
    }

    function buildChoiceRow(index) {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-gray-700';

      // helper
      const td = (cls='px-3 py-2 align-middle') => { const el=document.createElement('td'); el.className=cls; return el; };

      // ---- 1) Value
      const tdValue = td();
      const inpValue = document.createElement('input');
      inpValue.type = 'number';
      inpValue.name = `choices-${index}-value`;
      inpValue.id   = `id_choices-${index}-value`;
      inpValue.className = 'w-full rounded border border-gray-700 bg-gray-900 text-white h-9 px-2';
      tdValue.appendChild(inpValue);
      tr.appendChild(tdValue);

      // ---- 2) Text
      const tdText = td();
      const inpText = document.createElement('input');
      inpText.type = 'text';
      inpText.name = `choices-${index}-text`;
      inpText.id   = `id_choices-${index}-text`;
      inpText.className = 'w-full rounded border border-gray-700 bg-gray-900 text-white h-9 px-2';
      tdText.appendChild(inpText);
      tr.appendChild(tdText);

     // ---- 3) Next question
    const tdNext = td();
    const sel = document.createElement('select');
    sel.name = `choices-${index}-next_question`;
    sel.id   = `id_choices-${index}-next_question`;
    sel.className = 'w-full rounded border border-gray-700 bg-gray-900 text-white h-9 px-2';

    // Prefer the hidden pool rendered by the template
    const pool = document.getElementById('next-question-options');
    if (pool && pool.options && pool.options.length) {
      // clone all options from the pool (first one should already be the placeholder)
      for (const o of pool.options) sel.appendChild(o.cloneNode(true));
    } else {
      // fallback: try copying from any existing next_question select on the page
      const serverSelect = document.querySelector('[id^="id_choices-"][id$="-next_question"]');
      if (serverSelect && serverSelect.options.length) {
        for (const o of serverSelect.options) sel.appendChild(o.cloneNode(true));
      } else {
        // final fallback: just a placeholder
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = '---------';
        sel.appendChild(opt0);
      }
    }

    tdNext.appendChild(sel);
    tr.appendChild(tdNext);

      // ---- 4) Image (ONLY if image type)
      const tdImg = td();
      tdImg.dataset.col = 'image'; // mark column
      if (isImageChoiceType()) {
        const inpFile = document.createElement('input');
        inpFile.type = 'file';
        inpFile.name = `choices-${index}-image`;
        inpFile.id   = `id_choices-${index}-image`;
        inpFile.className = 'block w-full text-sm';
        tdImg.appendChild(inpFile);
        tdImg.style.display = '';   // visible
      } else {
        // do NOT create the file input at all; keep the cell hidden to match the table structure
        tdImg.style.display = 'none';
      }
      tr.appendChild(tdImg);

      // ---- 5) DELETE
      const tdDel = td('px-3 py-2 align-middle text-center');
      const del = document.createElement('input');
      del.type = 'checkbox';
      del.name = `choices-${index}-DELETE`;
      del.id   = `id_choices-${index}-DELETE`;
      tdDel.appendChild(del);
      tr.appendChild(tdDel);

      return tr;
    }

    function buildMatrixRow(index) {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-gray-700';
      const td = (cls='px-3 py-2 align-middle') => { const el=document.createElement('td'); el.className=cls; return el; };

      // 1) value
      const tdVal = td();
      const val = document.createElement('input');
      val.type = 'number'; val.name = `matrix_rows-${index}-value`; val.id = `id_matrix_rows-${index}-value`;
      val.className = 'w-full rounded border border-gray-700 bg-gray-900 text-white h-9 px-2';
      tdVal.appendChild(val); tr.appendChild(tdVal);

      // 2) text
      const tdText = td();
      const txt = document.createElement('input');
      txt.type = 'text'; txt.name = `matrix_rows-${index}-text`; txt.id = `id_matrix_rows-${index}-text`;
      txt.className = 'w-full rounded border border-gray-700 bg-gray-900 text-white h-9 px-2';
      tdText.appendChild(txt); tr.appendChild(tdText);

      // 3) required
      const tdReq = td('px-3 py-2 align-middle text-center');
      const req = document.createElement('input');
      req.type = 'checkbox'; req.name = `matrix_rows-${index}-required`; req.id = `id_matrix_rows-${index}-required`;
      req.checked = true; // your default
      tdReq.appendChild(req); tr.appendChild(tdReq);


      // 4) delete
      const tdDel = td('px-3 py-2 align-middle text-center');
      const del = document.createElement('input'); del.type='checkbox'; del.name=`matrix_rows-${index}-DELETE`; del.id=`id_matrix_rows-${index}-DELETE`;
      tdDel.appendChild(del); tr.appendChild(tdDel);

      return tr;
    }

    function buildMatrixCol(index) {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-gray-700';
      const td = (cls='px-3 py-2 align-middle') => { const el=document.createElement('td'); el.className=cls; return el; };

      // 1) value
      const cVal = td(); const val = document.createElement('input');
      val.type='number'; val.name=`matrix_cols-${index}-value`; val.id=`id_matrix_cols-${index}-value`;
      val.className='w-full rounded border border-gray-700 bg-gray-900 text-white h-9 px-2';
      cVal.appendChild(val); tr.appendChild(cVal);

      // 2) label
      const cLab = td(); const lab = document.createElement('input');
      lab.type='text'; lab.name=`matrix_cols-${index}-label`; lab.id=`id_matrix_cols-${index}-label`;
      lab.className='w-full rounded border border-gray-700 bg-gray-900 text-white h-9 px-2';
      cLab.appendChild(lab); tr.appendChild(cLab);

      // 3) group (advanced)
      const cGroup = td(); cGroup.dataset.advcol = 'true';
      const grp = document.createElement('input');
      grp.type='text'; grp.name=`matrix_cols-${index}-group`; grp.id=`id_matrix_cols-${index}-group`;
      grp.className='w-full rounded border border-gray-700 bg-gray-900 text-white h-9 px-2';
      cGroup.appendChild(grp); tr.appendChild(cGroup);

      // 4) input_type (advanced)
      const cType = td(); cType.dataset.advcol = 'true';
      const typ = document.createElement('select');
      typ.name=`matrix_cols-${index}-input_type`; typ.id=`id_matrix_cols-${index}-input_type`;
      typ.className='w-full rounded border border-gray-700 bg-gray-900 text-white h-9 px-2';
      ['text','select','radio','checkbox'].forEach(v => { const o=document.createElement('option'); o.value=v; o.textContent=v.charAt(0).toUpperCase()+v.slice(1); typ.appendChild(o); });
      cType.appendChild(typ); tr.appendChild(cType);

      // 5) required
      const cReq = td('px-3 py-2 align-middle text-center');
      const req = document.createElement('input'); req.type='checkbox'; req.name=`matrix_cols-${index}-required`; req.id=`id_matrix_cols-${index}-required`;
      cReq.appendChild(req); tr.appendChild(cReq);

      // 6) delete
      const cDel = td('px-3 py-2 align-middle text-center');
      const del = document.createElement('input'); del.type='checkbox'; del.name=`matrix_cols-${index}-DELETE`; del.id=`id_matrix_cols-${index}-DELETE`;
      cDel.appendChild(del); tr.appendChild(cDel);

      return tr;
}

    function applyMatrixColsAdvancedVisibility(root=document) {
      const modeEl = document.getElementById('id_matrix_mode');
      const isSBS = modeEl && modeEl.value === 'side_by_side';

      // headers
      root.querySelectorAll('th[data-advcol]').forEach(th => {
        th.style.display = isSBS ? '' : 'none';
      });
      // cells + disable inputs when hidden
      root.querySelectorAll('[data-advcol]').forEach(td => {
        td.style.display = isSBS ? '' : 'none';
        td.querySelectorAll('input,select,textarea').forEach(ip => {
          ip.disabled = !isSBS;
          if (!isSBS) ip.value = ''; // optional: clear to avoid stray posts
        });
      });
    }

    // run now (we're already inside DOMContentLoaded) and wire change listener
    applyMatrixColsAdvancedVisibility(document);
    const matrixModeEl = document.getElementById('id_matrix_mode');
    if (matrixModeEl) {
      matrixModeEl.addEventListener('change', () => {
        // OPTIONAL confirm; comment out this block if you never want a prompt
        const rowsCount = (document.querySelectorAll('#matrix_rows-forms tr').length || 0);
        const colsCount = (document.querySelectorAll('#matrix_cols-forms tr').length || 0);
        const hasAny = rowsCount + colsCount > 0;

        if (!hasAny || confirm('Switching matrix mode will clear existing rows and columns. Continue?')) {
          clearMatrixFormsets();
        } else {
          // revert select back if user cancels
          matrixModeEl.value = matrixModeEl.dataset.prevValue || matrixModeEl.value;
          applyMatrixColsAdvancedVisibility(document);
        }
        // store the last chosen value for future cancel reversions
        matrixModeEl.dataset.prevValue = matrixModeEl.value;
      });

      // seed prevValue on load
      matrixModeEl.dataset.prevValue = matrixModeEl.value;
    }


    // --- Matrix mode helpers ---
    // wipe one inline formset table and reset its management form
    function resetFormset(prefix) {
      const container   = document.getElementById(`${prefix}-forms`);
      const totalForms  = document.getElementById(`id_${prefix}-TOTAL_FORMS`);
      if (!container || !totalForms) return;

      container.innerHTML = "";       // remove all rows
      totalForms.value = "0";         // reset management count
    }

    // clear both matrix formsets
    function clearMatrixFormsets() {
      resetFormset('matrix_rows');
      resetFormset('matrix_cols');
      if (typeof applyMatrixColsAdvancedVisibility === 'function') {
        applyMatrixColsAdvancedVisibility(document);
      }
      if (typeof updatePreview === 'function') updatePreview();
    }

    function applyChoiceImageVisibility(root = document) {
      const typeEl = document.getElementById("id_question_type");
      if (!typeEl) return;

      // only show for image choice/rating
      const show = (typeEl.value === "IMAGE_CHOICE" || typeEl.value === "IMAGE_RATING");

      // find the choices table
      const tbody = (root.getElementById ? root.getElementById('choices-forms')
                                         : document.getElementById('choices-forms'));
      if (!tbody) return;
      const table = tbody.closest('table');
      if (!table) return;

      // helper: find column index either by header label OR by detecting a file input in first row
      const getImageColIndex = () => {
        // 1) try header text
        if (table.tHead && table.tHead.rows.length) {
          const ths = Array.from(table.tHead.rows[0].cells);
          const byText = ths.findIndex(th => th.textContent.trim().toLowerCase() === 'image');
          if (byText >= 0) return byText;
        }
        // 2) try to detect file input in first body row
        const tr0 = table.tBodies[0] && table.tBodies[0].rows[0];
        if (tr0) {
          for (let i = 0; i < tr0.cells.length; i++) {
            if (tr0.cells[i].querySelector('input[type="file"]')) return i;
          }
        }
        // 3) fallback to the most common layout (Value, Text, Next, Image, Delete)
        return 3;
      };

      const imgColIdx = getImageColIndex();

      // hide/show header cell (if present)
      if (table.tHead && table.tHead.rows.length) {
        const th = table.tHead.rows[0].cells[imgColIdx];
        if (th) th.style.display = show ? '' : 'none';
      }

      // hide/show each row’s cell and disable the input when hidden
      Array.from(tbody.rows).forEach(tr => {
        const td = tr.cells[imgColIdx];
        if (!td) return;
        td.style.display = show ? '' : 'none';
        td.querySelectorAll('input[type="file"]').forEach(inp => {
          inp.disabled = !show;
          if (!show) { try { inp.value = ''; } catch (_) {} }
        });
      });
    }
    // export function for other files
    window.applyChoiceImageVisibility = applyChoiceImageVisibility;

    // 🧩 Add a new form to the specified formset (choices, rows, cols)
    function addForm(prefix) {
      const totalForms = document.getElementById(`id_${prefix}-TOTAL_FORMS`);
      const container  = document.getElementById(`${prefix}-forms`);
      const template   = document.getElementById(`${prefix}-template`);

      if (!totalForms || !container) {
        console.error("Missing elements for prefix:", prefix);
        return null;
      }

      // remove placeholder empty row if present
      const emptyRow = container.querySelector('tr[data-empty-row]');
      if (emptyRow) emptyRow.remove();

      const formCount = parseInt(totalForms.value || '0', 10);

      // TABLE PATH: build a proper <tr> for TBODY containers
      if (container.tagName === 'TBODY') {
        let tr = null;
        if (prefix === 'choices') {
          tr = buildChoiceRow(formCount);
        } else if (prefix === 'matrix_rows') {
          tr = buildMatrixRow(formCount);
        } else if (prefix === 'matrix_cols') {
          tr = buildMatrixCol(formCount);
        }
        if (tr) {
          // apply SBS visibility rules for matrix cols on new row
          if (prefix === 'matrix_cols' && typeof applyMatrixColsAdvancedVisibility === 'function') {
            applyMatrixColsAdvancedVisibility(tr);
          }
          tr.querySelectorAll('input, select, textarea').forEach(el => {
            el.addEventListener('input', updatePreview);
            el.addEventListener('change', updatePreview);
          });
          container.appendChild(tr);
          totalForms.value = formCount + 1;
          updatePreview();
          return { node: tr, index: formCount };
        }
      }

      // FALLBACK PATH: legacy template (may return <div>)
      if (!template) {
        console.error("Missing template for prefix:", prefix);
        return null;
      }

      const html = template.innerHTML.trim().replaceAll('__prefix__', formCount);
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      let newNode = doc.body.firstElementChild; // NOTE: no re-declare (fixed)

      if (!newNode) {
        console.error("Could not parse new form");
        return null;
      }

      // If inserting into TBODY and template isn't a TR, wrap it
        if (container.tagName === 'TBODY' && newNode.tagName !== 'TR') {
          const tr = document.createElement('tr');
          tr.className = 'border-t border-gray-700';
          const td = document.createElement('td');
          td.className = 'px-3 py-2 align-top';
          // detect header length for the table this TBODY belongs to
          const head = container.closest('table')?.tHead;
          td.colSpan = head?.rows?.[0]?.cells?.length || 1;
          td.appendChild(newNode);
          tr.appendChild(td);
          newNode = tr;
        }

      // Pre-check "required" for matrix rows
      if (prefix === 'matrix_rows') {
        const req = newNode.querySelector("input[type='checkbox'][name$='-required']");
        if (req) req.checked = true;
      }

      container.appendChild(newNode);
      totalForms.value = formCount + 1;

      newNode.querySelectorAll("input, select, textarea").forEach(input => {
        input.addEventListener("input", updatePreview);
        input.addEventListener("change", updatePreview);
      });

      updatePreview();

      // If we just added a choice row, re-apply image visibility so the new row follows the rule
      if (prefix === 'choices') applyChoiceImageVisibility(document);   // <= add this line

      return { node: newNode, index: formCount };
    }

    // 🔍 Generate live question preview
    function updatePreview() {
      const preview = document.getElementById("question-preview");
      const type = document.getElementById("id_question_type")?.value;
      const text = document.getElementById("id_text")?.value || "";
      const helper = document.getElementById("id_helper_text")?.value || "";

      let html = `<h3 class="font-bold text-lg">${text}</h3>`;
      if (helper) html += `<p class="text-sm text-gray-500 dark:text-gray-400">${helper}</p>`;

      // Show choices
      if (["SINGLE_CHOICE", "MULTI_CHOICE", "DROPDOWN", "IMAGE_CHOICE"].includes(type)) {
        html += "<ul class='list-disc list-inside'>";
        document.querySelectorAll('[id^="id_choices-"][id$="-text"]').forEach(input => {
          if (input.value.trim()) html += `<li>${input.value}</li>`;
        });
        html += "</ul>";
      }

      // Show matrix table
      if (type === "MATRIX") {
        const rows = document.querySelectorAll('[id^="id_matrix_rows-"][id$="-text"]');
        const cols = document.querySelectorAll('[id^="id_matrix_cols-"][id$="-label"]');

        html += "<table class='table-auto w-full border text-left mt-2 text-sm'>";
        html += "<thead><tr><th></th>";
        cols.forEach(col => {
          if (col.value.trim()) html += `<th class="px-2 py-1 border">${col.value}</th>`;
        });
        html += "</tr></thead><tbody>";

        rows.forEach(row => {
          if (row.value.trim()) {
            html += `<tr><td class="px-2 py-1 border font-semibold">${row.value}</td>`;
            cols.forEach(() => {
              html += "<td class='px-2 py-1 border'><input type='radio' disabled></td>";
            });
            html += "</tr>";
          }
        });

        html += "</tbody></table>";
      }

      // ✅ Use template-provided placeholder (lets you control color), fallback if missing
      const tpl = document.getElementById("preview-placeholder");
      const placeholder = tpl ? tpl.innerHTML
                              : "<em class='text-gray-400 dark:text-gray-500 italic'>Start typing…</em>";
      preview.innerHTML = html || placeholder;
    }

    previousQuestionType = document.getElementById("id_question_type")?.value;

    // Initialize modal manager with the current question type
    ModalManager.init(document.getElementById("id_question_type")?.value);

    // 🧠 Initial setup on page load
    toggleInlinesByType();
    updateFieldVisibility();
    updatePreview();
    applyChoiceImageVisibility(document);

    // 🔁 Bind dynamic preview to existing inputs
    document.querySelectorAll("input, select, textarea").forEach(input => {
        input.addEventListener("input", updatePreview);
        input.addEventListener("change", updatePreview);
    });

    // 🧲 Bind add-form buttons
    document.querySelectorAll(".add-form-btn").forEach(button => {
        button.addEventListener("click", function () {
            const prefix = this.dataset.prefix;
            addForm(prefix);
        });
    });

    // 🧩 Re-run logic on question type change
    document.getElementById("id_question_type")?.addEventListener("change", function () {
        const newType = this.value;

        ModalManager.handleQuestionTypeSwitch(
            previousQuestionType,
            newType,
            function confirmedSwitch(type) {
                document.getElementById("id_question_type").value = type;
                toggleInlinesByType();
                updateFieldVisibility();
                updatePreview();
                applyChoiceImageVisibility(document);
                previousQuestionType = type;
            }
        );
    });

    // Handle question lookup and auto-fill form
    document.getElementById("question_lookup")?.addEventListener("change", async function () {
        const selectedId = this.value;
        // optional flag if you ever want to re-enable copying next_q
        const COPY_ROUTING = false;

        // If no question is selected, reset form
        if (!selectedId) {
            resetFormFields();
            clearInlineForms();
            updatePreview();
            return;
        }

        try {
            const response = await fetch(`/surveys/api/question-data/${selectedId}/`);
            const data = await response.json();

            // === Fill basic fields ===
            document.getElementById("id_text").value = data.text || "";
            document.getElementById("id_code").value = '';
            document.getElementById("id_question_type").value = data.question_type || "";
            document.getElementById("id_helper_text").value = data.helper_text || "";
            document.getElementById("id_matrix_mode").value = data.matrix_mode || "";

            document.getElementById("id_min_value").value = data.min_value ?? "";
            document.getElementById("id_max_value").value = data.max_value ?? "";
            document.getElementById("id_step_value").value = data.step_value ?? "";

            document.getElementById("id_allows_multiple").checked = !!data.allows_multiple;
            document.getElementById("id_allow_multiple_files").checked = !!data.allow_multiple_files;

            // Media (if applicable)
            if (data.helper_media) {
                const existingLabel = document.getElementById("helper-media-label");
                if (existingLabel) existingLabel.remove();

                const label = document.createElement("div");
                label.id = "helper-media-label";
                label.className = "mt-2 text-sm text-gray-500";
                label.innerHTML = `Existing media: <a href="${data.helper_media}" target="_blank" class="text-blue-600 underline">View File</a>`;
                document.getElementById("id_helper_media").parentElement.appendChild(label);
            }

            // Set media type
            document.getElementById("id_helper_media_type").value = data.helper_media_type || "";

            // === Trigger logic based on type ===
            updateFieldVisibility();
            toggleInlinesByType();

            // === Clear any existing inline forms ===
            clearInlineForms();

            // === Add choices ===
            if (data.choices?.length > 0) {
                data.choices.forEach(choice => {
                    addForm("choices");
                    const prefix = `id_choices-${document.getElementById("id_choices-TOTAL_FORMS").value - 1}`;
                    document.getElementById(`${prefix}-text`).value = choice.text;
                    document.getElementById(`${prefix}-value`).value = choice.value;
                });
            }

            // === Add matrix rows ===
            if (data.matrix_rows) {
                data.matrix_rows.forEach(row => {
                    addForm("matrix_rows");
                    const prefix = `id_matrix_rows-${document.getElementById("id_matrix_rows-TOTAL_FORMS").value - 1}`;
                    document.getElementById(`${prefix}-text`).value = row.text;
                    document.getElementById(`${prefix}-value`).value = row.value;
                    document.getElementById(`${prefix}-required`).checked = row.required;
                });
            }

            // === Add matrix columns ===
            if (data.matrix_cols) {
                data.matrix_cols.forEach(col => {
                    addForm("matrix_cols");
                    const prefix = `id_matrix_cols-${document.getElementById("id_matrix_cols-TOTAL_FORMS").value - 1}`;
                    document.getElementById(`${prefix}-label`).value = col.label;
                    document.getElementById(`${prefix}-value`).value = col.value;
                    document.getElementById(`${prefix}-input_type`).value = col.input_type;
                    document.getElementById(`${prefix}-required`).checked = col.required;
                    document.getElementById(`${prefix}-group`).value = col.group || "";
                    document.getElementById(`${prefix}-order`).value = col.order || "";
                });
            }

            updatePreview();
            applyChoiceImageVisibility(document);
        } catch (error) {
            console.error("Failed to load question data:", error);
            alert("Error loading question data. Please try again.");
        }
    });
    initQuestionLookupSearch();

    // === Helper to clear inline formsets ===
    function clearInlineForms() {
        const inlinePrefixes = ["choices", "matrix_rows", "matrix_cols"];
        inlinePrefixes.forEach(prefix => {
            const container = document.getElementById(`${prefix}-forms`);
            const totalForms = document.getElementById(`id_${prefix}-TOTAL_FORMS`);
            if (container && totalForms) {
                container.innerHTML = "";
                totalForms.value = "0";
            }
        });
    }

    // === Helper to reset all input fields to blank/default ===
    function resetFormFields() {
        const fieldsToReset = [
            "id_text", "id_code", "id_question_type", "id_helper_text", "id_matrix_mode",
            "id_min_value", "id_max_value", "id_step_value", "id_helper_media_type"
        ];

        fieldsToReset.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });

        document.getElementById("id_allows_multiple").checked = false;
        document.getElementById("id_allow_multiple_files").checked = false;

        const mediaInput = document.getElementById("id_helper_media");
        if (mediaInput) mediaInput.value = "";

        const existingLabel = document.getElementById("helper-media-label");
        if (existingLabel) existingLabel.remove();
    }

    // === Server-side question lookup (keeps dropdown visible) ===
    function initQuestionLookupSearch() {
      const container = document.getElementById('question_lookup_container');
      if (!container) return;

      const endpoint = container.dataset.endpoint;
      const selectEl = container.querySelector('#question_lookup');
      const inputEl  = container.querySelector('#question_lookup_search');
      const listEl   = container.querySelector('#question_lookup_results');

      if (!endpoint || !selectEl || !inputEl || !listEl) return;

      let currentIndex = -1;
      let items = [];
      let q = "";
      let page = 1;
      let hasNext = false;
      let inflight;
      let searching = false;
      // add near the top of the function
      let lastQuery = "";

    // helper: keep the highlighted item in view
    const ensureVisible = () => {
      const el = listEl.querySelector(`li[data-index="${currentIndex}"]`);
      if (!el) return;
      const elTop = el.offsetTop;
      const elBottom = elTop + el.offsetHeight;
      const viewTop = listEl.scrollTop;
      const viewBottom = viewTop + listEl.clientHeight;
      if (elTop < viewTop) listEl.scrollTop = elTop;
      else if (elBottom > viewBottom) listEl.scrollTop = elBottom - listEl.clientHeight;
    };

      const render = () => {
          listEl.innerHTML = "";
          listEl.classList.remove('hidden');
          inputEl.setAttribute('aria-expanded', 'true');

          if (searching) {
            const wait = document.createElement('li');
            wait.className = 'text-sm italic';
            wait.textContent = 'Searching…';
            listEl.appendChild(wait);
          }

          if (!items.length && !searching) {
            const empty = document.createElement('li');
            empty.className = 'text-sm opacity-70';
            empty.textContent = q ? `No results for “${q}”` : 'Type to search…';
            listEl.appendChild(empty);
            return;
          }

          const frag = document.createDocumentFragment();
          items.forEach((it, idx) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'option');
            li.dataset.id = it.id;
            li.dataset.index = idx;

            // base classes (avoid Tailwind hover here)
            li.className = 'dropdown-item'; // optional marker class

            // set text content
            li.innerHTML = `<div class="truncate" style="color:inherit">${it.label}</div>`;

            // mouse selection
            li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(idx); });

            // active row for keyboard nav
            if (idx === currentIndex) li.classList.add('active');

            frag.appendChild(li);
          });
          listEl.appendChild(frag);

          // ✅ call ensureVisible *inside* render, after appending items
          ensureVisible();
        };

      const choose = (idx) => {
        const it = items[idx];
        if (!it) return;
        // Update hidden select and fire change so your existing clone handler runs
        selectEl.innerHTML = `<option value="${it.id}" selected>${it.label}</option>`;
        selectEl.value = it.id;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        inputEl.value = it.label;
        close();
      };

      const close = () => {
        listEl.classList.add('hidden');
        inputEl.setAttribute('aria-expanded', 'false');
        currentIndex = -1;
      };

      const fetchPage = async (query, pageNum) => {
        if (inflight) inflight.abort?.();
        inflight = new AbortController();
        const url = `${endpoint}?q=${encodeURIComponent(query)}&page=${pageNum}&page_size=20`;
        const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, signal: inflight.signal });
        if (!res.ok) throw new Error(`Lookup failed: ${res.status}`);
        return res.json();
      };

      const debounced = (fn, ms=200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

      const search = debounced(async (query) => {
        q = (query || '').trim();
        page = 1;
        searching = true;
        render(); // keep old items visible + show "Searching…"
        try {
          const data = await fetchPage(q, page);
          items = data.results || [];
          hasNext = !!data.has_next;
        } catch (e) {
          console.error(e);
          items = []; hasNext = false;
        } finally {
          searching = false;
          currentIndex = -1;
          render();
        }
      }, 200);

      const loadMore = async () => {
        if (!hasNext) return;
        searching = true; render();
        try {
          const data = await fetchPage(q, ++page);
          (data.results || []).forEach(r => items.push(r));
          hasNext = !!data.has_next;
        } catch (e) { console.error(e); }
        finally { searching = false; render(); }
      };

      // Events
      inputEl.addEventListener('input', (e) => {
        const val = e.target.value;
        if (!val.trim()) {
          // Clear select and show "Type to search…"
          selectEl.innerHTML = '<option value=""></option>';
          selectEl.value = '';
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          items = []; q = ""; currentIndex = -1; searching = false; render();
          return;
        }
        search(val);
      });

      inputEl.addEventListener('focus', () => { render(); search(inputEl.value); });

      inputEl.addEventListener('keydown', async (e) => {
      const max = items.length - 1;

      if (e.key === 'ArrowDown') {
        if (max < 0) return;               // nothing to move to
        e.preventDefault();                 // keep focus in input, don’t move caret
        currentIndex = currentIndex < 0 ? 0 : Math.min(max, currentIndex + 1);
        // if we hit the end and there is more, load next page then advance
        if (currentIndex === max && hasNext) {
          await loadMore();
          currentIndex = Math.min(items.length - 1, currentIndex + 1);
        }
        render();
        return;
      }

      if (e.key === 'ArrowUp') {
        if (max < 0) return;
        e.preventDefault();
        currentIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
        render();
        return;
      }

      if (e.key === 'Enter') {
        if (!listEl.classList.contains('hidden') && currentIndex >= 0) {
          e.preventDefault();
          choose(currentIndex);
        }
        return;
      }

      if (e.key === 'Escape') {
        // optional: close only the list, keep input focused
        listEl.classList.add('hidden');
        inputEl.setAttribute('aria-expanded', 'false');
        return;
      }
    });


      document.addEventListener('click', (e) => {
        if (!listEl.contains(e.target) && e.target !== inputEl) close();
      });
    }

    // 🚫 Prevent Enter from submitting the form
    disableEnterSubmit('#question-form'); // change selector if your form has a different id

    function disableEnterSubmit(formSelector) {
      const form = document.querySelector(formSelector) || document.querySelector('form');
      if (!form) return;

      form.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;

        const el   = e.target;
        const tag  = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();

        // Allow explicit opt-in zones: <div data-allow-enter="true">...</div>
        if (el.dataset.allowEnter === 'true' || el.closest('[data-allow-enter="true"]')) return;

        // Allow Enter inside textareas or contenteditable
        if (tag === 'textarea' || el.isContentEditable) return;

        // In our search box, we handle Enter ourselves (choose selection), so prevent submit
        if (el.id === 'question_lookup_search') { e.preventDefault(); return; }

        // Block default Enter (prevents accidental form submit)
        e.preventDefault();
      });
    }

    function isImageChoiceType() {
      const t = document.getElementById('id_question_type')?.value;
      return t === 'IMAGE_CHOICE' || t === 'IMAGE_RATING';
}



    // 🔓 Make `addForm` accessible globally (optional)
    window.addForm = addForm;

});


