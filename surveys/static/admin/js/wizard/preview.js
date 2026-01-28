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

  function wrapExistingCard(fragment, indexZeroBased) {
    const index = indexZeroBased + 1;
    const codeBadge = fragment.code ? `<span class="badge">${h(fragment.code)}</span>` : "";
    const typeBadge = fragment.question_type ? `<span class="badge">${h(fragment.question_type)}</span>` : "";

    return `
      <div class="preview-card q-card-p" data-qid="${h(String(fragment.id))}" data-qtype="${h(fragment.question_type || '')}" draggable="true">
        <div class="card-head d-flex justify-content-between align-items-center mb-2">
          <div class="meta d-flex gap-2">
            ${codeBadge}${typeBadge}
          </div>
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
            <button type="button"
                    class="btn-shell" 
                    data-action="set-routing" 
                    data-qid="${h(String(fragment.id))}">
              <span class="btn-ui btn-secondary">🧭 Set routing</span>
            </button>

          </div>
        </div>
  
        <!-- number + title split so we can renumber without touching the text -->
        <div class="pv-title px-4">
          <span class="pv-index">${index}.</span>
          <span class="pv-text">${h(fragment.text || '')}</span>
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

    // keep order by initial ids (already sorted by sort_index),
    // fall back to server-provided sort_index when needed
    const order = new Map(ids.map((id, i) => [String(id), i]));
    existingFragments = res
      .filter(Boolean)
      .sort((a, b) => {
        const ao = order.has(String(a.id)) ? order.get(String(a.id)) : (a.sort_index ?? 1e9);
        const bo = order.has(String(b.id)) ? order.get(String(b.id)) : (b.sort_index ?? 1e9);
        if (ao !== bo) return ao - bo;
        return (a.id || 0) - (b.id || 0);
      });
  }

  function renderDraftCard(index) {
    const code = v("id_code") || "(no code)";
    const type = v("id_question_type") || "—";
    const title = v("id_text").trim() || "(untitled)";
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
    const list = document.getElementById("question-preview-list");
    if (!list) return;

    const existingHTML = existingFragments
      .map((frag, i) => wrapExistingCard(frag, i))
      .join("");

    const draftHTML = renderDraftCard(existingFragments.length + 1); // pass next index

    list.innerHTML = existingHTML + draftHTML;

    // disable interactions inside saved cards
    list.querySelectorAll('.preview-card:not(.draft) input, .preview-card:not(.draft) select, .preview-card:not(.draft) textarea, .preview-card:not(.draft) button[type="submit"]').forEach(el => {
      el.disabled = true;
    });

    list.scrollTop = list.scrollHeight;
    renumberPreviewCards();
  }

  function updatePreview() {
    // Only the draft portion changes live
    renderList();
  }

  function enableReorder() {
    const list = document.getElementById("question-preview-list");
    if (!list) return;

    // Need endpoint on the container
    const endpoint = list.dataset.reorderEndpoint;
    if (!endpoint) {
      console.warn("No reorder endpoint found on #question-preview-list");
      return;
    }

    // Helper: find CSRF token (Django)
    function getCsrf() {
      const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : "";
    }

    // Make non-draft cards draggable
    list.querySelectorAll('.preview-card[data-qid]:not(.draft)').forEach(card => {
      card.setAttribute('draggable', 'true');
      card.classList.add('is-draggable');
    });

    let dragEl = null;
    list.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.preview-card[data-qid]:not(.draft)');
      if (!card) return;
      dragEl = card;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.qid || '');
    });

    list.addEventListener('dragover', (e) => {
      if (!dragEl) return;
      e.preventDefault(); // allow drop
      const after = getAfterElement(list, e.clientY);
      if (after == null) {
        list.appendChild(dragEl);
      } else {
        list.insertBefore(dragEl, after);
      }
    });

    list.addEventListener('drop', async (e) => {
      if (!dragEl) return;
      e.preventDefault();
      dragEl.classList.remove('dragging');
      dragEl = null;

      // collect new order (ignore draft)
      const ids = Array.from(list.querySelectorAll('.preview-card[data-qid]:not(.draft)'))
        .map(el => el.getAttribute('data-qid'))
        .filter(Boolean);

      renumberPreviewCards();

      // POST to server
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrf()
          },
          body: JSON.stringify({ ids })
        });
        if (!res.ok) console.warn('Reorder save failed', res.status);
      } catch (err) {
        console.warn('Reorder save error', err);
      }
    });

    list.addEventListener('dragend', () => {
      if (dragEl) dragEl.classList.remove('dragging');
      dragEl = null;
    });

    // figure out the element after which we should insert while dragging
    function getAfterElement(container, y) {
      const els = [...container.querySelectorAll('.preview-card[data-qid]:not(.draft):not(.dragging)')];
      return els.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - (box.top + box.height / 2);
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        } else {
          return closest;
        }
      }, { offset: Number.NEGATIVE_INFINITY }).element || null;
    }
    renumberPreviewCards();
  }

  function renumberPreviewCards() {
    const list   = document.getElementById('question-preview-list');
    if (!list) return;

    const cards  = list.querySelectorAll('.preview-card:not(.draft)');
    cards.forEach((card, i) => {
      const idxEl = card.querySelector('.pv-title .pv-index');
      if (idxEl) idxEl.textContent = (i + 1) + '.';
    });

    // draft shows next index
    const draftIdxEl = list.querySelector('.preview-card.draft .pv-title .pv-index');
    if (draftIdxEl) draftIdxEl.textContent = (cards.length + 1) + '.';
  }


  (function () {
    const list  = document.getElementById('question-preview-list');
    const modal = document.getElementById('routing-modal');
    if (!list || !modal) return;

    // ✅ normalize apiBase so `${apiBase}${qid}/` always works
    let apiBase = (list.dataset.apiBase || '').trim();
    if (apiBase && !apiBase.endsWith('/')) apiBase += '/';

    const choiceRow = modal.querySelector('#routing-choice-row');
    const matrixRow = modal.querySelector('#routing-matrix-row');
    const selChoice = modal.querySelector('#routing-choice');

    const selMatrix = modal.querySelector('#routing-matrix-col');
    const selTarget = modal.querySelector('#routing-target');
    const ctx       = modal.querySelector('#routing-context');

    const hidQid   = modal.querySelector('#routing-qid');
    const hidQtype = modal.querySelector('#routing-qtype');

    // NEW UI bits (optional; safe if not present)
    const sbsGroupRow = modal.querySelector('#routing-sbs-group-row');
    const selSbsGroup = modal.querySelector('#routing-sbs-group');
    const rowPickRow  = modal.querySelector('#routing-matrix-rowpick-row');
    const selRowPick  = modal.querySelector('#routing-matrix-rowpick');
    const colLabelEl  = modal.querySelector('#routing-matrix-col-label');

    // Existing routes UI
    const existingWrap    = modal.querySelector('#routing-existing-wrap');
    const existingTbody   = modal.querySelector('#routing-existing-tbody');
    const existingEmpty   = modal.querySelector('#routing-existing-empty');
    const existingRefresh = modal.querySelector('#routing-existing-refresh');

    // keep fetched data for filtering
    let _matrixCols = [];
    let _matrixRows = [];
    let _matrixMode = '';

    // keep latest fetched question payload so refresh can re-render without extra state guessing
    let _lastData = null;

    // --- CSRF helper (cookie -> hidden input fallback)
    function getCsrf() {
      const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
      if (m) return decodeURIComponent(m[1]);
      const inp = document.querySelector('input[name="csrfmiddlewaretoken"]');
      if (inp && inp.value) return inp.value;
      return "";
    }

    function populateTargetsFromPool() {
      if (!selTarget) return;
      selTarget.innerHTML = '';
      const pool = document.getElementById('next-question-options');
      if (pool) {
        for (const o of pool.options) selTarget.appendChild(o.cloneNode(true));
      } else {
        const opt = document.createElement('option');
        opt.value = ''; opt.textContent = '---------';
        selTarget.appendChild(opt);
      }
    }

    function openModal()  { modal.classList.remove('hidden'); }
    function closeModal() { modal.classList.add('hidden'); }

    function resetSelect(sel, placeholder) {
      if (!sel) return;
      sel.innerHTML = '';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = placeholder;
      sel.appendChild(blank);
    }

    function show(el) { el && el.classList.remove('hidden'); }
    function hide(el) { el && el.classList.add('hidden'); }

    function slugify(str) {
      return (str || '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    }

    function renderMatrixColsForGroup(groupSlug) {
      if (!selMatrix) return;
      resetSelect(selMatrix, '— Select a column —');

      let cols = _matrixCols || [];
      if (_matrixMode === 'side_by_side') {
        cols = cols.filter(c => slugify(c.group || '') === groupSlug);
      }

      cols.forEach(col => {
        if (!col || col.id == null) return;
        const o = document.createElement('option');
        o.value = String(col.id); // IMPORTANT: send pk
        const label = col.label || (col.value != null ? `Col ${col.value}` : `Col ${col.id}`);
        o.textContent = label;
        selMatrix.appendChild(o);
      });
    }

    function renderMatrixRows() {
      if (!selRowPick) return;
      resetSelect(selRowPick, '— (optional) select a row —');
      (_matrixRows || []).forEach(r => {
        if (!r || r.id == null) return;
        const o = document.createElement('option');
        o.value = String(r.id); // IMPORTANT: send pk
        o.textContent = r.text || `Row ${r.id}`;
        selRowPick.appendChild(o);
      });
    }

    function optionLabelFromPool(qid) {
      if (!qid) return '---------';
      const pool = document.getElementById('next-question-options');
      if (!pool) return `Question #${qid}`;
      const opt = Array.from(pool.options).find(o => String(o.value) === String(qid));
      return opt ? opt.textContent.trim() : `Question #${qid}`;
    }

    function colLabelById(colId) {
      const c = (_matrixCols || []).find(x => String(x.id) === String(colId));
      if (!c) return `Col #${colId}`;
      return (c.label || (c.value != null ? `Col ${c.value}` : `Col #${c.id}`)).trim();
    }

    function rowLabelById(rowId) {
      const r = (_matrixRows || []).find(x => String(x.id) === String(rowId));
      if (!r) return `Row #${rowId}`;
      return (r.text || `Row #${r.id}`).trim();
    }

    function groupNameBySlug(slug) {
      const c = (_matrixCols || []).find(x => slugify(x.group || '') === slug);
      return c && c.group ? c.group : slug;
    }

    function clearExistingRoutesTable() {
      if (existingTbody) existingTbody.innerHTML = '';
      if (existingEmpty) existingEmpty.classList.add('hidden');
    }

    function renderExistingRoutes(data) {
      clearExistingRoutesTable();
      if (!existingWrap || !existingTbody || !existingEmpty) return;

      const nonSbs = Array.isArray(data.matrix_cell_routes) ? data.matrix_cell_routes : [];
      const sbs    = Array.isArray(data.sbs_cell_routes) ? data.sbs_cell_routes : [];

      const rows = [];

      nonSbs.forEach(rt => {
        const rowId = rt.row_id;
        const colId = rt.col_id;
        const tgtId = rt.next_question_id || '';

        rows.push({
          label: `${rowLabelById(rowId)} • ${colLabelById(colId)}`,
          target: optionLabelFromPool(tgtId),
          prefill: { group_slug:'', row_id:String(rowId), col_id:String(colId), target_id:String(tgtId || '') }
        });
      });

      sbs.forEach(rt => {
        const gs    = (rt.group_slug || '').trim();
        const rowId = rt.row_id;
        const colId = rt.col_id;
        const tgtId = rt.next_question_id || '';

        rows.push({
          label: `${groupNameBySlug(gs)} • ${rowLabelById(rowId)} • ${colLabelById(colId)}`,
          target: optionLabelFromPool(tgtId),
          prefill: { group_slug:gs, row_id:String(rowId), col_id:String(colId), target_id:String(tgtId || '') }
        });
      });

      if (!rows.length) {
        existingEmpty.classList.remove('hidden');
        existingWrap.classList.remove('hidden');
        return;
      }

      const frag = document.createDocumentFragment();

      rows.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'border-t border-gray-800';

        const tdScope = document.createElement('td');
        tdScope.className = 'px-2 py-2';
        tdScope.textContent = item.label;

        const tdTarget = document.createElement('td');
        tdTarget.className = 'px-2 py-2 opacity-80';
        tdTarget.textContent = item.target;

        const tdBtn = document.createElement('td');
        tdBtn.className = 'px-2 py-2 text-right';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'text-xs underline opacity-90 hover:opacity-100';
        btn.textContent = 'Edit';
        btn.addEventListener('click', () => {
          if (_matrixMode === 'side_by_side') {
            if (selSbsGroup && item.prefill.group_slug) {
              selSbsGroup.value = item.prefill.group_slug;
              selSbsGroup.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          if (selMatrix) selMatrix.value = item.prefill.col_id || '';
          if (selRowPick) selRowPick.value = item.prefill.row_id || '';
          if (selTarget) selTarget.value = item.prefill.target_id || '';
          modal.querySelector('.confirm-modal-card')?.scrollTo?.({ top: 0, behavior: 'smooth' });
        });

        tdBtn.appendChild(btn);
        tr.appendChild(tdScope);
        tr.appendChild(tdTarget);
        tr.appendChild(tdBtn);

        frag.appendChild(tr);
      });

      existingTbody.appendChild(frag);
      existingWrap.classList.remove('hidden');
    }

    // ✅ bind refresh ONCE (not inside open handler)
    existingRefresh?.addEventListener('click', async () => {
      const qid = hidQid?.value;
      if (!qid) return;
      try {
        const res = await fetch(`${apiBase}${qid}/`);
        if (!res.ok) return;
        const data = await res.json();

        _lastData   = data;
        _matrixMode = data.matrix_mode || _matrixMode;
        _matrixCols = data.matrix_cols || _matrixCols;
        _matrixRows = data.matrix_rows || _matrixRows;

        if (data.question_type === 'MATRIX') renderExistingRoutes(data);
      } catch (e) {
        console.error(e);
      }
    });

    // Delegated click from any preview card’s routing button
    list.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-action="set-routing"]');
      if (!btn) return;
      ev.preventDefault();

      const qid = btn.getAttribute('data-qid');
      if (!qid) return;

      try {
        const res = await fetch(`${apiBase}${qid}/`);
        if (!res.ok) throw new Error('Failed to load question data');
        const data = await res.json();

        _lastData = data;

        hidQid.value   = String(qid);
        hidQtype.value = data.question_type || '';

        ctx.textContent = (data.text || '').trim() ? `Question: “${data.text}”` : `Question #${qid}`;

        // reset selects
        resetSelect(selChoice, '— Select a choice —');
        resetSelect(selMatrix, '— Select a column —');
        resetSelect(selRowPick, '— (optional) select a row —');
        resetSelect(selSbsGroup, '— Select a group —');

        // hide all rows initially
        choiceRow?.classList.add('hidden');
        matrixRow?.classList.add('hidden');
        hide(sbsGroupRow);
        hide(rowPickRow);
        if (colLabelEl) colLabelEl.textContent = 'For matrix column';

        // ✅ CHOICE QUESTIONS (restore)
        const choiceTypes = new Set(['SINGLE_CHOICE','MULTI_CHOICE','RATING','DROPDOWN','IMAGE_CHOICE']);
        if (choiceTypes.has(data.question_type)) {
          choiceRow?.classList.remove('hidden');

          (data.choices || []).forEach(c => {
            if (c && c.id != null) {
              const o = document.createElement('option');
              o.value = String(c.id);
              o.textContent = c.text ?? `Choice ${c.id}`;
              selChoice.appendChild(o);
            }
          });
        }

        // MATRIX
        if (data.question_type === 'MATRIX') {
          matrixRow?.classList.remove('hidden');

          _matrixMode = data.matrix_mode || '';
          _matrixCols = data.matrix_cols || [];
          _matrixRows = data.matrix_rows || [];

          renderMatrixRows();
          show(rowPickRow);

          if (_matrixMode === 'side_by_side') {
            show(sbsGroupRow);
            if (colLabelEl) colLabelEl.textContent = 'For column (within group)';

            const groups = Array.from(new Set((_matrixCols || [])
              .map(c => (c.group || '').trim())
              .filter(Boolean)
              .map(g => JSON.stringify({ name: g, slug: slugify(g) }))
            )).map(s => JSON.parse(s));

            resetSelect(selSbsGroup, '— Select a group —');
            groups.forEach(g => {
              const o = document.createElement('option');
              o.value = g.slug;
              o.textContent = g.name;
              selSbsGroup.appendChild(o);
            });

            selSbsGroup.onchange = () => {
              const gs = (selSbsGroup.value || '').trim();
              renderMatrixColsForGroup(gs);
            };

            renderMatrixColsForGroup('');
          } else {
            renderMatrixColsForGroup('');
          }

          renderExistingRoutes(data);
        } else {
          if (existingWrap) existingWrap.classList.add('hidden');
          clearExistingRoutesTable();
        }

        populateTargetsFromPool();
        openModal();
      } catch (e) {
        console.error(e);
        window.makeToast ? makeToast('Could not load question details', 'error') : alert('Could not load question details');
      }
    });

    modal.querySelector('#routing-cancel')?.addEventListener('click', closeModal);

    modal.querySelector('#routing-save')?.addEventListener('click', async () => {
      const qid   = hidQid.value;
      const qtype = hidQtype.value;

      const target = (selTarget?.value || '');
      const payload = { question_id: qid, target_question_id: target, scope: 'question' };

      const choiceTypes = new Set(['SINGLE_CHOICE','MULTI_CHOICE','RATING','DROPDOWN','IMAGE_CHOICE']);
      if (choiceTypes.has(qtype)) {
        const choiceId = (selChoice?.value || '').trim();
        if (!choiceId) {
          window.makeToast ? makeToast('Select a choice first.', 'warning') : alert('Select a choice first.');
          return;
        }
        payload.scope = 'choice';
        payload.choice_id = choiceId;
      }
      else if (qtype === 'MATRIX') {
        const colId = (selMatrix?.value || '').trim();
        if (!colId) {
          window.makeToast ? makeToast('Select a matrix column first.', 'warning') : alert('Select a matrix column first.');
          return;
        }

        const rowId = (selRowPick?.value || '').trim(); // optional
        const isSBS = (_matrixMode === 'side_by_side');

        if (isSBS) {
          const groupSlug = (selSbsGroup?.value || '').trim();
          if (!groupSlug) {
            window.makeToast ? makeToast('Select a group first.', 'warning') : alert('Select a group first.');
            return;
          }

          if (rowId) {
            payload.scope = 'sbs_cell';
            payload.group_slug = groupSlug;
            payload.matrix_row_id = rowId;
            payload.matrix_col_id = colId;
          } else {
            payload.scope = 'matrix_col';
            payload.matrix_col_id = colId;
          }
        } else {
          if (rowId) {
            payload.scope = 'matrix_cell';
            payload.matrix_row_id = rowId;
            payload.matrix_col_id = colId;
          } else {
            payload.scope = 'matrix_col';
            payload.matrix_col_id = colId;
          }
        }
      }

      try {
        const res = await fetch('/surveys/api/set-routing/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getCsrf(),
          },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });

        const maybeJson = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = (maybeJson && (maybeJson.detail || maybeJson.error)) || 'Failed to save routing';
          throw new Error(msg);
        }

        closeModal();
        window.makeToast ? makeToast('Routing saved.', 'success') : null;
        if (typeof updatePreview === 'function') updatePreview();
      } catch (e) {
        console.error(e);
        window.makeToast ? makeToast(`Could not save routing. ${e.message || ''}`, 'error') : alert('Could not save routing.');
      }
    });
  })();


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
    enableReorder();

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

    // delete click → open modal, and submit on confirm
    if (!w.SurveyWizard._deleteHookReady) {
      let pendingDeleteQid = null;

      const modalEl   = d.getElementById('confirm-delete-modal');
      const btnCancel = d.getElementById('cancel-delete');
      const btnOk     = d.getElementById('confirm-delete');

      function openDeleteModal(qid) {
        pendingDeleteQid = qid;
        if (!modalEl) return;
        modalEl.classList.remove('hidden');
        setTimeout(() => btnOk?.focus(), 0);
      }
      function closeDeleteModal() {
        pendingDeleteQid = null;
        if (!modalEl) return;
        modalEl.classList.add('hidden');
      }

      d.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-action="delete-in-wizard"]');
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();

        const qid = btn.getAttribute('data-qid');
        if (!qid) return;

        openDeleteModal(qid);
      });

      btnCancel?.addEventListener('click', (e) => {
        e.preventDefault();
        closeDeleteModal();
      });

      btnOk?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!pendingDeleteQid) { closeDeleteModal(); return; }

        const form  = d.getElementById('wizard-delete-form');
        const input = d.getElementById('wizard-delete-id');
        if (!form || !input) {
          console.warn('Delete form/field not found');
          closeDeleteModal();
          return;
        }
        input.value = pendingDeleteQid;
        closeDeleteModal();
        form.submit();
      });

      // close on backdrop or ESC
      modalEl?.addEventListener('click', (e) => {
        if (e.target === modalEl) closeDeleteModal();
      });
      d.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modalEl.classList.contains('hidden')) {
          closeDeleteModal();
        }
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
