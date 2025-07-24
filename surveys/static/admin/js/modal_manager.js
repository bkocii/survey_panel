// modal_manager.js

const ModalManager = (() => {
    let previousType = null;
    let pendingType = null;
    let onConfirmCallback = null;

    // Check if any inline forms exist
    function hasInlineForms() {
        const containers = [
            document.getElementById("choices-forms"),
            document.getElementById("matrix_rows-forms"),
            document.getElementById("matrix_cols-forms"),
        ];
        return containers.some(c => c && c.children.length > 0);
    }

    // Show the modal and store intended type + callback
    function showModal(newType, onConfirm) {
        pendingType = newType;
        onConfirmCallback = onConfirm;
        document.getElementById("confirm-switch-modal").classList.remove("hidden");
    }

    // Hide and reset the modal
    function hideModal() {
        pendingType = null;
        onConfirmCallback = null;
        document.getElementById("confirm-switch-modal").classList.add("hidden");
    }

    // Called when user confirms the modal
    function confirmModal() {
        if (pendingType && typeof onConfirmCallback === "function") {
            onConfirmCallback(pendingType);
            previousType = pendingType;
        }
        hideModal();
    }

    // Called when user cancels
    function cancelModal() {
        document.getElementById("id_question_type").value = previousType;
        hideModal();
    }

    // Public interface to handle question type changes
    function handleQuestionTypeSwitch(currentType, newType, onConfirmSwitch) {
        if (hasInlineForms()) {
            showModal(newType, onConfirmSwitch);
        } else {
            onConfirmSwitch(newType);
            previousType = newType;
        }
    }

    // Bind confirm/cancel modal buttons once
    function bindModalEvents() {
        const confirmBtn = document.getElementById("confirm-switch-type");
        const cancelBtn = document.getElementById("cancel-switch-type");

        if (confirmBtn) {
            confirmBtn.addEventListener("click", confirmModal);
        }
        if (cancelBtn) {
            cancelBtn.addEventListener("click", cancelModal);
        }
    }

    // Setup once on page load
    function init(initialType) {
        previousType = initialType;
        bindModalEvents();
    }

    return {
        init,
        handleQuestionTypeSwitch,
    };
})();
