import pytest

from ledger import storage, reporting
from ledger.importing import import_csv
from ledger.matching import find_invoice


@pytest.fixture
def db(tmp_path):
    db = storage.connect(tmp_path / 'test.sqlite3')
    storage.seed(db)
    yield db
    db.close()


def test_payment_matches_customer_and_invoice_not_amount(db):
    row = {
        'payment_id': 'TEST-P1',
        'customer_id': 'MAPLE',
        'invoice_number': 'INV-200',
        'amount': 1250.00,
    }

    invoice_id = find_invoice(db, row)

    invoice = db.execute(
        'SELECT customer_id, invoice_number '
        'FROM invoices WHERE id=?',
        (invoice_id,)
    ).fetchone()

    assert invoice['customer_id'] == 'MAPLE'
    assert invoice['invoice_number'] == 'INV-200'


def test_invoice_reimport_is_skipped(db):
    csv_text = (
        'customer_id,invoice_number,amount,due_date\n'
        'MAPLE,REG-001,125.50,2026-12-01\n'
    )

    first = import_csv(db, csv_text, 'invoices')
    second = import_csv(db, csv_text, 'invoices')

    assert first['imported'] == 1
    assert second['skipped'] == 1
    assert second['imported'] == 0

    count = db.execute(
        "SELECT COUNT(*) FROM invoices "
        "WHERE customer_id='MAPLE' AND invoice_number='REG-001'"
    ).fetchone()[0]

    assert count == 1


def test_invoice_conflict_is_rejected_and_original_preserved(db):
    original = (
        'customer_id,invoice_number,amount,due_date\n'
        'MAPLE,REG-002,200.00,2026-12-02\n'
    )

    conflict = (
        'customer_id,invoice_number,amount,due_date\n'
        'MAPLE,REG-002,250.00,2026-12-02\n'
    )

    assert import_csv(db, original, 'invoices')['imported'] == 1

    result = import_csv(db, conflict, 'invoices')

    assert result['rejected'] == 1
    assert 'different amount or due date' in result['errors'][0]['reason']

    row = db.execute(
        "SELECT amount FROM invoices "
        "WHERE customer_id='MAPLE' AND invoice_number='REG-002'"
    ).fetchone()

    assert row['amount'] == 200.00


def test_invalid_row_does_not_abort_valid_rows(db):
    csv_text = (
        'customer_id,invoice_number,amount,due_date\n'
        'MAPLE,REG-003,100.00,2026-12-03\n'
        'UNKNOWN,REG-004,200.00,2026-12-04\n'
        'NORTH,REG-005,300.00,2026-12-05\n'
    )

    result = import_csv(db, csv_text, 'invoices')

    assert result['imported'] == 2
    assert result['rejected'] == 1
    assert result['errors'][0]['line'] == 3

    assert db.execute(
        "SELECT COUNT(*) FROM invoices "
        "WHERE invoice_number='REG-003'"
    ).fetchone()[0] == 1

    assert db.execute(
        "SELECT COUNT(*) FROM invoices "
        "WHERE invoice_number='REG-005'"
    ).fetchone()[0] == 1


def test_status_filter_returns_requested_status(db):
    open_rows = reporting.invoices(db, 'open')
    paid_rows = reporting.invoices(db, 'paid')

    assert all(row['status'] == 'open' for row in open_rows)
    assert all(row['status'] == 'paid' for row in paid_rows)

    assert 'INV-101' not in [
        row['invoice_number'] for row in open_rows
    ]

    assert 'INV-101' in [
        row['invoice_number'] for row in paid_rows
    ]


def test_money_preserves_cents(db):
    db.execute(
        "INSERT INTO invoices "
        "(customer_id, invoice_number, amount, due_date) "
        "VALUES ('MAPLE', 'REG-006', 0.29, '2026-12-06')"
    )

    invoice_id = db.execute(
        "SELECT id FROM invoices WHERE invoice_number='REG-006'"
    ).fetchone()[0]

    db.execute(
        "INSERT INTO payments "
        "(payment_id, customer_id, invoice_number, amount, invoice_id) "
        "VALUES ('REG-P1', 'MAPLE', 'REG-006', 0.10, ?)",
        (invoice_id,)
    )

    db.commit()

    row = [
        r for r in reporting.invoices(db)
        if r['invoice_number'] == 'REG-006'
    ][0]

    assert row['balance'] == 0.19

    exported = reporting.export_csv(db)

    assert 'MAPLE,REG-006,0.29,0.10,0.19,open' in exported