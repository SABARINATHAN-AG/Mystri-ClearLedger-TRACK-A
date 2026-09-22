\# ClearLedger — Track A Handover



\## Summary



Repaired the ClearLedger register across payment matching, import idempotency, row-level validation, reporting filters, money precision, and browser import feedback.



\## Defects Investigated and Fixed



\### 1. Payment matching



\*\*Problem:\*\* Payments were matched using payment amount, so a payment could attach to the wrong invoice when different invoices had the same amount.



\*\*Fix:\*\* Payments now match only by the required invoice identity:



`customer\_id + invoice\_number`



\### 2. Invoice import idempotency



\*\*Problem:\*\* Re-importing the same invoice could create duplicate records.



\*\*Fix:\*\* Existing invoices with the same identity are skipped when amount and due date are identical. A conflicting amount or due date is rejected and the original record is preserved.



\### 3. Payment import idempotency



\*\*Problem:\*\* Reusing a payment ID with duplicate or conflicting data was not handled safely.



\*\*Fix:\*\* Identical payment re-imports are skipped. A reused payment ID with different customer, invoice, or amount is rejected.



\### 4. Row-level import validation



\*\*Problem:\*\* One invalid data row could abort processing of valid rows in the same import.



\*\*Fix:\*\* Rows are validated and processed independently. Invalid rows are rejected with their line number and reason while valid rows continue.



\### 5. Invoice status filtering



\*\*Problem:\*\* The open/paid status filter did not return the requested status correctly.



\*\*Fix:\*\* Status is derived from balance:



\* Positive balance → `open`

\* Zero or negative balance → `paid`



\### 6. Money precision



\*\*Problem:\*\* Balance/export calculations could be affected by floating-point precision.



\*\*Fix:\*\* Monetary calculations use `Decimal` and are quantized to two decimal places.



\### 7. Browser import feedback



\*\*Problem:\*\* The browser could report an import as complete without showing the actual API result.



\*\*Fix:\*\* The UI now displays imported, skipped and rejected counts, including rejected line/reason details. Failed HTTP requests are reported as failures, and the register is refreshed after successful processing.



\## Investigation and Reproduction Evidence



\### Failing-before / passing-after reproduction



\*\*Case:\*\* Payment `TEST-P1` for customer `MAPLE`, invoice `INV-200`, amount `1250.00`.



There was also another invoice with the same amount: `HARBOR / INV-100`.



\*\*Before repair:\*\* The amount-first matching implementation could select the wrong invoice because `1250.00` was not sufficient to establish payment identity.



\*\*After repair:\*\* The payment matched `MAPLE / INV-200` using the required `customer\_id + invoice\_number` identity.



Regression test:



`tests/test\_repairs.py::test\_payment\_matches\_customer\_and\_invoice\_not\_amount`



The final regression suite passed:



`11 passed in 0.68s`



\### Self-designed input case



Designed a duplicate/conflict case using the same invoice identity with a changed amount.



Existing identity:



`HARBOR / INV-100`



The conflicting import used the same customer and invoice number but a different amount.



\*\*Expected behaviour:\*\* Reject the conflicting row and preserve the original invoice.



\*\*Observed:\*\* The conflicting invoice was rejected and the original record remained unchanged.



Regression test:



`tests/test\_repairs.py::test\_conflicting\_invoice\_is\_rejected\_and\_original\_preserved`



\## Browser Verification



Verified through the ClearLedger browser UI.



\### Valid/repeated invoice import



`invoice\_new.csv`



Result:



`Imported: 0 | Skipped: 2 | Rejected: 0`



This verified duplicate invoice idempotency.



\### Mixed-validity invoice import



`invoice\_mixed.csv`



Result:



`Imported: 2 | Skipped: 0 | Rejected: 1`



Rejected row:



`line 3: amount must be a positive decimal with at most two decimal places`



The two valid rows were still imported, verifying row-level rejection.



\### Payment import



`payments.csv`



Result:



`Imported: 3 | Skipped: 0 | Rejected: 0`



The unresolved payment remained visible:



`PAY-404 · HARBOR / INV-NOT-FOUND · ₹50.00`



This verified that an unmatched payment is retained without being incorrectly attached to an invoice.



\### Invalid header



`wrong-header.csv`



Result:



`Import failed: Expected CSV header: customer\_id,invoice\_number,amount,due\_date`



The browser correctly reported the failed import instead of claiming success.



\## Regression Tests



Added focused regression coverage for:



\* Payment matching by customer + invoice identity

\* Duplicate invoice re-import

\* Conflicting invoice identity

\* Invalid row while valid rows continue

\* Open/paid status filtering

\* Two-decimal money precision



Final command and result:



```text

python -m pytest



11 passed in 0.68s

```



The suite included the existing smoke tests and the new repair regression tests.



\## Additional Improvement



Added an \*\*Unmatched payments\*\* count to the dashboard.



\*\*Owner problem solved:\*\* unresolved payment references can now be seen immediately without relying only on the detailed unmatched-payment list.



The browser verification showed:



`PAY-404 · HARBOR / INV-NOT-FOUND · ₹50.00`



and the dashboard displayed the unmatched-payment count.



\## Fixture Preservation



The supplied fixture files under `fixtures/` were kept intact and were not modified as part of the repair.



The repaired storage/import/reporting code continues to use the supplied customer, invoice and payment structures, while valid new imports remain supported.



\## Exact Verification Commands



Run from `track-a`:



```text

python -m pytest

```



Result:



```text

11 passed in 0.68s

```



Application:



```text

python app.py

```



Browser:



```text

http://127.0.0.1:8787/

```



The browser/API verification completed successfully for invoice import, payment import, unmatched payments, invalid rows and invalid headers.



\## Remaining Notes



The browser verification used the supplied sample CSVs, so the working local register contains the imported sample data after testing.



The original `fixtures/` files remain preserved.



No external services or real financial records are used.



\## Git



Final repair commit:



`65dedd3 Repair ClearLedger register`



