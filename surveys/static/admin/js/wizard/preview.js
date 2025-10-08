// surveys/static/admin/js/wizard/preview.js
(function (w, d) {
  function h(s) { return (s ?? "").toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function v(id) { const el = d.getElementById(id); return el ? el.value || "" : ""; }
  function bool(id) { const el = d.getElementById(id); return !!(el && el.checked); }

  function twInput(base = "") {
    return `block w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-slate-100 placeholder-slate-400 ${base}`;
  }
  function twCheck() {
    return "h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-2 focus:ring-indigo-500";
  }
  function twBadge() {
    return "inline-flex items-center rounded-md bg-slate-800/70 px-2 py-0.5 text-[11px] font-medium text-slate-300 ring-1 ring-inset ring-slate-700";
  }


  // ------- Collectors (robust to deletions/reordering) -------
  function collectChoices() {
    const items = [];
    d.querySelectorAll('[id^="id_choices-"][id$="-text"]').forEach(inp => {
      const m = inp.id.match(/^id_choices-(\d+)-text$/);
      if (!m) return;
      const idx = m[1];
      const row = inp.closest('tr');
      const delEl = row?.querySelector(`#id_choices-${idx}-DELETE`);
      if (delEl && delEl.checked) return;

      const text = (inp.value || "").trim();
      if (!text) return;

      const valEl = row?.querySelector(`#id_choices-${idx}-value`);
      const imgEl = row?.querySelector(`#id_choices-${idx}-image`);
      items.push({
        text,
        value: valEl ? valEl.value : "",
        imageName: imgEl?.files && imgEl.files[0] ? imgEl.files[0].name : ""
      });
    });
    return items;
  }

  function collectMatrixRows() {
    const rows = [];
    d.querySelectorAll('[id^="id_matrix_rows-"][id$="-text"]').forEach(inp => {
      const m = inp.id.match(/^id_matrix_rows-(\d+)-text$/);
      if (!m) return;
      const idx = m[1];
      const rowEl = inp.closest('tr');
      const delEl = rowEl?.querySelector(`#id_matrix_rows-${idx}-DELETE`);
      if (delEl && delEl.checked) return;

      const text = (inp.value || "").trim();
      if (!text) return;

      const valEl = rowEl?.querySelector(`#id_matrix_rows-${idx}-value`);
      const reqEl = rowEl?.querySelector(`#id_matrix_rows-${idx}-required`);
      rows.push({
        id: idx,
        text,
        value: valEl ? valEl.value : "",
        required: !!(reqEl && reqEl.checked)
      });
    });
    return rows;
  }

  function collectMatrixCols() {
    const cols = [];
    d.querySelectorAll('[id^="id_matrix_cols-"][id$="-label"]').forEach(inp => {
      const m = inp.id.match(/^id_matrix_cols-(\d+)-label$/);
      if (!m) return;
      const idx = m[1];
      const row = inp.closest('tr');
      const delEl = row?.querySelector(`#id_matrix_cols-${idx}-DELETE`);
      if (delEl && delEl.checked) return;

      const label = (inp.value || "").trim();
      if (!label) return;

      const valEl   = row?.querySelector(`#id_matrix_cols-${idx}-value`);
      const typeEl  = row?.querySelector(`#id_matrix_cols-${idx}-input_type`);
      const reqEl   = row?.querySelector(`#id_matrix_cols-${idx}-required`);
      const groupEl = row?.querySelector(`#id_matrix_cols-${idx}-group`);
      cols.push({
        id: idx,
        label,
        value: valEl ? valEl.value : "",
        input_type: typeEl ? typeEl.value : "radio",
        required: !!(reqEl && reqEl.checked),
        group: (groupEl ? groupEl.value : "") || "Ungrouped"
      });
    });
    return cols;
  }

  function renderStars(count = 5) {
    let s = '<div class="d-flex gap-1 fs-5 lh-1">';
    for (let i = 0; i < count; i++) s += '<span aria-hidden="true">☆</span>';
    return s + '</div>';
  }

  // ---------- Single-question renderer (current draft) ----------
  function renderCurrentQuestionHTML() {
    const type   = v("id_question_type");
    const text   = v("id_text").trim();
    const helper = v("id_helper_text").trim();
    const choices = collectChoices();

    let html = `
      <div class="space-y-2">
        ${text ? `<h4 class="text-base font-semibold text-slate-100">${h(text)}</h4>` : ""}
        ${helper ? `<p class="text-xs text-slate-400">${h(helper)}</p>` : ""}
    `;

    // Controls by type (Tailwind only; disabled visuals)
    if (type === "SINGLE_CHOICE") {
      html += `<div class="space-y-2">` +
        choices.map(c => `
          <label class="flex items-center gap-2 text-sm text-slate-200">
            <input type="radio" disabled class="${twCheck()}">
            <span>${h(c.text)}</span>
          </label>`).join("") + `</div>`;
    }

    if (type === "MULTI_CHOICE") {
      html += `<div class="space-y-2">` +
        choices.map(c => `
          <label class="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" disabled class="${twCheck()}">
            <span>${h(c.text)}</span>
          </label>`).join("") + `</div>`;
    }

    if (type === "DROPDOWN") {
      html += `<select disabled class="${twInput()}">
        <option>-- Select an option --</option>
        ${choices.map(c => `<option>${h(c.text)}</option>`).join("")}
      </select>`;
    }

    if (type === "YESNO") {
      html += `
        <div class="flex gap-6 text-sm">
          <label class="flex items-center gap-2"><input type="radio" disabled class="${twCheck()}"><span>Yes</span></label>
          <label class="flex items-center gap-2"><input type="radio" disabled class="${twCheck()}"><span>No</span></label>
        </div>`;
    }

    if (type === "NUMBER") {
      html += `<input disabled type="number" placeholder="Number" class="${twInput()}">`;
    }

    if (type === "SLIDER") {
      const min = v("id_min_value") || 0;
      const max = v("id_max_value") || 100;
      const step = v("id_step_value") || 1;
      html += `
        <div class="text-xs text-slate-400">Value: <span>${h(min)}</span></div>
        <input disabled type="range" min="${h(min)}" max="${h(max)}" step="${h(step)}"
               class="w-full accent-indigo-500">`;
    }

    if (type === "DATE") {
      html += `
        <div class="flex">
          <input disabled type="text" class="${twInput('rounded-r-none')}" placeholder="Select a date">
          <button type="button" disabled class="rounded-r-lg border border-l-0 border-slate-700 bg-slate-800/60 px-3">
            <i class="bi bi-calendar text-slate-300"></i>
          </button>
        </div>`;
    }

    if (type === "GEOLOCATION") {
      html += `<div class="h-48 rounded-xl border border-slate-700 bg-slate-800/40 flex items-center justify-center text-xs text-slate-400">
        Map preview
      </div>`;
    }

    if (type === "PHOTO_UPLOAD") {
      const multi = bool("id_allow_multiple_files");
      html += `<input disabled type="file" ${multi ? "multiple" : ""} accept="image/*" class="${twInput()}">`;
    }
    if (type === "VIDEO_UPLOAD") {
      html += `<input disabled type="file" accept="video/*" class="${twInput()}">`;
    }
    if (type === "AUDIO_UPLOAD") {
      html += `<input disabled type="file" accept="audio/*" class="${twInput()}">`;
    }

    if (type === "RATING") {
      if (choices.length) {
        html += `<div class="flex flex-wrap gap-3 text-sm">` +
          choices.map(c => `
            <label class="inline-flex items-center gap-2">
              <input type="radio" disabled class="${twCheck()}"><span>${h(c.text)}</span>
            </label>`).join("") + `</div>`;
      } else {
        html += `<div class="flex gap-1 text-xl text-yellow-400 select-none" aria-hidden="true">★★★★★</div>`;
      }
    }

    if (type === "IMAGE_CHOICE") {
      const multi = bool("id_allows_multiple");
      html += `<div class="grid grid-cols-2 md:grid-cols-3 gap-3">` +
        choices.map(c => `
          <div class="rounded-xl border border-slate-700 p-3 text-center">
            <input type="${multi ? "checkbox" : "radio"}" disabled class="${twCheck()}">
            <div class="mt-2 h-24 rounded-lg border border-slate-700 bg-slate-800/40 flex items-center justify-center text-xs text-slate-400">
              ${c.imageName ? h(c.imageName) : "image"}
            </div>
            <div class="mt-2 text-xs text-slate-300">${h(c.text)}</div>
          </div>`).join("") + `</div>`;
    }

    if (type === "IMAGE_RATING") {
      html += `<div class="grid grid-cols-2 md:grid-cols-3 gap-3">` +
        choices.map(c => `
          <div class="rounded-xl border border-slate-700 p-3 text-center">
            <div class="mb-2 h-24 rounded-lg border border-slate-700 bg-slate-800/40 flex items-center justify-center text-xs text-slate-400">
              ${c.imageName ? h(c.imageName) : "image"}
            </div>
            <div class="flex justify-center gap-1 text-yellow-400 text-xl select-none" aria-hidden="true">★★★★★</div>
            <div class="mt-2 text-xs text-slate-300">${h(c.text)}</div>
          </div>`).join("") + `</div>`;
    }

    if (type === "MATRIX") {
      const mode = v("id_matrix_mode") || "single";
      const rows = collectMatrixRows();
      const cols = collectMatrixCols();

      if (!rows.length || !cols.length) {
        html += `<div class="text-xs text-slate-400">Add rows and columns to preview the matrix…</div>`;
      } else if (mode === "side_by_side") {
        const groups = {};
        cols.forEach(c => { (groups[c.group] ||= []).push(c); });

        html += `
          <div class="overflow-x-auto rounded-xl border border-slate-800">
            <table class="w-full table-auto text-sm">
              <thead class="bg-slate-800/70 text-slate-100">
                <tr>
                  <th class="px-3 py-2 text-left align-middle">Item</th>
                  ${Object.keys(groups).map(g => `<th class="px-3 py-2 text-center">${h(g)}</th>`).join("")}
                </tr>
                <tr>
                  <th></th>
                  ${Object.values(groups).map(colsInGroup => {
                    const t = colsInGroup[0]?.input_type || "radio";
                    if (t === "radio" || t === "checkbox") {
                      return `<th class="px-3 py-2">
                        <div class="flex justify-center gap-3 flex-wrap">
                          ${colsInGroup.map(c => `<span class="text-xs text-slate-300">${h(c.label)}</span>`).join("")}
                        </div>
                      </th>`;
                    }
                    return `<th class="px-3 py-2"></th>`;
                  }).join("")}
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
                ${rows.map(r => `
                  <tr class="text-slate-200">
                    <td class="px-3 py-2 align-middle">${h(r.text)}</td>
                    ${Object.values(groups).map(colsInGroup => {
                      const t = colsInGroup[0]?.input_type || "radio";
                      if (t === "text")   return `<td class="px-3 py-2"><input disabled type="text" class="${twInput()}"></td>`;
                      if (t === "select") return `<td class="px-3 py-2"><select disabled class="${twInput()}">
                        <option>-- Choose --</option>${colsInGroup.map(c => `<option>${h(c.label)}</option>`).join("")}
                      </select></td>`;
                      if (t === "radio" || t === "checkbox")
                        return `<td class="px-3 py-2"><div class="flex justify-center gap-3">
                          ${colsInGroup.map(() => `<input disabled type="${t}" class="${twCheck()}">`).join("")}
                        </div></td>`;
                      return `<td class="px-3 py-2"></td>`;
                    }).join("")}
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>`;
      } else if (mode === "multi") {
        html += `
          <div class="overflow-x-auto rounded-xl border border-slate-800">
            <table class="w-full table-auto text-sm">
              <thead class="bg-slate-800/70 text-slate-100">
                <tr>
                  <th class="px-3 py-2"></th>
                  ${cols.map(c => `<th class="px-3 py-2 text-center">${h(c.label)}</th>`).join("")}
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
                ${rows.map(r => `
                  <tr class="text-slate-200">
                    <td class="px-3 py-2">${h(r.text)}</td>
                    ${cols.map(() => `<td class="px-3 py-2 text-center"><input disabled type="checkbox" class="${twCheck()}"></td>`).join("")}
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>`;
      } else {
        // single-select per row
        html += `
          <div class="overflow-x-auto rounded-xl border border-slate-800">
            <table class="w-full table-auto text-sm">
              <thead class="bg-slate-800/70 text-slate-100">
                <tr>
                  <th class="px-3 py-2"></th>
                  ${cols.map(c => `<th class="px-3 py-2 text-center">${h(c.label)}</th>`).join("")}
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
                ${rows.map(r => `
                  <tr class="text-slate-200">
                    <td class="px-3 py-2">${h(r.text)}</td>
                    ${cols.map(() => `<td class="px-3 py-2 text-center"><input disabled type="radio" class="${twCheck()}"></td>`).join("")}
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>`;
      }
    }

    html += `</div>`;
    return html.trim() || `<em class="text-indigo-300/90 italic">Start typing…</em>`;
  }


  function renderQuestionFromPayload(p) {
    // Use the same Tailwind structure as renderCurrentQuestionHTML, but from payload fields.
    // Only a few types shown here; extend as needed.
    let html = `
      <div class="space-y-2">
        ${p.text ? `<h4 class="text-base font-semibold text-slate-100">${h(p.text)}</h4>` : ""}
        ${p.helper_text ? `<p class="text-xs text-slate-400">${h(p.helper_text)}</p>` : ""}
    `;

    const t = p.question_type;

    if (t === "SINGLE_CHOICE") {
      html += `<div class="space-y-2">` +
        (p.choices || []).map(c => `
          <label class="flex items-center gap-2 text-sm text-slate-200">
            <input type="radio" disabled class="${twCheck()}">
            <span>${h(c.text)}</span>
          </label>`).join("") + `</div>`;
    }

    if (t === "MULTI_CHOICE") {
      html += `<div class="space-y-2">` +
        (p.choices || []).map(c => `
          <label class="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" disabled class="${twCheck()}">
            <span>${h(c.text)}</span>
          </label>`).join("") + `</div>`;
    }

    if (t === "DROPDOWN") {
      html += `<select disabled class="${twInput()}">
        <option>-- Select an option --</option>
        ${(p.choices || []).map(c => `<option>${h(c.text)}</option>`).join("")}
      </select>`;
    }

    if (t === "TEXT") {
      html += `<textarea disabled rows="3" class="${twInput()}"></textarea>`;
    }

    if (t === "YESNO") {
      html += `
        <div class="flex gap-6 text-sm">
          <label class="flex items-center gap-2"><input type="radio" disabled class="${twCheck()}"><span>Yes</span></label>
          <label class="flex items-center gap-2"><input type="radio" disabled class="${twCheck()}"><span>No</span></label>
        </div>`;
    }

    if (t === "NUMBER") {
      html += `<input disabled type="number" class="${twInput()}" />`;
    }

    if (t === "SLIDER") {
      const min = p.min_value ?? 0, max = p.max_value ?? 100, step = p.step_value ?? 1;
      html += `<div class="text-xs text-slate-400">Value: <span>${min}</span></div>
               <input disabled type="range" min="${min}" max="${max}" step="${step}" class="w-full accent-indigo-500">`;
    }

    if (t === "RATING") {
      const hasChoices = (p.choices || []).length;
      html += hasChoices
        ? `<div class="flex flex-wrap gap-3 text-sm">` +
          p.choices.map(c => `
            <label class="inline-flex items-center gap-2">
              <input type="radio" disabled class="${twCheck()}"><span>${h(c.text)}</span>
            </label>`).join("") + `</div>`
        : `<div class="flex gap-1 text-xl text-yellow-400 select-none" aria-hidden="true">★★★★★</div>`;
    }

    if (t === "IMAGE_CHOICE") {
      html += `<div class="grid grid-cols-2 md:grid-cols-3 gap-3">` +
        (p.choices || []).map(c => `
          <div class="rounded-xl border border-slate-700 p-3 text-center">
            <input type="radio" disabled class="${twCheck()}">
            <div class="mt-2 h-24 rounded-lg border border-slate-700 bg-slate-800/40 flex items-center justify-center text-xs text-slate-400">
              image
            </div>
            <div class="mt-2 text-xs text-slate-300">${h(c.text)}</div>
          </div>`).join("") + `</div>`;
    }

    if (t === "IMAGE_RATING") {
      html += `<div class="grid grid-cols-2 md:grid-cols-3 gap-3">` +
        (p.choices || []).map(c => `
          <div class="rounded-xl border border-slate-700 p-3 text-center">
            <div class="mb-2 h-24 rounded-lg border border-slate-700 bg-slate-800/40 flex items-center justify-center text-xs text-slate-400">
              image
            </div>
            <div class="flex justify-center gap-1 text-yellow-400 text-xl select-none" aria-hidden="true">★★★★★</div>
            <div class="mt-2 text-xs text-slate-300">${h(c.text)}</div>
          </div>`).join("") + `</div>`;
    }

    if (t === "MATRIX") {
      const rows = p.matrix_rows || [];
      const cols = p.matrix_cols || [];
      const mode = p.matrix_mode || "single";

      if (!rows.length || !cols.length) {
        html += `<div class="text-xs text-slate-400">Add rows and columns to preview the matrix…</div>`;
      } else if (mode === "multi") {
        html += `
        <div class="overflow-x-auto rounded-xl border border-slate-800">
          <table class="w-full table-auto text-sm">
            <thead class="bg-slate-800/70 text-slate-100">
              <tr><th class="px-3 py-2"></th>${cols.map(c => `<th class="px-3 py-2 text-center">${h(c.label)}</th>`).join("")}</tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              ${rows.map(r => `<tr class="text-slate-200"><td class="px-3 py-2">${h(r.text)}</td>${
                cols.map(() => `<td class="px-3 py-2 text-center"><input disabled type="checkbox" class="${twCheck()}"></td>`).join("")
              }</tr>`).join("")}
            </tbody>
          </table>
        </div>`;
      } else if (mode === "side_by_side") {
        const groups = {};
        cols.forEach(c => { (groups[c.group || "Ungrouped"] ||= []).push(c); });
        html += `
        <div class="overflow-x-auto rounded-xl border border-slate-800">
          <table class="w-full table-auto text-sm">
            <thead class="bg-slate-800/70 text-slate-100">
              <tr>
                <th class="px-3 py-2 text-left align-middle">Item</th>
                ${Object.keys(groups).map(g => `<th class="px-3 py-2 text-center">${h(g)}</th>`).join("")}
              </tr>
              <tr>
                <th></th>
                ${Object.values(groups).map(colsInGroup => {
                  const t = colsInGroup[0]?.input_type || "radio";
                  if (t === "radio" || t === "checkbox") {
                    return `<th class="px-3 py-2"><div class="flex justify-center gap-3 flex-wrap">
                      ${colsInGroup.map(c => `<span class="text-xs text-slate-300">${h(c.label)}</span>`).join("")}
                    </div></th>`;
                  }
                  return `<th class="px-3 py-2"></th>`;
                }).join("")}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              ${rows.map(r => `
                <tr class="text-slate-200">
                  <td class="px-3 py-2">${h(r.text)}</td>
                  ${Object.values(groups).map(colsInGroup => {
                    const t = colsInGroup[0]?.input_type || "radio";
                    if (t === "text")   return `<td class="px-3 py-2"><input disabled type="text" class="${twInput()}"></td>`;
                    if (t === "select") return `<td class="px-3 py-2"><select disabled class="${twInput()}">
                      <option>-- Choose --</option>${colsInGroup.map(c => `<option>${h(c.label)}</option>`).join("")}
                    </select></td>`;
                    if (t === "radio" || t === "checkbox")
                      return `<td class="px-3 py-2"><div class="flex justify-center gap-3">
                        ${colsInGroup.map(() => `<input disabled type="${t}" class="${twCheck()}">`).join("")}
                      </div></td>`;
                    return `<td class="px-3 py-2"></td>`;
                  }).join("")}
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`;
      } else {
        // single
        html += `
        <div class="overflow-x-auto rounded-xl border border-slate-800">
          <table class="w-full table-auto text-sm">
            <thead class="bg-slate-800/70 text-slate-100">
              <tr><th class="px-3 py-2"></th>${cols.map(c => `<th class="px-3 py-2 text-center">${h(c.label)}</th>`).join("")}</tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              ${rows.map(r => `<tr class="text-slate-200"><td class="px-3 py-2">${h(r.text)}</td>${
                cols.map(() => `<td class="px-3 py-2 text-center"><input disabled type="radio" class="${twCheck()}"></td>`).join("")
              }</tr>`).join("")}
            </tbody>
          </table>
        </div>`;
      }
    }

    html += `</div>`;
    return html;
  }


  // ---------- Existing questions list (fetched) ----------
  let existing = []; // array of API payloads

  function summarizePayload(p) {
    const t = p.question_type;
    if (["SINGLE_CHOICE","MULTI_CHOICE","DROPDOWN","RATING","IMAGE_CHOICE","IMAGE_RATING"].includes(t)) {
      return p.choices?.map(c => c.text).slice(0,6).join(" • ") || "—";
    }
    if (t === "MATRIX") {
      const rows = p.matrix_rows?.length || 0;
      const cols = p.matrix_cols?.length || 0;
      return `${rows} rows × ${cols} cols (${p.matrix_mode || "single"})`;
    }
    if (t === "SLIDER") return `min=${p.min_value ?? 0}, max=${p.max_value ?? 100}, step=${p.step_value ?? 1}`;
    if (t === "DATE") return "Date picker";
    if (t === "NUMBER") return "Number input";
    if (t === "YESNO") return "Yes / No";
    if (t === "PHOTO_UPLOAD") return p.allow_multiple_files ? "Photo upload (multiple)" : "Photo upload";
    if (t === "VIDEO_UPLOAD") return "Video upload";
    if (t === "AUDIO_UPLOAD") return "Audio upload";
    if (t === "GEOLOCATION") return "Geolocation";
    if (t === "TEXT") return "Text answer";
    return "—";
  }

  function renderExistingCard(payload) {
    const code = payload.code || "(no code)";
    const type = payload.question_type || "—";
    const bodyHTML = renderQuestionFromPayload(payload); // Tailwind rendering from API payload

    return `
      <div class="preview-card q-card-p mb-3 rounded-2xl border border-slate-800 bg-slate-900/70 shadow-lg">
        <div class="flex items-center justify-between px-4 pt-3">
          <div class="flex items-center gap-2">
            <span class="${twBadge()}">${h(code)}</span>
            <span class="${twBadge()}">${h(type)}</span>
          </div>
          <button type="button"
                  class="rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  data-action="edit-in-wizard" data-qid="${payload.id || ''}">
            Edit
          </button>
        </div>
        <div class="body px-4 pb-4 max-h-80 overflow-y-auto">
          ${bodyHTML}
        </div>
      </div>`;
  }

  function renderDraftCard() {
    const code = v("id_code") || "(no code)";
    const type = v("id_question_type") || "—";
    const bodyHTML = renderCurrentQuestionHTML();

    return `
      <div class="preview-card draft q-card-p mb-3 rounded-2xl border border-indigo-700/60 bg-indigo-950/40 shadow-lg ring-1 ring-inset ring-indigo-700/40">
        <div class="flex items-center justify-between px-4 pt-3">
          <div class="flex items-center gap-2">
            <span class="${twBadge()}">${h(code)}</span>
            <span class="${twBadge()}">${h(type)}</span>
          </div>
          <span class="${twBadge()}">Draft</span>
        </div>
        <div class="body px-4 pb-4 max-h-80 overflow-y-auto">
          ${bodyHTML}
        </div>
      </div>`;
  }

  async function fetchExisting() {
    const list = document.getElementById("question-preview-list");
    if (!list) return;

    // Prefer inline JSON; fall back to bootstrapped window var
    let ids = [];
    const el = document.getElementById('wizard-qids');
    if (el) {
      try { ids = JSON.parse(el.textContent || '[]'); } catch (e) { ids = []; }
    } else if (window.SurveyWizard && Array.isArray(window.SurveyWizard.initialIds)) {
      ids = window.SurveyWizard.initialIds;
    }

    if (!ids.length) { existing = []; return; }

    const base = list.dataset.apiBase || "/surveys/api/question-data/";
    // const reqs = ids.map(id => fetch(`${base}${id}/`).then(r => r.ok ? r.json() : null).catch(() => null));
    const reqs = ids.map(id => fetch(`${base}${id}/`, { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : (console.warn('Preview fetch failed', id, r.status), null))).catch(err => (console.warn('Preview fetch error', id, err), null)));
    const res = await Promise.all(reqs);
    // Sort by the original id order to keep positions stable
    const order = new Map(ids.map((id, i) => [String(id), i]));
    existing = res
      .filter(Boolean)
      .sort((a, b) => (order.get(String(a.id)) ?? 1e9) - (order.get(String(b.id)) ?? 1e9));
  }

  function renderList() {
    const list = d.getElementById("question-preview-list");
    if (!list) return;

    // Existing saved questions
    const existingHTML = existing.map(renderExistingCard).join("");

    // Current draft (always last)
    const draftHTML = renderDraftCard();

    list.innerHTML = existingHTML + draftHTML;

    // neutralize accidental anchors with same data-qid
    list.querySelectorAll('[data-action="edit-in-wizard"][href]').forEach(a => a.removeAttribute('href'));

    // Auto-scroll to the bottom so the draft is in view
    list.scrollTop = list.scrollHeight;
  }

  // Public API for other scripts
  function updatePreview() {
    // Just re-render the draft portion (existing list stays as-is)
    renderList();
  }

  async function hydrateExistingPreviews() {
    const list = document.getElementById("question-preview-list");
    if (!list) return;
    const cards = list.querySelectorAll('.preview-card[data-qid]:not(.draft)');
    const base = list.dataset.previewApiBase || "/surveys/api/question-preview/"; // add this data-attr in HTML

    await Promise.all(Array.from(cards).map(async card => {
      const qid = card.getAttribute('data-qid');
      if (!qid) return;
      try {
        const res = await fetch(`${base}${qid}/`);
        if (!res.ok) return;
        const { html } = await res.json();
        const body = card.querySelector('.body');
        if (body) body.innerHTML = html;
      } catch (e) {
        /* fail silently */
      }
    }));
  }

  async function init() {
    // Namespace + updatePreview exposure
    w.SurveyWizard = w.SurveyWizard || {};
    w.SurveyWizard.updatePreview = updatePreview;
    w.updatePreview = updatePreview; // legacy global

    // Lightweight event bus (only if not already present)
    if (!w.SurveyWizard.bus) {
      const handlers = {};
      w.SurveyWizard.bus = {
        on: (evt, fn) => ((handlers[evt] ||= []).push(fn)),
        emit: (evt, data) => (handlers[evt] || []).forEach(fn => fn(data)),
      };
    }

    // Load existing once and render list
    await fetchExisting();
    renderList();
    hydrateExistingPreviews();

    // ✅ One-time delegation for "Edit" buttons in the preview list
  if (!w.SurveyWizard._editHookReady) {
    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action="edit-in-wizard"]');
      if (!btn) return;
      ev.preventDefault();           // block link defaults if any
      ev.stopPropagation();          // avoid other global handlers
      const qid = btn.getAttribute('data-qid');
      if (!qid) return;

      const url = new URL(window.location.href);
      url.searchParams.set('edit', qid);
      window.location.href = url.toString();
    });
    w.SurveyWizard._editHookReady = true;
  }

    // Re-render draft on changes from the wizard bus, if present
    w.SurveyWizard.bus?.on('changed', updatePreview);

    // Also listen to generic input/change events to be safe
    d.addEventListener('input', (e) => {
      if (
        e.target &&
        (e.target.closest('#question-form') ||
          e.target.id?.startsWith('id_matrix_') ||
          e.target.id?.startsWith('id_choices-'))
      ) {
        updatePreview();
      }
    });
    d.addEventListener('change', (e) => {
      if (
        e.target &&
        (e.target.closest('#question-form') ||
          e.target.id?.startsWith('id_matrix_') ||
          e.target.id?.startsWith('id_choices-'))
      ) {
        updatePreview();
      }
    });

    // Handle Edit / Load buttons on the preview list
    const list = d.getElementById("question-preview-list");
    if (list) {
      list.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-action]');
        if (!btn) return;

        const id = parseInt(btn.dataset.qid, 10);
        const payload = existing.find(q => q.id === id);
        if (!payload) return;

        if (btn.dataset.action === 'edit') {
          // Open the admin change page in a new tab
          window.open(`/admin/surveys/question/${id}/change/`, '_blank');
          return;
        }

        if (btn.dataset.action === 'load') {
          // Ask the bridge to load this question into the wizard form + formsets
          w.SurveyWizard.bus.emit('loadIntoWizard', payload);
        }
      });
    }
  }



  d.addEventListener('DOMContentLoaded', init);
})(window, document);
