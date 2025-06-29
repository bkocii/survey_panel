document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
        let valid = true;

        const matrixBlocks = document.querySelectorAll('.matrix-block');

        matrixBlocks.forEach(matrix => {
            const matrixIsRequired = matrix.dataset.matrixRequired === 'true';
            const rows = matrix.querySelectorAll('.matrix-row');

            // Map: column index → isRequired
            const columnRequiredMap = {};
            const columnHeaders = matrix.querySelectorAll('thead th[data-required]');
            columnHeaders.forEach((th, index) => {
                if (th.dataset.required === 'true') {
                    columnRequiredMap[index] = true;
                }
            });

            // Column validation per index
            Object.keys(columnRequiredMap).forEach(colIndex => {
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    const cell = cells[colIndex];
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

            // Row-level validation
            rows.forEach(row => {
                const rowIsRequired = row.dataset.required === 'true' || matrixIsRequired;
                const inputs = row.querySelectorAll('input, select');
                let rowValid = false;

                inputs.forEach(input => {
                    const filled =
                        (input.type === 'checkbox' || input.type === 'radio') ? input.checked :
                        (input.tagName === 'SELECT') ? input.value.trim() !== '' :
                        (input.type === 'text') ? input.value.trim() !== '' :
                        false;

                    if (filled) rowValid = true;
                });

                if (rowIsRequired && !rowValid) {
                    valid = false;
                    row.classList.add('matrix-error');
                } else {
                    row.classList.remove('matrix-error');
                }
            });
        });

        if (!valid) {
            e.preventDefault();
            alert('Please complete all required matrix fields.');
        }
    });
});
