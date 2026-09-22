# ClearLedger — Track A Handover

## 1. Summary

Repaired the ClearLedger register across import, matching, reporting, and browser behavior.

The main fixes address:

* Payment matching using the required customer + invoice identity.
* Invoice duplicate and conflict handling.
* Payment duplicate and conflict handling.
* Invalid CSV rows being rejected individually without aborting valid rows.
* Correct invoice status filtering.
* Accurate two-decimal money handling.
* Browser import result reporting and failure handling.
* Browser refresh after processed imports.
* Unmatched payment visibility.

A small improvement beyond the stated business rules was also added: an **Unmatched payments** metric to the dashboard.

---

## 2. Defects Investigated and Repaired

### Defect 1 — Payment matching used amount-first behavior

**Problem**

A payment could be associated with an invoice based on amount instead of the required invoice identity.

**Required behavior**

Payment matching must use:

`customer_id + invoice_number`

Amount alone must not establish invoice identity.

**Repair**

Updated `ledger/matching.py` so payment matching first finds the invoice using the exact customer ID and invoice number.

**Verification**

A payment for:

* Customer: `MAPLE`
* Invoice: `INV-200`
* Amount: `1250.00`

was matched to `MAPLE / INV-200` rather than another invoice having the same amount.

---

### Defect 2 — Invoice duplicate/conflict handling

**Problem**

Invoice re-import and conflicting invoice records did not consistently preserve the original register record.

**Required behavior**

Invoice identity is:

`(customer_id, invoice_number)`

An identical invoice re-import must be skipped.

The same identity with a different amount or due date must be rejected while preserving the original.

**Repair**

Updated invoice storage logic in `storage.py`.

**Verification**

* Identical invoice re-import → skipped.
* Same identity with changed invoice data → rejected.
* Original invoice remains unchanged.

---

### Defect 3 — Payment duplicate/conflict handling

**Problem**

Payment identity and duplicate/conflict behavior required correction.

**Required behavior**

Payment identity is:

`payment_id`

An identical payment re-import must be skipped.

The same payment ID with different customer, invoice, or amount must be rejected while preserving the original.

**Repair**

Updated payment insertion and duplicate/conflict handling in `storage.py`.

---

### Defect 4 — Invalid data row aborted valid rows

**Problem**

An invalid row could prevent valid rows in the same CSV import from being processed.

**Required behavior**

* Invalid header → reject the entire import.
* Invalid data row → reject only that row.
* Valid rows must continue processing.

**Repair**

Moved row validation into the per-row import flow in `ledger/importing.py`.

**Verification**

A mixed invoice CSV containing valid and invalid rows produced:

`Imported: 2 | Skipped: 0 | Rejected: 1`

The invalid row was reported with its line number and reason while the valid rows were imported.

---

### Defect 5 — Invoice status filtering

**Problem**

Invoice filtering did not reliably return the requested status set.

**Required behavior**

`/api/invoices?status=all`

returns all invoices.

`/api/invoices?status=open`

returns invoices with positive balances.

`/api/invoices?status=paid`

returns invoices with zero or negative balances.

**Repair**

Corrected status filtering in `ledger/reporting.py`.

---

### Defect 6 — Money precision

**Problem**

Money calculations required reliable two-decimal handling.

**Required behavior**

Money must remain accurate to two decimal places.

**Repair**

Updated reporting calculations to use `Decimal` values and two-decimal formatting.

**Verification**

Exported invoice data preserved values such as:

* Amount: `19.99`
* Paid: `10.00`
* Balance: `9.99`

---

### Defect 7 — Browser import/reporting behavior

**Problem**

The browser needed to accurately represent processed and failed imports.

**Required behavior**

Successful imports must show actual imported/skipped/rejected counts.

Partial imports must show rejected lines and reasons.

Failed requests must be displayed as failures and must not claim success.

The register must refresh after a processed import.

**Repair**

Updated `web/app.js` with HTTP failure handling, actual import counts, rejected-row details, and register refresh behavior.

---

## 3. Failing-Before / Passing-After Reproduction

### Payment matching

**Input**

A payment with:

* Customer: `MAPLE`
* Invoice: `INV-200`
* Amount: `1250.00`

was tested against invoices where another invoice could also have the same amount.

**Before**

The matching logic could use amount-based matching and select the wrong invoice.

**After**

The payment is matched only using:

`MAPLE + INV-200`

This confirms that amount alone no longer establishes payment identity.

---

## 4. Self-Designed Regression Input

A mixed invoice import was used containing both valid and invalid rows.

Expected behavior:

* Valid rows are imported.
* Invalid rows are rejected individually.
* The import continues after the invalid row.
* The response reports imported and rejected counts.

Observed browser result:

`Imported: 2 | Skipped: 0 | Rejected: 1`

Rejected row:

`line 3: amount must be a positive decimal with at most two decimal places`

This verifies row-level rejection without aborting the complete import.

---

## 5. Browser Verification

The application was started using:

```text
python app.py
```

and opened at:

```text
http://127.0.0.1:8787/
```

### Fresh demo register

Initial dashboard showed:

* Total invoices: 6
* Open invoices: 5
* Outstanding: ₹3,209.99
* Unmatched payments: 0

### Duplicate invoice import

Observed:

`Imported: 0 | Skipped: 2 | Rejected: 0`

### Mixed invoice import

Observed:

`Imported: 2 | Skipped: 0 | Rejected: 1`

### Payment import

Observed:

`Imported: 3 | Skipped: 0 | Rejected: 0`

The unmatched payment remained visible:

`PAY-404 · HARBOR / INV-NOT-FOUND · ₹50.00`

This confirms that a valid unmatched payment is retained without changing invoice balances.

### Invalid header

Using an invoice import with the wrong header produced:

`Import failed: Expected CSV header: customer_id,invoice_number,amount,due_date`

The browser displayed this as a failed import rather than a successful import.

### Export

The register export was checked for amount, paid amount, balance, and status values.

Example:

`NORTH / INV-300`

* Amount: `19.99`
* Paid: `10.00`
* Balance: `9.99`

---

## 6. Regression Tests

Added:

`tests/test_repairs.py`

The additional regression tests cover:

1. Payment matching by customer + invoice rather than amount.
2. Identical invoice re-import being skipped.
3. Invoice conflict being rejected while preserving the original.
4. Invalid row rejection without aborting valid rows.
5. Invoice status filtering.
6. Money precision and cents preservation.

Final test run:

```text
11 passed in 0.68s
```

The test run included the repair tests and existing smoke tests.

---

## 7. Additional Improvement

Added an **Unmatched payments** dashboard metric.

This is a small usability improvement beyond the required business rules and makes retained unmatched payments immediately visible from the register overview.

---

## 8. Fixture Preservation Verification

The supplied fixture was restored and verified at runtime.

Command:

```text
python restore_fixture.py --replace
```

Observed output:

```text
Existing register restored: 9 invoices, 5 payments.
```

After starting the application with:

```text
python app.py
```

and opening:

```text
http://127.0.0.1:8787/
```

the restored fixture showed:

* Total invoices: 9
* Open invoices: 7
* Outstanding: ₹3,698.19
* Unmatched payments: 1

The register displayed all 9 fixture invoices, including both `KEEP-700` records belonging to different customers.

The unmatched fixture payment remained visible:

`KEEP-U1 · MAPLE / WAIT-900 · ₹33.33`

This verifies that the supplied fixture data remains usable after restoration and that the repaired matching and reporting behavior operates correctly against the fixture dataset.

---

## 9. Exact Verification Commands

From the `track-a` directory:

### Restore supplied fixture

```text
python restore_fixture.py --replace
```

### Start application

```text
python app.py
```

### Run regression and smoke tests

```text
python -m unittest discover -s tests -v
```

The repair test suite was also verified with the project's available pytest runner:

```text
pytest -q
```

Observed result:

```text
11 passed in 0.68s
```

### Browser

```text
http://127.0.0.1:8787/
```

---

## 10. Remaining Notes

No known high-priority defect from the Track A business rules remains unresolved based on the implemented fixes and verification performed.

The application continues to use the existing public HTTP routes and response fields.

No deployment was performed because deployment is not required for this assessment.

The supplied fixture data remains restorable using the provided restore command.

---

## 11. Git

The repair work was committed to the Track A repository.

Repair commit:

`65dedd3 Repair ClearLedger register`

Verification/documentation commits were subsequently added for the handover and fixture verification.

Only the `track-a` work is intended for submission; unrelated repository-level files and the separate `track-b` directory were not included in the Track A repair commit.
