document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
        let valid = true;

        const matrixBlocks = document.querySelectorAll('.matrix-block');

        matrixBlocks.forEach(matrix => {
            const matrixIsRequired = matrix.dataset.matrixRequired === 'true';
            const rows = matrix.querySelectorAll('.matrix-row');
            const columnHeaders = matrix.querySelectorAll('thead th[data-col-index]');

            // Validate each row (if required)
            rows.forEach(row => {
                const rowIsRequired = row.dataset.required === 'true' || matrixIsRequired;
                if (!rowIsRequired) return;

                const inputs = row.querySelectorAll('input, select');
                let rowValid = Array.from(inputs).some(input => {
                    if (input.type === 'checkbox' || input.type === 'radio') return input.checked;
                    if (input.tagName === 'SELECT') return input.value.trim() !== '';
                    if (input.type === 'text') return input.value.trim() !== '';
                    return false;
                });

                if (!rowValid) {
                    valid = false;
                    row.classList.add('matrix-error');
                } else {
                    row.classList.remove('matrix-error');
                }
            });

            // Validate each required column
            columnHeaders.forEach(header => {
                const colIndex = header.dataset.colIndex;
                const isColRequired = header.dataset.required === 'true';
                if (!isColRequired) return;

                rows.forEach(row => {
                    const cell = row.querySelector(`td[data-col-index="${colIndex}"]`);
                    if (!cell) return;

                    const input = cell.querySelector('input, select');
                    if (!input) return;

                    const filled =
                        (input.type === 'checkbox' || input.type === 'radio') ? input.checked :
                        (input.tagName === 'SELECT') ? input.value.trim() !== '' :
                        (input.type === 'text') ? input.value.trim() !== '' :
                        false;

                    if (!filled) {
                        valid = false;
                        input.classList.add('matrix-error');
                    } else {
                        input.classList.remove('matrix-error');
                    }
                });
            });
        });

        if (!valid) {
            e.preventDefault();
            alert('Please complete all required matrix fields.');
        }
    });
});
