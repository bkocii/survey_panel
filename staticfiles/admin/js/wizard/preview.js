// surveys/static/admin/js/wizard/preview.js
(function (w, d) {
  // ---------- utils ----------
  function h(s) { return (s ?? "").toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function v(id) { const el = d.getElementById(id); return el ? el.value || "" : ""; }
  function bool(id) { const el = d.getElementById(id); return !!(el && el.checked); }

  // Small Tailwind helpers (for draft only)
  function twInput(base = "") {
    return `block w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-slate-100 placeholder-slate-400 ${base}`;
  }
  function twCheck() {
    return "h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-2 focus:ring-indigo-500";
  }
  function twBadge() {
    return "inline-flex items-center rounded-md bg-slate-800/70 px-2 py-0.5 text-[11px] font-medium text-slate-300 ring-1 ring-inset ring-slate-700";
  }

  // ---------- collectors (for draft only) ----------
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

  // ---------- draft renderer (client-side) ----------
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

    // Horizontal scroller; each item is a compact vertical card
    html += `
      <div class="overflow-x-auto">
        <div class="flex gap-3 pb-2" style="min-height: 10rem;">
          ${choices.map(c => `
            <div class="shrink-0 w-40 rounded-xl border border-slate-700 p-3 text-center bg-slate-900/40">
              <div class="flex justify-center mb-2">
                <input type="${multi ? "checkbox" : "radio"}" disabled class="${twCheck()}">
              </div>
              <div class="h-24 rounded-lg border border-slate-700 bg-slate-800/40 flex items-center justify-center text-xs text-slate-400">
                ${c.imageName ? h(c.imageName) : "image"}
              </div>
              <div class="mt-2 text-xs text-slate-300 truncate">${h(c.text)}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

    if (type === "IMAGE_RATING") {
      html += `<div class="grid grid-cols-2 md:grid-cols-3 gap-3">` +
        choices.map(c => `
          <div class="rounded-xl border border-slate-700 p-3 text-center">
            <div class="mb-2 h-24 rounded-lg border border-slate-700 bg-slate-800/40 flex items-center justify-center text-xs text-slate-400">
              ${c.imageName ? h(c.imageName) : "image"}
            </div>
            <div class="flex justify-content-center gap-1 text-yellow-400 text-xl select-none" aria-hidden="true">★★★★★</div>
            <div class="mt-2 text-xs text-slate-300">${h(c.text)}</div>
          </div>`).join("") + `</div>`;
    }

    // --- MATRIX (match survey _question_display.html markup) ---
    if (type === "MATRIX") {
    const mode = v("id_matrix_mode") || "single";
    const rows = collectMatrixRows();
    const cols = collectMatrixCols();

    if (!rows.length || !cols.length) {
      html += `<div class="text-xs text-slate-400">Add rows and columns to preview the matrix…</div>`;
    } else if (mode === "side_by_side") {
    // group columns by 'group'
    const groups = {};
    cols.forEach(c => {
      const g = (c.group || "Ungrouped");
      (groups[g] ||= []).push(c);
    });

      html += `
      <div class="overflow-x-auto rounded-xl border border-slate-800">
        <table class="w-full table-auto text-sm">
          <thead class="bg-slate-800/70 text-slate-100">
            <tr>
              <th class="px-3 py-2 text-left align-middle">Item</th>
              ${Object.keys(groups).map(g => `<th class="px-3 py-2 text-center">${h(g)}</th>`).join("")}
            </tr>
            <tr>
              <th class="px-3 py-2"></th>
              ${
                Object.values(groups).map(colsInGroup => {
                  const t = colsInGroup[0]?.input_type || "radio";
                  if (t === "radio" || t === "checkbox") {
                    // HORIZONTAL labels, scrollable if many
                    return `<th class="px-3 py-2">
                      <div class="pv-headlabels">
                        ${colsInGroup.map(c => `<span class="text-xs text-slate-300">${h(c.label)}</span>`).join("")}
                      </div>
                    </th>`;
                  }
                  return `<th class="px-3 py-2">&nbsp;</th>`;
                }).join("")
              }
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800">
            ${rows.map(r => `
              <tr class="text-slate-200">
                <td class="px-3 py-2 align-middle"><div class="pv-text">${h(r.text)}</div></td>
                ${
                  Object.values(groups).map(colsInGroup => {
                    const t = colsInGroup[0]?.input_type || "radio";
                    if (t === "text") {
                      return `<td class="px-3 py-2"><input disabled type="text" class="pv-input ${twInput()}"></td>`;
                    }
                    if (t === "select") {
                      return `<td class="px-3 py-2">
                        <select disabled class="pv-input ${twInput()}">
                          <option>-- Choose --</option>
                          ${colsInGroup.map(c => `<option>${h(c.label)}</option>`).join("")}
                        </select>
                      </td>`;
                    }
                    if (t === "radio" || t === "checkbox") {
                      // CONTROLS IN A ROW, scrollable sideways
                      return `<td class="px-3 py-2">
                        <div class="pv-cell">
                          ${colsInGroup.map(() => `<input disabled type="${t}" class="${twCheck()}">`).join("")}
                        </div>
                      </td>`;
                    }
                    return `<td class="px-3 py-2"></td>`;
                  }).join("")
                }
              </tr>`
            ).join("")}
          </tbody>
        </table>
      </div>`;
    } else if (mode === "multi") {
      // multi-select per cell (checkboxes)
      html += `
        <div class="table-responsive">
          <table class="table table-bordered align-middle">
            <thead>
              <tr>
                <th></th>
                ${cols.map(c => `<th>${h(c.label)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${h(r.text)}</td>
                  ${cols.map(() => `
                    <td>
                      <div class="form-check form-check-inline">
                        <input type="checkbox" class="form-check-input" disabled>
                      </div>
                    </td>
                  `).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>`;
    } else {
      // single-select per row (radios across columns)
      html += `
        <div class="table-responsive">
          <table class="table table-bordered align-middle">
            <thead>
              <tr>
                <th></th>
                ${cols.map(c => `<th>${h(c.label)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${h(r.text)}</td>
                  ${cols.map(() => `
                    <td>
                      <div class="form-check form-check-inline">
                        <input type="radio" class="form-check-input" disabled>
                      </div>
                    </td>
                  `).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>`;
    }
  }


    html += `</div>`;
    return html.trim() || `<em class="text-indigo-300/90 italic">Start typing…</em>`;
  }

  // ---------- existing (server fragments) ----------
  let existingFragments = []; // [{id, code, question_type, html}]

  function wrapExistingCard(fragment) {
    const codeBadge = fragment.code ? `<span class="badge">${h(fragment.code)}</span>` : "";
    const typeBadge = fragment.question_type ? `<span class="badge">${h(fragment.question_type)}</span>` : "";

    return `
      <div class="preview-card q-card-p" data-qid="${h(String(fragment.id))}" data-qtype="${h(String(fragment.question_type || ""))}">
        <div class="card-head d-flex justify-content-between align-items-center mb-2">
          <div class="meta d-flex gap-2">${codeBadge}${typeBadge}</div>
          <div class="d-flex gap-2">
            <button type="button"
                    class="btn-shell"
                    data-action="edit-in-wizard"
                    data-qid="${h(String(fragment.id))}">
              <span class="btn-ui btn-primary">✏️</span>
            </button>
            <button type="button"
                    class="btn-shell"
                    data-action="delete-in-wizard"
                    data-qid="${h(String(fragment.id))}">
              <span class="btn-ui" style="background:#7f1d1d;color:#fff;border-color:rgba(255,255,255,.18)">🗑️</span>
            </button>
          </div>
        </div>
        <div class="body">
          <div class="pv-scroll">
            ${fragment.html}
          </div>
        </div>
      </div>
    `;
  }

  async function fetchExisting() {
    const list = d.getElementById("question-preview-list");
    if (!list) return;

    // collect ids
    let ids = [];
    const el = d.getElementById('wizard-qids');
    if (el) {
      try { ids = JSON.parse(el.textContent || '[]'); } catch (e) { ids = []; }
    } else if (w.SurveyWizard && Array.isArray(w.SurveyWizard.initialIds)) {
      ids = w.SurveyWizard.initialIds;
    }
    if (!ids.length) { existingFragments = []; return; }

    // hit fragment endpoint
    const base = "/surveys/api/question-fragment/";
    const reqs = ids.map(id =>
      fetch(`${base}${id}/`, { credentials: "same-origin" })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    );
    const res = (await Promise.all(reqs)).filter(Boolean);

    // keep original order
    const order = new Map(ids.map((id, i) => [String(id), i]));
    existingFragments = res.sort((a, b) => (order.get(String(a.id)) ?? 1e9) - (order.get(String(b.id)) ?? 1e9));
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
        <div class="body px-4 pb-4">
          <div class="pv-scroll">
            ${bodyHTML}
          </div>
        </div>
      </div>`;
  }

  function renderList() {
    const list = d.getElementById("question-preview-list");
    if (!list) return;

    const existingHTML = existingFragments.map(wrapExistingCard).join("");
    const draftHTML = renderDraftCard();

    list.innerHTML = existingHTML + draftHTML;

    // disable any interactive inputs inside preview cards (existing only)
    list.querySelectorAll('.preview-card:not(.draft) input, .preview-card:not(.draft) select, .preview-card:not(.draft) textarea, .preview-card:not(.draft) button[type="submit"]').forEach(el => {
      el.disabled = true;
    });

    // Auto-scroll so draft is visible
    list.scrollTop = list.scrollHeight;
  }

  function updatePreview() {
    // Only the draft portion changes live
    renderList();
  }

  // ---------- init & handlers ----------
  async function init() {
    // namespace
    w.SurveyWizard = w.SurveyWizard || {};
    w.SurveyWizard.updatePreview = updatePreview;
    w.updatePreview = updatePreview; // legacy global

    // simple bus if missing
    if (!w.SurveyWizard.bus) {
      const handlers = {};
      w.SurveyWizard.bus = {
        on: (evt, fn) => ((handlers[evt] ||= []).push(fn)),
        emit: (evt, data) => (handlers[evt] || []).forEach(fn => fn(data)),
      };
    }

    await fetchExisting();
    renderList();

    // edit click → reload wizard with ?edit=<id>
    if (!w.SurveyWizard._editHookReady) {
      d.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-action="edit-in-wizard"]');
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();
        const qid = btn.getAttribute('data-qid');
        if (!qid) return;

        const url = new URL(window.location.href);
        url.searchParams.set('edit', qid);
        window.location.href = url.toString();
      });
      w.SurveyWizard._editHookReady = true;
    }

    // delete click → post to hidden form
    if (!w.SurveyWizard._deleteHookReady) {
      d.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-action="delete-in-wizard"]');
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();

        const qid = btn.getAttribute('data-qid');
        if (!qid) return;

        if (!confirm('Delete this question? This cannot be undone.')) return;

        const form  = d.getElementById('wizard-delete-form');
        const input = d.getElementById('wizard-delete-id');
        if (!form || !input) {
          console.warn('Delete form/field not found');
          return;
        }
        input.value = qid;
        form.submit();
      });
      w.SurveyWizard._deleteHookReady = true;
    }

    // re-render draft on edits in the wizard
    w.SurveyWizard.bus?.on('changed', updatePreview);

    // generic watchers
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
  }

  d.addEventListener('DOMContentLoaded', init);
})(window, document);
