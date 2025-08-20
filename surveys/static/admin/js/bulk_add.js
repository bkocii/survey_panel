document.addEventListener("DOMContentLoaded", function () {
    // Show modal
    document.querySelectorAll(".bulk-add-btn").forEach(button => {
        button.addEventListener("click", function () {
            const targetPrefix = this.dataset.prefix;
            const modal = document.getElementById("bulk-add-modal");
            const textarea = document.getElementById("bulk-add-input");

            modal.dataset.prefix = targetPrefix;
            textarea.value = "";
            modal.classList.remove("hidden");
            textarea.focus();
        });
    });

    // Close modal
    document.getElementById("bulk-add-cancel").addEventListener("click", () => {
        document.getElementById("bulk-add-modal").classList.add("hidden");
    });

    // Confirm bulk add
    document.getElementById("bulk-add-confirm").addEventListener("click", () => {
      const modal = document.getElementById("bulk-add-modal");
      const prefix = modal.dataset.prefix;
      const textarea = document.getElementById("bulk-add-input");
      applyBulkInsert(prefix, textarea.value);
      modal.classList.add("hidden");
    });


    // Parse comma or newline-separated values
    function parseBulkInput(text) {
        if (text.includes(",")) {
            return text.split(",").map(s => s.trim()).filter(Boolean);
        } else {
            return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        }
    }

    function applyBulkInsert(prefix, raw) {
      const lines = parseBulkInput(raw);
      if (!lines.length) return;

      lines.forEach((line) => {
        // Support "Label|123" format; fall back to auto value
        const parts = line.split('|').map(s => s.trim()).filter(Boolean);
        const label = parts[0] || '';
        const explicitVal = parts[1] && !isNaN(Number(parts[1])) ? Number(parts[1]) : null;

        const created = addForm(prefix);
        if (!created) return;
        const { index } = created;

        if (prefix === 'choices') {
          const vEl = document.getElementById(`id_choices-${index}-value`);
          const tEl = document.getElementById(`id_choices-${index}-text`);
          if (vEl) vEl.value = explicitVal ?? (index + 1);
          if (tEl) tEl.value = label;
          if (vEl) vEl.dispatchEvent(new Event('input', { bubbles: true }));
          if (tEl) tEl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (prefix === 'matrix_rows') {
          const tEl = document.getElementById(`id_matrix_rows-${index}-text`);
          const vEl = document.getElementById(`id_matrix_rows-${index}-value`);
          if (tEl) tEl.value = label;
          if (vEl) vEl.value = explicitVal ?? (index + 1);
          if (tEl) tEl.dispatchEvent(new Event('input', { bubbles: true }));
          if (vEl) vEl.dispatchEvent(new Event('input', { bubbles: true }));
          // required stays pre-checked (from addForm)
        }

        if (prefix === 'matrix_cols') {
          const lEl = document.getElementById(`id_matrix_cols-${index}-label`);
          const vEl = document.getElementById(`id_matrix_cols-${index}-value`);
          if (lEl) lEl.value = label;
          if (vEl) vEl.value = explicitVal ?? (index + 1);
          if (lEl) lEl.dispatchEvent(new Event('input', { bubbles: true }));
          if (vEl) vEl.dispatchEvent(new Event('input', { bubbles: true }));
          // group/input_type/order are optional; user can fill later (or auto-hidden if not SBS)
        }
      });

      if (typeof updatePreview === "function") updatePreview();
    }


    // Add a new form with a label and optional value
    function addFormWithValue(prefix, label, value) {
        const totalForms = document.getElementById(`id_${prefix}-TOTAL_FORMS`);
        const container = document.getElementById(`${prefix}-forms`);
        const template = document.getElementById(`${prefix}-template`);

        if (!totalForms || !container || !template) return;

        const formCount = parseInt(totalForms.value);
        let html = template.innerHTML.replaceAll('__prefix__', formCount);

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const newForm = doc.body.firstElementChild;

        // ✅ Pre-check required if this is a matrix row
        if (prefix === 'matrix_rows') {
            const req = newForm.querySelector("input[type='checkbox'][name$='-required']");
            if (req) req.checked = true;
}
        // Fill first text input and value input if present
        const textInput = newForm.querySelector("input[type='text']");
        const valueInput = newForm.querySelector("input[type='number']");

        if (textInput) {
            textInput.value = label;
            textInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (valueInput && !isNaN(value)) {
            valueInput.value = value;
            valueInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Hook preview on all inputs
        newForm.querySelectorAll("input, select, textarea").forEach(input => {
            input.addEventListener("input", () => {
                if (typeof updatePreview === "function") updatePreview();
            });
            input.addEventListener("change", () => {
                if (typeof updatePreview === "function") updatePreview();
            });
        });

        container.appendChild(newForm);
        totalForms.value = formCount + 1;

        // Trigger preview after all
        if (typeof updatePreview === "function") updatePreview();
        if (typeof window.applyChoiceImageVisibility === 'function') {
          window.applyChoiceImageVisibility(document);
        }
    }
});