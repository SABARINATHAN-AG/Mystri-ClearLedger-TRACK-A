\## Fixture preservation verification



The supplied fixture was restored with:



```text

python restore\_fixture.py --replace

```



Observed output:



```text

Existing register restored: 9 invoices, 5 payments.

```



After starting the application with:



```text

python app.py

```



and opening `http://127.0.0.1:8787/`, the restored fixture produced:



\* Total invoices: 9

\* Open invoices: 7

\* Outstanding: ₹3,698.19

\* Unmatched payments: 1



The register displayed all 9 fixture invoices, including the two `KEEP-700` invoices belonging to different customers, and the unmatched `KEEP-U1` payment remained visible. This verifies that the supplied fixture data remains usable after restoration and that the repaired reporting/matching behavior operates against the fixture dataset.



