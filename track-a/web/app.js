(() => {
  const currency = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  });

  const money = n => currency.format(n);

  const text = (tag, value, className = '') => {
    const node = document.createElement(tag);
    node.textContent = value;

    if (className) {
      node.className = className;
    }

    return node;
  };

  async function refresh() {
    const statusElement = document.querySelector('#status');

    if (!statusElement) {
      throw new Error('Status filter was not found.');
    }

    const status = statusElement.value;

    const responses = await Promise.all([
      fetch('/api/overview'),
      fetch(`/api/invoices?status=${encodeURIComponent(status)}`)
    ]);

    if (responses.some(response => !response.ok)) {
      throw new Error('Could not refresh the register.');
    }

    const [data, rows] = await Promise.all(
      responses.map(response => response.json())
    );

    const invoiceCount = document.querySelector('#invoice-count');
    const openCount = document.querySelector('#open-count');
    const outstanding = document.querySelector('#outstanding');
    const unmatchedCount = document.querySelector('#unmatched-count');
    const invoiceBody = document.querySelector('#invoices');
    const unmatchedList = document.querySelector('#unmatched');
    const pageError = document.querySelector('#page-error');

    if (
      !invoiceCount ||
      !openCount ||
      !outstanding ||
      !unmatchedCount ||
      !invoiceBody ||
      !unmatchedList
    ) {
      throw new Error('ClearLedger page elements were not found.');
    }

    invoiceCount.textContent = data.summary.invoice_count;
    openCount.textContent = data.summary.open_count;
    outstanding.textContent = money(data.summary.outstanding);
    unmatchedCount.textContent = data.unmatched_payments.length;

    invoiceBody.replaceChildren();

    rows.forEach(rowData => {
      const row = document.createElement('tr');

      row.append(
        text('td', rowData.customer_name),
        text('td', rowData.invoice_number),
        text('td', rowData.due_date)
      );

      row.append(
        text('td', money(rowData.amount), 'number'),
        text('td', money(rowData.paid), 'number'),
        text('td', money(rowData.balance), 'number'),
        text('td', rowData.status)
      );

      invoiceBody.append(row);
    });

    unmatchedList.replaceChildren();

    data.unmatched_payments.forEach(payment => {
      unmatchedList.append(
        text(
          'li',
          `${payment.payment_id} · ${payment.customer_id} / ${payment.invoice_number} · ${money(payment.amount)}`
        )
      );
    });

    if (!data.unmatched_payments.length) {
      unmatchedList.append(
        text('li', 'No unmatched payments.')
      );
    }

    if (pageError) {
      pageError.textContent = '';
    }
  }

  async function submitImport(form) {
    const feedback = form.querySelector('.feedback');
    const button = form.querySelector('button');
    const input = form.querySelector('input[type="file"]');

    if (!feedback || !button || !input) {
      return;
    }

    button.disabled = true;
    feedback.textContent = 'Importing…';

    try {
      if (!input.files || !input.files.length) {
        throw new Error('Choose a CSV file.');
      }

      const csv = await input.files[0].text();

      const response = await fetch(
        `/api/import?kind=${encodeURIComponent(form.dataset.kind)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/csv'
          },
          body: csv
        }
      );

      let result = null;

      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (!response.ok) {
        const reason =
          result && result.error
            ? result.error
            : `Import failed with HTTP ${response.status}.`;

        throw new Error(reason);
      }

      const summary = [
        `Imported: ${result.imported ?? 0}`,
        `Skipped: ${result.skipped ?? 0}`,
        `Rejected: ${result.rejected ?? 0}`
      ];

      if (result.errors && result.errors.length) {
        const errors = result.errors
          .map(error => `line ${error.line}: ${error.reason}`)
          .join('; ');

        summary.push(errors);
      }

      feedback.textContent = summary.join(' | ');

      await refresh();

    } catch (error) {
      feedback.textContent = `Import failed: ${error.message}`;

    } finally {
      button.disabled = false;
    }
  }

  function initialise() {
    const statusElement = document.querySelector('#status');

    if (!statusElement) {
      console.error('ClearLedger: #status element not found.');
      return;
    }

    statusElement.addEventListener('change', () => {
      refresh().catch(error => {
        const pageError = document.querySelector('#page-error');

        if (pageError) {
          pageError.textContent = error.message;
        }

        console.error('ClearLedger refresh error:', error);
      });
    });

    document
      .querySelectorAll('form[data-kind]')
      .forEach(form => {
        form.addEventListener('submit', event => {
          event.preventDefault();
          submitImport(form);
        });
      });

    refresh().catch(error => {
      const pageError = document.querySelector('#page-error');

      if (pageError) {
        pageError.textContent = error.message;
      }

      console.error('ClearLedger initial load error:', error);
    });
  }

  // Expose functions globally for debugging.
  window.clearLedgerRefresh = refresh;
  window.clearLedgerSubmitImport = submitImport;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise);
  } else {
    initialise();
  }

})();
