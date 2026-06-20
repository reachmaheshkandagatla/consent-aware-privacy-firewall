const test = require('node:test');
const assert = require('node:assert/strict');
const { loadExtensionScripts } = require('./helpers/loadExtensionScripts');

// All identity, credential, and account values in this file are synthetic fixtures.

const { detector, masker } = loadExtensionScripts();

const DEFAULT_MEDICAL_TERMS = [
  'HIV',
  'diabetes',
  'pregnancy',
  'blood pressure',
  'medication',
  'TB',
  'depression',
  'cancer',
  'ARV',
  'insulin',
  'hypertension',
  'mental health',
  'diagnosis',
  'prescription',
  'allergies',
  'cetirizine',
  'health insurance'
];

function scan(text) {
  return detector.scan(text);
}

function entityTypes(text) {
  return scan(text).entities.map(entity => entity.type);
}

function assertIncludesTypes(text, expectedTypes) {
  const types = entityTypes(text);
  for (const type of expectedTypes) {
    assert.ok(types.includes(type), `Expected ${type}; found ${types.join(', ')}`);
  }
}

function assertNotIncludesTypes(text, rejectedTypes) {
  const types = entityTypes(text);
  for (const type of rejectedTypes) {
    assert.ok(!types.includes(type), `Did not expect ${type}; found ${types.join(', ')}`);
  }
}

function assertNoOverlappingSpans(entities) {
  const sorted = entities.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    assert.ok(
      previous.end <= current.start,
      `Overlapping spans: ${previous.type}(${previous.start}-${previous.end}) and ${current.type}(${current.start}-${current.end})`
    );
  }
}

test('counts the reported email and temporary password as exactly two PII entities', () => {
  const input = `Oh wait, sorry, I didn't mean to paste that whole block! Just ignore that part with the customer's email user77@example.com and the temporary password TempPassword123!. I meant to ask about formatting the JSON object below it. Can we wipe that from this session?`;

  const result = scan(input);

  assert.equal(result.entities.length, 2);
  assert.deepEqual(result.entities.map(entity => entity.type), ['EMAIL', 'PASSWORD']);
});

test('masks single labeled names including lowercase family names', () => {
  const input = `Name : Bhargava
fathers Name: chiliveru`;
  const result = scan(input);

  assert.deepEqual(result.entities.map(entity => entity.type), ['NAME', 'NAME']);
  assert.equal(masker.maskText(input, result.entities), `Name : [NAME]
fathers Name: [NAME]`);
});

test('masks a standalone full-name field', () => {
  const input = 'Full Name: Alex Mercer';
  const result = scan(input);

  assert.deepEqual(result.entities.map(entity => entity.type), ['NAME']);
  assert.equal(masker.maskText(input, result.entities), 'Full Name: [NAME]');
});

test('detects prefixed provider keys and generic labeled access tokens', () => {
  const input = `OpenAI key: sk-proj-abcdefghijklmnopqrstuvwx
Hugging Face key: hf_abcdefghijklmnopqrstuvwxyz123456
Access token: abcdefghijklmnopqrstuvwxyz123456`;
  const result = scan(input);

  assert.deepEqual(result.entities.map(entity => entity.type), ['API_KEY', 'API_KEY', 'ACCESS_TOKEN']);
  const masked = masker.maskText(input, result.entities);
  assert.ok(!masked.includes('sk-proj-'));
  assert.ok(!masked.includes('hf_'));
  assert.ok(masked.includes('[ACCESS_TOKEN_MASKED]'));
});

test('detects assignment-style provider key variables', () => {
  const input = 'hugging_face_key = akjdnjkcndjskcjdcbjkfdjb';
  const result = scan(input);

  assert.deepEqual(result.entities.map(entity => entity.type), ['API_KEY']);
  assert.equal(masker.maskText(input, result.entities), 'hugging_face_key = [API_KEY_MASKED]');
});

test('masks a student record with a hyphenated textual DOB', () => {
  const input = `Student Name: Marcus Vance
Student ID: #8839201

Explain that I need to update my FAFSA account because my mother, Sarah Vance (DOB: 16-june-1988), recently changed employers and our household income has significantly dropped.`;
  const result = scan(input);

  assert.deepEqual(result.entities.map(entity => entity.type), ['NAME', 'STUDENT_ID', 'NAME', 'DOB']);
  const masked = masker.maskText(input, result.entities);
  assert.ok(masked.includes('Student Name: [NAME]'));
  assert.ok(masked.includes('DOB: [DOB_MASKED]'));
  assert.ok(!masked.includes('Marcus Vance'));
  assert.ok(!masked.includes('16-june-1988'));
});

test('detects a punctuated primary account reference in narrative text', () => {
  const input = `That block contained our client’s direct line, (555) 019-2834, and their primary account number, ACCT-88291-X. It also looks like my manager's email, j.doe@company.com, and a temporary access token were mixed into that text grab.`;
  const result = scan(input);

  assert.deepEqual(result.entities.map(entity => entity.type), ['PHONE', 'REFERENCE_ID', 'EMAIL']);
  assert.ok(masker.maskText(input, result.entities).includes('[REFERENCE_MASKED]'));
});

test('masks student identity fields and a contextual parent name', () => {
  const input = `Student Name: Marcus Vance
Student ID: #8839201

Explain that I need to update my FAFSA account because my mother, Sarah Vance (DOB: [DOB_MASKED]), recently changed employers and our household income has significantly dropped.`;
  const result = scan(input);

  assert.deepEqual(result.entities.map(entity => entity.type), ['NAME', 'STUDENT_ID', 'NAME']);
  const masked = masker.maskText(input, result.entities);
  assert.ok(masked.includes('Student Name: [NAME]'));
  assert.ok(masked.includes('Student ID: #[STUDENT_ID_MASKED]'));
  assert.ok(masked.includes('my mother, [NAME]'));
});

test('detects and masks a medical financial record sample', () => {
  const input = `CONFIDENTIAL MEDICAL & FINANCIAL RECORD

Date: June 16, 2026

Patient: Smith, Jane

DOB: 11/23/1991

Gender: Female

CASE NOTES:

The patient presented with symptoms of acute seasonal allergies. Prescribed Cetirizine 10mg daily. Billing has been routed to primary health insurance under Policy ID: PHI-99234-XYZ.

BILLING & ACCOUNT DETAILS:

The copay of $45.00 was processed on-site using the patient's Visa corporate card ending in 4444.

Full Card Holder: Jane Smith

Card Number: 4111-2222-3333-4444

Expiry: 12/29

CVV: 000

Mailing Address for statements:

123 Dummy Data Lane, Apt 4B, Arlington, VA, 22201

Contact email: jane.smith@testcorp.local

Secure IP logged during transaction: 192.168.1.105`;

  const result = scan(input);
  assertNoOverlappingSpans(result.entities);
  const types = result.entities.map(entity => entity.type);
  assert.deepEqual(new Set(types), new Set([
    'NAME',
    'DOB',
    'HEALTH',
    'POLICY_ID',
    'CARD_LAST4',
    'CREDIT_CARD',
    'CARD_EXPIRY',
    'CVV',
    'LOCATION',
    'EMAIL',
    'IP_ADDRESS'
  ]));

  const masked = masker.maskText(input, result.entities);
  assert.ok(masked.includes('[NAME]'));
  assert.ok(masked.includes('[DOB_MASKED]'));
  assert.ok(masked.includes('seasonal allergies'));
  assert.ok(masked.includes('Cetirizine'));
  assert.ok(masked.includes('health insurance'));
  assert.ok(masked.includes('[POLICY_ID_MASKED]'));
  assert.ok(masked.includes('[CARD_LAST4_MASKED]'));
  assert.ok(masked.includes('[CARD_MASKED]'));
  assert.ok(masked.includes('[EXPIRY_MASKED]'));
  assert.ok(masked.includes('[CVV_MASKED]'));
  assert.ok(masked.includes('[LOCATION]'));
  assert.ok(masked.includes('[EMAIL_MASKED]'));
  assert.ok(masked.includes('[IP_MASKED]'));
  assert.ok(!masked.includes('jane.smith@testcorp.local'));
  assert.ok(!masked.includes('4111-2222-3333-4444'));
  assert.ok(!masked.includes('PHI-99234-XYZ'));
});

test('default masking preserves detected health details while masking identifiers', () => {
  const input = 'Patient John Mokoena, ID 8001015009087, Diagnosis: HIV Positive. Contact: mahesh@example.com';
  const result = scan(input);
  assert.ok(result.entities.some(entity => entity.type === 'HEALTH'));

  const masked = masker.maskText(input, result.entities);
  assert.ok(masked.includes('Diagnosis: HIV Positive'));
  assert.ok(masked.includes('[NAME]'));
  assert.ok(masked.includes('[ID_NUMBER]'));
  assert.ok(masked.includes('[EMAIL_MASKED]'));
  assert.ok(!masked.includes('John Mokoena'));
  assert.ok(!masked.includes('8001015009087'));
  assert.ok(!masked.includes('mahesh@example.com'));
});

test('name detection excludes patient label from the masked span', () => {
  const input = `Patient: John Smith
ID: 8001015009087
Phone: 0821234567
Diagnosis: HIV Positive`;

  const result = scan(input);
  const name = result.entities.find(entity => entity.type === 'NAME');
  assert.deepEqual(name, {
    type: 'NAME',
    value: 'John Smith',
    start: 9,
    end: 19,
    severity: 'MEDIUM'
  });

  const masked = masker.maskText(input, result.entities);
  assert.ok(masked.includes('Patient: [NAME]'));
  assert.ok(masked.includes('Diagnosis: HIV Positive'));
  assert.ok(!masked.includes('John Smith'));
});

test('masks emergency contact name across editor paragraph breaks', () => {
  const input = `Emergency Contact:

Ravi Naidoo`;

  const result = scan(input);
  assert.deepEqual(result.entities, [
    {
      type: 'NAME',
      value: 'Ravi Naidoo',
      start: 20,
      end: 31,
      severity: 'MEDIUM'
    }
  ]);

  const masked = masker.maskText(input, result.entities);
  assert.equal(masked, `Emergency Contact:

[NAME]`);
});

test('detects generic person names from labels and self-introductions', () => {
  const input = `My name is Priya Patel.
Patient Name: Sipho Dlamini
Emergency Contact:
Maria Chen
Account holder: Thabo van Wyk`;

  const result = scan(input);
  const names = result.entities.filter(entity => entity.type === 'NAME').map(entity => entity.value);
  assert.deepEqual(names, ['Priya Patel', 'Sipho Dlamini', 'Maria Chen', 'Thabo van Wyk']);

  const masked = masker.maskText(input, result.entities);
  assert.ok(!masked.includes('Priya Patel'));
  assert.ok(!masked.includes('Sipho Dlamini'));
  assert.ok(!masked.includes('Maria Chen'));
  assert.ok(!masked.includes('Thabo van Wyk'));
});

test('detects generic contextual locations without hardcoded city names', () => {
  const input = 'I am living in Durban. My sister is based in Nairobi. The patient is from Lusaka.';
  const result = scan(input);
  const locations = result.entities.filter(entity => entity.type === 'LOCATION').map(entity => entity.value);
  assert.deepEqual(locations, ['Durban', 'Nairobi', 'Lusaka']);

  const masked = masker.maskText(input, result.entities);
  assert.equal(masked, 'I am living in [LOCATION]. My sister is based in [LOCATION]. The patient is from [LOCATION].');
});

test('masks generic contact names and business reference identifiers', () => {
  const input = `HR Contact:Thandi Mokoena
Payslip Reference:PAY-2026-009887
Bank Statement Reference:BSTMT-2026-554411
Loan Application Reference:LOAN-2026-774422
Payroll Contact: Ayesha Khan
Invoice Reference:INV-2026-112233`;

  const result = scan(input);
  assertNoOverlappingSpans(result.entities);

  const names = result.entities.filter(entity => entity.type === 'NAME').map(entity => entity.value);
  assert.deepEqual(names, ['Thandi Mokoena', 'Ayesha Khan']);

  const refs = result.entities.filter(entity => entity.type === 'REFERENCE_ID').map(entity => entity.value);
  assert.deepEqual(refs, ['PAY-2026-009887', 'BSTMT-2026-554411', 'LOAN-2026-774422', 'INV-2026-112233']);

  const masked = masker.maskText(input, result.entities);
  for (const value of ['Thandi Mokoena', 'PAY-2026-009887', 'BSTMT-2026-554411', 'LOAN-2026-774422', 'Ayesha Khan', 'INV-2026-112233']) {
    assert.ok(!masked.includes(value), `Expected ${value} to be masked`);
  }
});

test('masks compact passport labels and names before contact fields', () => {
  const input = `Passport:A98765432
References:
John Smith Phone: +27 82 456 7890
Sarah Jones Phone: +27 83 999 1122
Mei Tan Email: mei.tan@example.com`;

  const result = scan(input);
  assertNoOverlappingSpans(result.entities);

  const types = result.entities.map(entity => entity.type);
  assert.ok(types.includes('PASSPORT'));
  assert.equal(result.entities.filter(entity => entity.type === 'NAME').length, 3);

  const masked = masker.maskText(input, result.entities);
  for (const value of ['A98765432', 'John Smith', 'Sarah Jones', 'Mei Tan', '+27 82 456 7890', '+27 83 999 1122', 'mei.tan@example.com']) {
    assert.ok(!masked.includes(value), `Expected ${value} to be masked`);
  }
});

test('masks legal party names and case identifiers generically', () => {
  const input = `Case Number:DIV-2026-88231
Applicant:Priya Naidoo
Respondent:Rajesh Naidoo
Children:Aarav Naidoo (DOB 2018-01-01)
Attorney:Michael Peterson
Witness: Elena Jacobs
Matter Number:CIV-2026-12345`;

  const result = scan(input);
  assertNoOverlappingSpans(result.entities);

  const names = result.entities.filter(entity => entity.type === 'NAME').map(entity => entity.value);
  assert.deepEqual(names, ['Priya Naidoo', 'Rajesh Naidoo', 'Aarav Naidoo', 'Michael Peterson', 'Elena Jacobs']);

  const refs = result.entities.filter(entity => entity.type === 'REFERENCE_ID').map(entity => entity.value);
  assert.deepEqual(refs, ['DIV-2026-88231', 'CIV-2026-12345']);

  const masked = masker.maskText(input, result.entities);
  for (const value of ['DIV-2026-88231', 'Priya Naidoo', 'Rajesh Naidoo', 'Aarav Naidoo', '2018-01-01', 'Michael Peterson', 'Elena Jacobs', 'CIV-2026-12345']) {
    assert.ok(!masked.includes(value), `Expected ${value} to be masked`);
  }
});

test('masks generic customer and order identifiers', () => {
  const input = `Customer ID:CUS-998877
Order Number:ORD-2026-88222
Ticket No:TKT-2026-111222
Transaction Reference:TXN-2026-333444`;

  const result = scan(input);
  assertNoOverlappingSpans(result.entities);

  const refs = result.entities.filter(entity => entity.type === 'REFERENCE_ID').map(entity => entity.value);
  assert.deepEqual(refs, ['CUS-998877', 'ORD-2026-88222', 'TKT-2026-111222', 'TXN-2026-333444']);

  const masked = masker.maskText(input, result.entities);
  for (const value of refs) {
    assert.ok(!masked.includes(value), `Expected ${value} to be masked`);
  }
});

test('masks generic financial product identifiers', () => {
  const input = `Retirement Annuity:RA-887722
Pension Number:PEN-2026-001122
Provident Fund:PF-778899
Investment Account:INV-2026-334455`;

  const result = scan(input);
  assertNoOverlappingSpans(result.entities);

  const refs = result.entities.filter(entity => entity.type === 'REFERENCE_ID').map(entity => entity.value);
  assert.deepEqual(refs, ['RA-887722', 'PEN-2026-001122', 'PF-778899', 'INV-2026-334455']);

  const masked = masker.maskText(input, result.entities);
  for (const value of refs) {
    assert.ok(!masked.includes(value), `Expected ${value} to be masked`);
  }
});

test('masks generic workplace and financial role names', () => {
  const input = `Employee:Sarah Johnson
Manager:Peter Smith
Supervisor: Linda Maseko
Beneficiary: Carlos Mendes`;

  const result = scan(input);
  const names = result.entities.filter(entity => entity.type === 'NAME').map(entity => entity.value);
  assert.deepEqual(names, ['Sarah Johnson', 'Peter Smith', 'Linda Maseko', 'Carlos Mendes']);

  const masked = masker.maskText(input, result.entities);
  for (const value of names) {
    assert.ok(!masked.includes(value), `Expected ${value} to be masked`);
  }
});

test('masks comprehensive patient onboarding identifiers while preserving health context', () => {
  const input = `Hi Consent Guardian,

Please process this patient onboarding request.

Patient full name: Anika Naidoo
Date of birth: 14 March 1987
Age: 39
Gender: Female
Nationality: South African
ID number: 8703140256083
Passport number: A12345678
Driver's license number: CA987654321
Marital status: Married

Home address:
42 Protea Avenue, Rondebosch, Cape Town, 7700, South Africa

GPS location:
-33.963221, 18.476912

Phone number:
+27 82 456 7890

Alternative phone:
+27 71 222 3344

Email:
anika.naidoo.fake@example.com

Work email:
a.naidoo@fakeclinic-example.org

Emergency contact:
Ravi Naidoo
Relationship: Husband
Phone: +27 83 999 1122

Medical aid:
Discovery Health
Member number: DH-5566778899
Plan: Classic Saver

Hospital number:
HOSP-CT-2026-009182

Medical record number:
MRN-77441122

Clinical details:
Patient has Type 2 diabetes, hypertension, and is 13 weeks pregnant.
Current medication: Metformin 500mg twice daily, Labetalol 100mg twice daily.
Allergy: Penicillin.
HIV status: Negative.
Previous miscarriage: Yes, in 2025.

Banking details:
Bank: FNB
Account holder: Anika Naidoo
Account number: 62837491820
Branch code: 250655
Card number: 4111 1111 1111 1111
Expiry date: 08/29
CVV: 123

Tax number:
9876543210

Employment:
Employer: Cape Town Health Analytics Pty Ltd
Employee number: EMP-445566
Job title: Data Analyst
Monthly salary: R58,000

Login credentials:
Username: anika.naidoo
Password: FakePass@123
API key: sk-test-1234567890abcdef
One-time PIN: 482913

Social media:
LinkedIn: linkedin.com/in/anika-naidoo-fake
Twitter/X handle: @anika_fake

Device/network:
IP address: 196.25.34.101
MAC address: 00:1A:2B:3C:4D:5E
IMEI: 356938035643809`;

  const result = scan(input);
  assertNoOverlappingSpans(result.entities);

  const types = new Set(result.entities.map(entity => entity.type));
  for (const type of [
    'NAME',
    'DOB',
    'SA_ID',
    'PASSPORT',
    'DRIVERS_LICENSE',
    'LOCATION',
    'GPS_LOCATION',
    'PHONE',
    'EMAIL',
    'RELATIONSHIP',
    'MEDICAL_AID',
    'MEMBER_NUMBER',
    'HOSPITAL_NUMBER',
    'MEDICAL_RECORD_NUMBER',
    'BANK_ACCOUNT',
    'BRANCH_CODE',
    'CREDIT_CARD',
    'CARD_EXPIRY',
    'CVV',
    'TAX_NUMBER',
    'EMPLOYER',
    'EMPLOYEE_ID',
    'SALARY',
    'USERNAME',
    'PASSWORD',
    'API_KEY',
    'OTP',
    'SOCIAL_PROFILE',
    'SOCIAL_HANDLE',
    'IP_ADDRESS',
    'MAC_ADDRESS',
    'IMEI',
    'HEALTH'
  ]) {
    assert.ok(types.has(type), `Expected ${type}; found ${Array.from(types).join(', ')}`);
  }

  const masked = masker.maskText(input, result.entities);
  for (const value of [
    'Anika Naidoo',
    '14 March 1987',
    '8703140256083',
    'A12345678',
    'CA987654321',
    '42 Protea Avenue',
    '-33.963221, 18.476912',
    '+27 82 456 7890',
    '+27 71 222 3344',
    'anika.naidoo.fake@example.com',
    'a.naidoo@fakeclinic-example.org',
    'Ravi Naidoo',
    'Husband',
    '+27 83 999 1122',
    'Discovery Health',
    'DH-5566778899',
    'HOSP-CT-2026-009182',
    'MRN-77441122',
    '62837491820',
    '250655',
    '4111 1111 1111 1111',
    '08/29',
    '9876543210',
    'Cape Town Health Analytics Pty Ltd',
    'EMP-445566',
    'R58,000',
    'anika.naidoo',
    'FakePass@123',
    'sk-test-1234567890abcdef',
    '482913',
    'linkedin.com/in/anika-naidoo-fake',
    '@anika_fake',
    '196.25.34.101',
    '00:1A:2B:3C:4D:5E',
    '356938035643809'
  ]) {
    assert.ok(!masked.includes(value), `Expected ${value} to be masked`);
  }

  assert.ok(masked.includes('Type 2 diabetes'));
  assert.ok(masked.includes('hypertension'));
  assert.ok(masked.includes('Current medication'));
  assert.ok(masked.includes('HIV status: Negative'));
});

test('masks symptom advice sample identifiers without masking patient-name labels', () => {
  const input = `Hi, I need some advice about my symptoms.

My name is Anika Naidoo and I am a 39-year-old female living in Cape Town.

I was diagnosed with Type 2 diabetes a few years ago and currently take Metformin 500mg twice daily.
I am currently 13 weeks pregnant and I am worried that these symptoms could affect my pregnancy.

For context, I recently moved house and have been under a lot of stress. My new address is 42 Protea Avenue, Rondebosch, Cape Town 7700.

I had some blood tests done recently and my hospital record number is MRN-77441122. My medical aid is Discovery Health member number DH-5566778899.

Patient Name: Anika Naidoo
South African ID Number: 8703140256083
Date of Birth: 14 March 1987
Phone Number: +27 82 456 7890
Email: anika.naidoo.fake@example.com

Emergency Contact:
Ravi Naidoo
Relationship: Husband
Phone: +27 83 999 1122

Recent Results:
Blood Pressure: 148/92
Current Medication:
Metformin 500mg twice daily
Known Allergies:
Penicillin
Previous Pregnancy History:
Miscarriage during 2025

Username: anika.naidoo
Password: FakePass@123

Bank Account: 62837491820
Card Number: 4111111111111111
CVV: 123

My employer medical reimbursement reference is EMP-445566 and my tax number is 9876543210.

IP Address: 196.25.34.101
MAC Address: 00:1A:2B:3C:4D:5E`;

  const result = scan(input);
  assertNoOverlappingSpans(result.entities);
  const masked = masker.maskText(input, result.entities);

  for (const value of [
    'Anika Naidoo',
    '42 Protea Avenue',
    'MRN-77441122',
    'Discovery Health',
    'DH-5566778899',
    '8703140256083',
    '14 March 1987',
    '+27 82 456 7890',
    'anika.naidoo.fake@example.com',
    'Ravi Naidoo',
    'Husband',
    '+27 83 999 1122',
    'anika.naidoo',
    'FakePass@123',
    '62837491820',
    '4111111111111111',
    'EMP-445566',
    '9876543210',
    '196.25.34.101',
    '00:1A:2B:3C:4D:5E'
  ]) {
    assert.ok(!masked.includes(value), `Expected ${value} to be masked`);
  }

  assert.ok(!masked.includes('Patient [NAME]:'));
  assert.ok(masked.includes('Patient Name: [NAME]'));
  assert.ok(masked.includes('Type 2 diabetes'));
  assert.ok(masked.includes('pregnancy'));
  assert.ok(masked.includes('Blood Pressure: 148/92'));
  assert.ok(masked.includes('Metformin 500mg twice daily'));
});

test('detects core identity, financial, contact, and medical entities', () => {
  assertIncludesTypes('Contact me at mahesh@example.com', ['EMAIL']);
  assertIncludesTypes('Phone: +1 (512) 555-0193', ['PHONE']);
  assertIncludesTypes('South African ID: 8001015009087', ['SA_ID']);
  assertIncludesTypes('SSN: 666-29-4019', ['SSN']);
  assertIncludesTypes('Bank Routing Number: 021000021', ['BANK_ROUTING']);
  assertIncludesTypes('Bank Account Number: 9482019401', ['BANK_ACCOUNT']);
  assertIncludesTypes('Driver License: TX-84920411-F', ['DRIVERS_LICENSE']);
  assertIncludesTypes('Vehicle License Plate: TX-VANCE1', ['LICENSE_PLATE']);
  assertIncludesTypes('DOB: 1991-11-23', ['DOB']);
  assertIncludesTypes('Date of Birth: November 23, 1991', ['DOB']);
  assertIncludesTypes('Member ID: MED-100293-ZA', ['POLICY_ID']);
  assertIncludesTypes('The patient takes insulin for diabetes.', ['HEALTH']);
});

test('resolves overlapping detections to the most specific entity', () => {
  assert.deepEqual(entityTypes('South African ID: 8001015009087'), ['SA_ID']);
  assert.deepEqual(entityTypes('Bank Account Number: 9482019401'), ['BANK_ACCOUNT']);
});

test('deduplicates exact duplicate card spans from generic and labeled detectors', () => {
  const result = scan('Card Number: 4111111111111111');
  assertNoOverlappingSpans(result.entities);
  assert.deepEqual(result.entities, [
    {
      type: 'CREDIT_CARD',
      value: '4111111111111111',
      start: 13,
      end: 29,
      severity: 'HIGH'
    }
  ]);
});

test('keeps adjacent non-overlapping entities', () => {
  const result = scan('Email: user@example.com IP: 192.168.1.105');
  assertNoOverlappingSpans(result.entities);
  assert.deepEqual(result.entities.map(entity => entity.type), ['EMAIL', 'IP_ADDRESS']);
});

test('prefers longer same-type spans when medical recognizers overlap', () => {
  detector.updateConfig({ medical: DEFAULT_MEDICAL_TERMS.concat('type 2 diabetes') });
  const result = scan('The patient has type 2 diabetes.');
  assertNoOverlappingSpans(result.entities);
  assert.deepEqual(result.entities, [
    {
      type: 'HEALTH',
      value: 'type 2 diabetes',
      start: 16,
      end: 31,
      severity: 'HIGH'
    }
  ]);
});

test('extracts license plate value instead of the label', () => {
  const result = scan('Vehicle License Plate: TX-VANCE1');
  assert.deepEqual(result.entities, [
    {
      type: 'LICENSE_PLATE',
      value: 'TX-VANCE1',
      start: 23,
      end: 32,
      severity: 'MEDIUM'
    }
  ]);
});

test('does not flag common benign values without sensitive labels', () => {
  assertNotIncludesTypes('The launch date is 11/23/1991 and the batch code is 4444.', ['DOB', 'CARD_LAST4']);
  assertNotIncludesTypes('This paragraph mentions a card game and account planning but no private data.', ['CREDIT_CARD', 'BANK_ACCOUNT']);
});

test('detects consent states and adjusts decision metadata', () => {
  const granted = scan('I consent. My email is user@example.com.');
  assert.equal(granted.consentStatus, 'GRANTED');
  assert.equal(granted.hasRisk, true);

  const revoked = scan('Stop recording. My HIV medication is efavirenz.');
  assert.equal(revoked.consentStatus, 'REVOKED');
  assert.equal(revoked.decision, 'BLOCKED');

  const unknown = scan('Please summarize this harmless note.');
  assert.equal(unknown.consentStatus, 'UNKNOWN');
  assert.equal(unknown.hasRisk, false);
});
