document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
        const matrixQuestions = document.querySelectorAll('[data-matrix-required="true"]');
        let valid = true;

        matrixQuestions.forEach(matrix => {
            const rows = matrix.querySelectorAll('[data-matrix-row]');
            rows.forEach(row => {
                const checkboxes = row.querySelectorAll('input[type="radio"], input[type="checkbox"]');
                const oneChecked = Array.from(checkboxes).some(input => input.checked);
                if (!oneChecked) {
                    valid = false;
                    row.classList.add('matrix-error');
                } else {
                    row.classList.remove('matrix-error');
                }
            });
        });

        if (!valid) {
            e.preventDefault();
            alert("Please complete all required matrix rows.");
        }
    });
});
