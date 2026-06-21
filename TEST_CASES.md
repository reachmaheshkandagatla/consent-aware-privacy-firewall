# CAF Privacy Detection Test Cases

## Test Summary

| Metric | Result |
| --- | ---: |
| Test scenarios | 11 |
| Expected entities | 30 |
| Detected entities | 23 |
| Missed entities | 7 |
| Detection coverage | 76.67% |

## Results Overview

| Test case | Scenario | Expected entities | Actual entities |
| --- | --- | ---: | ---: |
| TC01 | Medical Consultation | 5 | 4 |
| TC02 | Loan Application | 3 | 3 |
| TC03 | Developer Prompt | 2 | 0 |
| TC04 | Passport Information | 1 | 1 |
| TC05 | Employee Information | 2 | 1 |
| TC06 | Insurance Claim | 2 | 1 |
| TC07 | Hospital Record | 3 | 2 |
| TC08 | Resume Upload | 4 | 4 |
| TC09 | Banking Question | 1 | 1 |
| TC10 | Tax Filing | 1 | 1 |
| TC11 | Mixed High-Risk Prompt | 6 | 5 |
| **Total** |  | **30** | **23** |

## Test Case Details

### TC01: Medical Consultation

```text
My name is Sarah Johnson. My ID number is 9204151234088.
I live at 22 Main Road, Cape Town.
I have Type 2 diabetes and take Metformin 500mg twice daily.
My email is sarah.johnson@gmail.com.
```

- Expected entities: 5
- Actual entities: 4

### TC02: Loan Application

```text
I earn R45000 per month.
My bank account number is 12345678901.
My credit card is 4532123412341234.
My phone number is 0821234567.
```

- Expected entities: 3
- Actual entities: 3

### TC03: Developer Prompt

```text
Can you debug my application?

AWS_SECRET_ACCESS_KEY=abc123xyz789
OPENAI_API_KEY=sk-test-123456789
```

- Expected entities: 2
- Actual entities: 0

### TC04: Passport Information

```text
My passport number is A12345678.
I am travelling to London next month.
```

- Expected entities: 1
- Actual entities: 1

### TC05: Employee Information

```text
My employee number is EMP9988.
My corporate email is john.smith@company.com.
```

- Expected entities: 2
- Actual entities: 1

### TC06: Insurance Claim

```text
Policy number POL778899.
Vehicle registration CA123456.
Claim amount R35000.
```

- Expected entities: 2
- Actual entities: 1

### TC07: Hospital Record

```text
Patient Michael Brown was diagnosed with hypertension and asthma.
Medical aid number 123456789.
```

- Expected entities: 3
- Actual entities: 2

### TC08: Resume Upload

```text
Name: Peter Williams
Phone: +27 821112222
Email: peter@gmail.com
Address: 15 Beach Road
```

- Expected entities: 4
- Actual entities: 4

### TC09: Banking Question

```text
My account balance is R125000.
My account number is 9988776655.
```

- Expected entities: 1
- Actual entities: 1

### TC10: Tax Filing

```text
My tax reference number is 1234567890.
Annual income is R750000.
```

- Expected entities: 1
- Actual entities: 1

### TC11: Mixed High-Risk Prompt

```text
My name is Mahesh Kandagatla.
My phone number is 0825551234.
Email mahesh@gmail.com.
Passport A99887766.
Bank account 1234567890.
AWS_SECRET_ACCESS_KEY=xyz987654.
```

- Expected entities: 6
- Actual entities: 5

## Test Report

CAF was evaluated against 11 synthetic privacy scenarios containing 30 manually annotated sensitive entities spanning personal, medical, financial, identity, and credential-related information. The prototype achieved an overall detection coverage of 76.67%.
