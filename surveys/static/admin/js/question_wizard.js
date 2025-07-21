// question_wizard.js

document.addEventListener("DOMContentLoaded", function () {

    // 🔄 Show/hide specific question field groups based on selected type
    function updateFieldVisibility() {
        const type = document.getElementById("id_question_type")?.value;
        const fieldGroups = document.querySelectorAll(".question-field");

        // Hide all custom fields by default
        fieldGroups.forEach(group => group.style.display = "none");

        // Always-visible fields
        const alwaysFields = [
            "text-field", "question_type-field", "required-field",
            "helper_text-field", "helper_media-field", "helper_media_type-field", "next_question"
        ];
        alwaysFields.forEach(cls => {
            document.querySelector("." + cls)?.style.setProperty("display", "block");
        });

        // Show choices-related fields
        if (["MC", "DROPDOWN", "RATING", "IMAGE_CHOICE", "IMAGE_RATING"].includes(type)) {
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
    }

    // 📦 Show/hide the inline form blocks (Choices, Matrix rows/cols)
    function toggleInlinesByType() {
        const type = document.getElementById("id_question_type")?.value;

        // Hide all initially
        document.getElementById("choice-inline")?.classList.add("hidden");
        document.getElementById("matrix-row-inline")?.classList.add("hidden");
        document.getElementById("matrix-column-inline")?.classList.add("hidden");

        // Show based on question type
        if (["MC", "RATING", "DROPDOWN", "IMAGE_CHOICE"].includes(type)) {
            document.getElementById("choice-inline")?.classList.remove("hidden");
        } else if (type === "MATRIX") {
            document.getElementById("matrix-row-inline")?.classList.remove("hidden");
            document.getElementById("matrix-column-inline")?.classList.remove("hidden");
        }
    }

    // 🧩 Add a new form to the specified formset (choices, rows, cols)
    function addForm(prefix) {
        const totalForms = document.getElementById(`id_${prefix}-TOTAL_FORMS`);
        const container = document.getElementById(`${prefix}-forms`);
        const template = document.getElementById(`${prefix}-template`);

        if (!totalForms || !container || !template) {
            console.error("Missing elements for prefix:", prefix);
            return;
        }

        const formCount = parseInt(totalForms.value);
        const html = template.innerHTML.trim().replaceAll('__prefix__', formCount);

        // Create new DOM element safely
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const newForm = doc.body.firstElementChild;

        if (!newForm) {
            console.error("Could not parse new form");
            return;
        }

        // Add new form and increment total count
        container.appendChild(newForm);
        totalForms.value = formCount + 1;

        // Hook preview events to new inputs
        newForm.querySelectorAll("input, select, textarea").forEach(input => {
            input.addEventListener("input", updatePreview);
            input.addEventListener("change", updatePreview);
        });

        updatePreview();
    }

    // 🔍 Generate live question preview
    function updatePreview() {
        const preview = document.getElementById("question-preview");
        const type = document.getElementById("id_question_type")?.value;
        const text = document.getElementById("id_text")?.value || "";
        const helper = document.getElementById("id_helper_text")?.value || "";

        let html = `<h3 class="font-bold text-lg">${text}</h3>`;
        if (helper) html += `<p class="text-sm text-gray-500">${helper}</p>`;

        // Show choices
        if (["MC", "DROPDOWN", "IMAGE_CHOICE"].includes(type)) {
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

        preview.innerHTML = html || "<em class='text-gray-400'>Nothing to preview yet.</em>";
    }

    // 🧠 Initial setup on page load
    toggleInlinesByType();
    updateFieldVisibility();
    updatePreview();

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
    document.getElementById("id_question_type")?.addEventListener("change", () => {
        toggleInlinesByType();
        updateFieldVisibility();
        updatePreview();
    });

    // 🔓 Make `addForm` accessible globally (optional)
    window.addForm = addForm;
});
