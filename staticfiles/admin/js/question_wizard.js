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
        window.updatePreview = updatePreview;

    }


    // 📦 Show/hide and reset inline form blocks (Choices, Matrix rows/cols)
    let previousQuestionType = null;

    function toggleInlinesByType() {
        const type = document.getElementById("id_question_type")?.value;

        const inlineBlocks = {
            "choice-inline": {
                prefix: "choices",
                types: ["MC", "RATING", "DROPDOWN", "IMAGE_CHOICE", "IMAGE_RATING"]
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


    previousQuestionType = document.getElementById("id_question_type")?.value;

    // Initialize modal manager with the current question type
    ModalManager.init(document.getElementById("id_question_type")?.value);

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
                previousQuestionType = type;
            }
        );
    });

    document.getElementById("question_lookup")?.addEventListener("change", async function () {
        const selectedId = this.value;
        if (!selectedId) return;

        const response = await fetch(`/admin/surveys/api/question-data/${selectedId}/`);
        const data = await response.json();

        // Populate fields
        document.getElementById("id_text").value = data.text || "";
        document.getElementById("id_question_type").value = data.question_type || "";
        document.getElementById("id_helper_text").value = data.helper_text || "";

        // Force type refresh
        updateFieldVisibility();
        toggleInlinesByType();

        // Clear any existing inlines
        clearInlineForms();

        // Add choices
        if (data.choices && data.choices.length > 0) {
            data.choices.forEach(choice => {
                addForm("choices");
                const prefix = `id_choices-${document.getElementById("id_choices-TOTAL_FORMS").value - 1}`;
                document.getElementById(`${prefix}-text`).value = choice.text;
                document.getElementById(`${prefix}-value`).value = choice.value;
                if (choice.next_question_id) {
                    document.getElementById(`${prefix}-next_question`).value = choice.next_question_id;
                }
            });
        }

        // Add matrix rows
        if (data.matrix_rows) {
            data.matrix_rows.forEach(row => {
                addForm("matrix_rows");
                const prefix = `id_matrix_rows-${document.getElementById("id_matrix_rows-TOTAL_FORMS").value - 1}`;
                document.getElementById(`${prefix}-text`).value = row.text;
                document.getElementById(`${prefix}-value`).value = row.value;
                document.getElementById(`${prefix}-required`).checked = row.required;
            });
        }

        // Add matrix columns
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
    });

    // Helper to clear current inlines
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


    // 🔓 Make `addForm` accessible globally (optional)
    window.addForm = addForm;

});


