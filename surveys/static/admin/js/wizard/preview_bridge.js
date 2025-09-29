// surveys/static/admin/js/wizard/preview_bridge.js
(function (w, d) {
  // Tiny bus (shared if not present)
  const bus = (w.SurveyWizard = w.SurveyWizard || {}).bus || (() => {
    const h = {};
    return (w.SurveyWizard.bus = {
      on: (evt, fn) => ((h[evt] ||= []).push(fn)),
      emit: (evt, data) => (h[evt] || []).forEach(fn => fn(data))
    });
  })();

  // Helpers that rely on your wizard DOM structure
  function setVal(id, val) {
    const el = d.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = (val ?? '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function resetFormset(prefix) {
    const total = d.getElementById(`id_${prefix}-TOTAL_FORMS`);
    const container = d.getElementById(`${prefix}-forms`);
    if (container) container.innerHTML = '';
    if (total) total.value = 0;
  }

  // Reuse your existing helper from bulk_add.js
  function addFormWithValue(prefix, label, value) {
    if (typeof w.addFormWithValue === 'function') {
      w.addFormWithValue(prefix, label, value);
      return true;
    }
    return false;
  }

  // After cloning a matrix col, set extra fields (input_type, group, required, order)
  function setMatrixColExtras(index, payloadCol) {
    const labelSel = d.getElementById(`id_matrix_cols-${index}-label`);
    if (!labelSel) return;

    const vSel   = d.getElementById(`id_matrix_cols-${index}-value`);
    const tSel   = d.getElementById(`id_matrix_cols-${index}-input_type`);
    const gSel   = d.getElementById(`id_matrix_cols-${index}-group`);
    const rSel   = d.getElementById(`id_matrix_cols-${index}-required`);
    const oSel   = d.getElementById(`id_matrix_cols-${index}-order`);

    if (vSel) vSel.value = payloadCol.value ?? '';
    if (tSel) tSel.value = payloadCol.input_type || 'radio';
    if (gSel) gSel.value = payloadCol.group || '';
    if (rSel) rSel.checked = !!payloadCol.required;
    if (oSel && payloadCol.order != null) oSel.value = payloadCol.order;

    [vSel,tSel,gSel,rSel,oSel].forEach(el => {
      if (el) {
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
      }
    });
  }

  // Main loader
  function loadIntoWizard(p) {
    // Top-level fields
    setVal('id_question_type', p.question_type || '');
    setVal('id_code', p.code || '');
    setVal('id_text', p.text || '');
    setVal('id_helper_text', p.helper_text || '');
    setVal('id_required', !!p.required);

    setVal('id_matrix_mode', p.matrix_mode || '');
    setVal('id_min_value', p.min_value);
    setVal('id_max_value', p.max_value);
    setVal('id_step_value', p.step_value);

    setVal('id_allow_multiple_files', !!p.allow_multiple_files);
    setVal('id_allows_multiple', !!p.allows_multiple);

    if (p.next_question_id) setVal('id_next_question', p.next_question_id);

    // Clear and rebuild formsets
    resetFormset('choices');
    resetFormset('matrix_rows');
    resetFormset('matrix_cols');

    // Choices
    if (Array.isArray(p.choices)) {
      p.choices.forEach((c) => {
        // text + value
        addFormWithValue('choices', c.text || '', c.value ?? '');
        // Images cannot be pre-filled by JS for security reasons
        // (leave file input empty; admin will show "current file" only if this were bound to instance)
      });
    }

    // Matrix rows
    if (Array.isArray(p.matrix_rows)) {
      p.matrix_rows.forEach((r) => {
        addFormWithValue('matrix_rows', r.text || '', r.value ?? '');
        // ensure required on rows (your addFormWithValue already pre-checks for rows)
        const total = parseInt(d.getElementById('id_matrix_rows-TOTAL_FORMS')?.value || '0', 10);
        const idx = total - 1;
        const req = d.getElementById(`id_matrix_rows-${idx}-required`);
        if (req) {
          req.checked = !!r.required;
          req.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    // Matrix cols
    if (Array.isArray(p.matrix_cols)) {
      p.matrix_cols.forEach((c) => {
        addFormWithValue('matrix_cols', c.label || '', c.value ?? '');
        const total = parseInt(d.getElementById('id_matrix_cols-TOTAL_FORMS')?.value || '0', 10);
        const idx = total - 1;
        setMatrixColExtras(idx, c);
      });
    }

    // Force any UI logic (show/hide) and re-render preview
    if (typeof w.applyChoiceImageVisibility === 'function') {
      w.applyChoiceImageVisibility(d);
    }
    if (typeof w.SurveyWizard?.updatePreview === 'function') {
      w.SurveyWizard.updatePreview();
    }
    // Optional: scroll form to top
    d.getElementById('id_text')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Wire the bus event
  bus.on('loadIntoWizard', loadIntoWizard);
})(window, document);
