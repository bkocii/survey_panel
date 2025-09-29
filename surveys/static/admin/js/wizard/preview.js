// surveys/static/admin/js/wizard/preview.js
(function (w, d) {
  function h(s) { return (s ?? "").toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function v(id) { const el = d.getElementById(id); return el ? el.value || "" : ""; }
  function bool(id) { const el = d.getElementById(id); return !!(el && el.checked); }

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

    let html = "";
    if (text)   html += `<h4 class="fw-semibold mb-1">${h(text)}</h4>`;
    if (helper) html += `<p class="small text-muted mb-2">${h(helper)}</p>`;

    const choices = collectChoices();

    if (type === "SINGLE_CHOICE") {
      html += '<div class="d-flex flex-column gap-1">';
      choices.forEach(c => {
        html += `<label class="form-check">
          <input type="radio" disabled class="form-check-input"> <span class="form-check-label">${h(c.text)}</span>
        </label>`;
      });
      html += '</div>';
    }

    if (type === "MULTI_CHOICE") {
      html += '<div class="d-flex flex-column gap-1">';
      choices.forEach(c => {
        html += `<label class="form-check">
          <input type="checkbox" disabled class="form-check-input"> <span class="form-check-label">${h(c.text)}</span>
        </label>`;
      });
      html += '</div>';
    }

    if (type === "DROPDOWN") {
      html += `<select class="form-select" disabled>
        <option>-- Select an option --</option>
        ${choices.map(c => `<option>${h(c.text)}</option>`).join("")}
      </select>`;
    }

    if (type === "YESNO") {
      html += `<div class="d-flex gap-3">
        <label class="form-check"><input type="radio" disabled class="form-check-input"> Yes</label>
        <label class="form-check"><input type="radio" disabled class="form-check-input"> No</label>
      </div>`;
    }

    if (type === "NUMBER") {
      html += `<input type="number" class="form-control" disabled placeholder="Number">`;
    }

    if (type === "SLIDER") {
      const min = v("id_min_value") || 0;
      const max = v("id_max_value") || 100;
      const step = v("id_step_value") || 1;
      html += `<div class="mb-1 small">Value: <span>${h(min)}</span></div>
        <input type="range" min="${h(min)}" max="${h(max)}" step="${h(step)}" value="${h(min)}" class="form-range" disabled>`;
    }

    if (type === "DATE") {
      html += `<div class="input-group">
        <input type="text" class="form-control" disabled placeholder="Select a date">
        <button class="btn btn-outline-secondary" type="button" disabled><i class="bi bi-calendar"></i></button>
      </div>`;
    }

    if (type === "GEOLOCATION") {
      html += `<div class="border rounded" style="height:180px; background:#0b0b0f22; display:flex; align-items:center; justify-content:center;">
        <span class="small text-muted">Map preview</span>
      </div>`;
    }

    if (type === "PHOTO_UPLOAD") {
      const multi = bool("id_allow_multiple_files");
      html += `<input type="file" class="form-control" disabled accept="image/*" ${multi ? "multiple": ""}>`;
    }

    if (type === "VIDEO_UPLOAD") {
      html += `<input type="file" class="form-control" disabled accept="video/*">`;
    }

    if (type === "AUDIO_UPLOAD") {
      html += `<input type="file" class="form-control" disabled accept="audio/*">`;
    }

    if (type === "RATING") {
      if (choices.length) {
        html += '<div class="d-flex gap-2 align-items-center">';
        choices.forEach(c => {
          html += `<label class="form-check form-check-inline">
            <input type="radio" disabled class="form-check-input"> <span class="form-check-label">${h(c.text)}</span>
          </label>`;
        });
        html += '</div>';
      } else {
        html += renderStars(5);
      }
    }

    if (type === "IMAGE_CHOICE") {
      const multi = bool("id_allows_multiple");
      html += `<div class="row">`;
      choices.forEach(c => {
        html += `<div class="col-6 col-md-4 text-center mb-3">
          <div class="form-check">
            <input type="${multi ? "checkbox":"radio"}" disabled class="form-check-input">
          </div>
          <div class="border rounded mt-2" style="height:80px; display:flex; align-items:center; justify-content:center;">
            <span class="small text-muted">${c.imageName ? h(c.imageName) : "image"}</span>
          </div>
          <div class="mt-2 small">${h(c.text)}</div>
        </div>`;
      });
      html += `</div>`;
    }

    if (type === "IMAGE_RATING") {
      html += `<div class="row">`;
      choices.forEach(c => {
        html += `<div class="col-6 col-md-4 text-center mb-3">
          <div class="border rounded mb-2" style="height:80px; display:flex; align-items:center; justify-content:center;">
            <span class="small text-muted">${c.imageName ? h(c.imageName) : "image"}</span>
          </div>
          <div class="d-flex justify-content-center gap-2 mb-2">${renderStars(5)}</div>
          <div class="small">${h(c.text)}</div>
        </div>`;
      });
      html += `</div>`;
    }

    if (type === "MATRIX") {
      const mode = v("id_matrix_mode") || "single";
      const rows = collectMatrixRows();
      const cols = collectMatrixCols();

      if (!rows.length || !cols.length) {
        html += `<div class="small text-muted">Add rows and columns to preview the matrix…</div>`;
      } else if (mode === "side_by_side") {
        const groups = {};
        cols.forEach(c => { (groups[c.group] ||= []).push(c); });

        html += `<div class="table-responsive"><table class="table table-bordered align-middle small"><thead><tr><th rowspan="2">Item</th>`;
        Object.keys(groups).forEach(g => { html += `<th class="text-center">${h(g)}</th>`; });
        html += `</tr><tr>`;
        Object.values(groups).forEach(colsInGroup => {
          const t = colsInGroup[0]?.input_type || "radio";
          if (t === "radio" || t === "checkbox") {
            html += `<th><div class="d-flex justify-content-around">${colsInGroup.map(c => `<span class="small text-nowrap">${h(c.label)}</span>`).join("")}</div></th>`;
          } else {
            html += `<th>&nbsp;</th>`;
          }
        });
        html += `</tr></thead><tbody>`;

        rows.forEach(r => {
          html += `<tr><td>${h(r.text)}</td>`;
          Object.values(groups).forEach(colsInGroup => {
            const t = colsInGroup[0]?.input_type || "radio";
            if (t === "text") {
              html += `<td><input type="text" class="form-control" disabled></td>`;
            } else if (t === "select") {
              html += `<td><select class="form-select" disabled>
                <option>-- Choose --</option>${colsInGroup.map(c => `<option>${h(c.label)}</option>`).join("")}
              </select></td>`;
            } else if (t === "radio" || t === "checkbox") {
              html += `<td><div class="d-flex justify-content-around">
                ${colsInGroup.map(() => `<input type="${t}" class="form-check-input" disabled>`).join("")}
              </div></td>`;
            } else {
              html += `<td></td>`;
            }
          });
          html += `</tr>`;
        });

        html += `</tbody></table></div>`;
      } else if (mode === "multi") {
        html += `<div class="table-responsive"><table class="table table-bordered small"><thead><tr><th></th>${
          cols.map(c => `<th>${h(c.label)}</th>`).join("")
        }</tr></thead><tbody>`;
        rows.forEach(r => {
          html += `<tr><td>${h(r.text)}</td>${
            cols.map(() => `<td><input type="checkbox" class="form-check-input" disabled></td>`).join("")
          }</tr>`;
        });
        html += `</tbody></table></div>`;
      } else {
        html += `<div class="table-responsive"><table class="table table-bordered small"><thead><tr><th></th>${
          cols.map(c => `<th>${h(c.label)}</th>`).join("")
        }</tr></thead><tbody>`;
        rows.forEach(r => {
          html += `<tr><td>${h(r.text)}</td>${
            cols.map(() => `<td><input type="radio" class="form-check-input" disabled></td>`).join("")
          }</tr>`;
        });
        html += `</tbody></table></div>`;
      }
    }

    if (!html.trim()) {
      const tpl = d.getElementById("preview-placeholder");
      const placeholder = tpl ? tpl.innerHTML : "<em class='text-gray-400 dark:text-gray-500 italic'>Start typing…</em>";
      return placeholder;
    }
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

  function renderExistingCard(p) {
    const code = p.code || "(no code)";
    const type = p.question_type || "";
    const helper = p.helper_text || "";
    const summary = summarizePayload(p);

    return `
      <div class="preview-card" data-qid="${p.id || ''}">
        <div class="card-head">
          <div class="meta">
            <span class="badge">${h(code)}</span>
            <span class="badge">${h(type)}</span>
          </div>
          <div class="meta">
            <button type="button"
                  class="btn btn-sm btn-outline-secondary"
                  data-action="edit-in-wizard"
                  data-qid="${p.id || ''}">
            Edit
          </button>
          </div>
        </div>
        <div class="body">
          <div class="fw-semibold mb-1">${h(p.text || '')}</div>
          ${helper ? `<div class="small text-muted mb-1">${h(helper)}</div>` : ""}
          <div class="small">${h(summary)}</div>
        </div>
      </div>
    `;
  }

  function renderDraftCard() {
    const type = v("id_question_type");
    const code = v("id_code") || "(no code)";
    const header = `
      <div class="card-head">
        <div class="meta">
          <span class="badge">${h(code)}</span>
          <span class="badge">${h(type || "—")}</span>
        </div>
        <div class="meta">
          <span class="badge">Draft</span>
        </div>
      </div>
    `;
    return `<div class="preview-card draft">${header}<div class="body">${renderCurrentQuestionHTML()}</div></div>`;
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
