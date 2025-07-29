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
        const values = parseBulkInput(textarea.value);

        values.forEach((label, index) => {
            addFormWithValue(prefix, label.trim(), index + 1);
        });

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
    }

});