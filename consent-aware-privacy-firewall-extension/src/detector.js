// detector.js
// Rule-based local detection for sensitive entities and consent

// Make detector configurable and generic. Load patterns from storage if present.
(function () {
  function findAll(regex, text) {
    const out = [];
    let m;
    const flags = regex.flags.indexOf('g') === -1 ? regex.flags + 'g' : regex.flags;
    const r = new RegExp(regex.source, flags);
    while ((m = r.exec(text)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length, value: m[0] });
      if (r.lastIndex === m.index) r.lastIndex++;
    }
    return out;
  }

  // Luhn algorithm for checksum validation (used for CC and SA ID check digit)
  function luhnCheck(numStr) {
    const digits = numStr.replace(/\D/g, '').split('').reverse().map(d => parseInt(d, 10));
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = digits[i];
      if (i % 2 === 1) {
        d = d * 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    return sum % 10 === 0;
  }

  // Validate South African ID using date prefix and Luhn checksum
  function validateSAID(id13) {
    if (!/^[0-9]{13}$/.test(id13)) return false;
    const yy = parseInt(id13.slice(0, 2), 10);
    const mm = parseInt(id13.slice(2, 4), 10);
    const dd = parseInt(id13.slice(4, 6), 10);
    if (!(mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)) return false;
    // Luhn on all 13 digits should be true where last is checksum
    return luhnCheck(id13);
  }

  function pushCapturedEntity(out, type, match, capturedValue, severity) {
    if (!capturedValue) return;
    const leadingWhitespace = capturedValue.match(/^\s*/)[0].length;
    const cleanValue = capturedValue.trim();
    if (!cleanValue) return;
    const capturedStart = match[0].indexOf(capturedValue);
    if (capturedStart === -1) return;
    const start = match.index + capturedStart + leadingWhitespace;
    out.push({ type, value: cleanValue, start, end: start + cleanValue.length, severity });
  }

  function pushLabeledEntities(out, type, text, regex, severity, groupIndex) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      pushCapturedEntity(out, type, match, match[groupIndex || 1], severity);
      if (regex.lastIndex === match.index) regex.lastIndex++;
    }
  }

  // Default configurable patterns
  const DEFAULT_CONFIG = {
    medical: ['HIV','diabetes','pregnancy','blood pressure','medication','TB','depression','cancer','ARV','insulin','hypertension','mental health','diagnosis','prescription','allergies','allergy','cetirizine','health insurance','miscarriage'],
    name_labels: ['name', 'patient name', 'patient full name', 'student name', 'full name', 'father name', "father's name", 'fathers name', 'mother name', "mother's name", 'mothers name', 'parent name', 'emergency contact', 'contact', 'hr contact', 'account holder', 'card holder', 'full card holder', 'employee', 'manager', 'supervisor', 'director', 'payee', 'payer', 'beneficiary', 'applicant', 'respondent', 'child', 'children', 'attorney', 'lawyer', 'advocate', 'guardian', 'witness'],
    consent_phrases: {
      GRANTED: ['I consent','You may record me','You can use my data','Ek stem toe','Ndiyavuma'],
      DENIED: ['Do not record me','I do not consent','Moenie my opneem nie','Sukundirekhoda'],
      REVOKED: ['Stop recording','Withdraw my consent','Delete my data','Hou op om my op te neem','Yeka ukundirekhoda']
    }
  };

  let CONFIG = DEFAULT_CONFIG;

  // Load overrides from storage (if extension settings update patterns)
  try {
    chrome && chrome.storage && chrome.storage.local && chrome.storage.local.get(['caf_patterns'], (res) => {
      if (res && res.caf_patterns) {
        try { CONFIG = Object.assign({}, DEFAULT_CONFIG, res.caf_patterns); } catch(e){}
      }
    });
  } catch(e) {}

  function detectSAID(text) {
    const rx = /\b(\d{13})\b/g;
    const out = [];
    for (const m of findAll(rx, text)) {
      if (validateSAID(m.value)) out.push({ type: 'SA_ID', value: m.value, start: m.start, end: m.end, severity: 'HIGH' });
    }
    return out;
  }

  function detectEmail(text) {
    const rx = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    return findAll(rx, text).map(m => ({ type: 'EMAIL', value: m.value, start: m.start, end: m.end, severity: 'MEDIUM' }));
  }

  function detectPhone(text) {
    // Support South African and common US formats (+1, parentheses, dashes, spaces)
    const rx = /(?:\+27\s?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b)|(?:\+1\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b)|(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b)/g;
    return findAll(rx, text).map(m => ({ type: 'PHONE', value: m.value, start: m.start, end: m.end, severity: 'MEDIUM' }));
  }

  function detectSSN(text) {
    // US Social Security Number patterns: 123-45-6789 or 9 contiguous digits
    const out = [];
    const rx1 = /\b\d{3}-\d{2}-\d{4}\b/g;
    for (const m of findAll(rx1, text)) out.push({ type: 'SSN', value: m.value, start: m.start, end: m.end, severity: 'HIGH' });
    // look for 'full on file' style or labels followed by 9 digits
    const labeled = /(?:ssn|social security number|full on file)[:\s]*\(?\b(\d{3}-?\d{2}-?\d{4})\b\)?/ig;
    for (const m of findAll(labeled, text)) {
      // capture group may contain digits; extract digits
      const v = m.value.match(/\d[\d-]{7,}\d/);
      if (v) out.push({ type: 'SSN', value: v[0], start: m.start + m.value.indexOf(v[0]), end: m.start + m.value.indexOf(v[0]) + v[0].length, severity: 'HIGH' });
    }
    return out;
  }

  function detectPassport(text) {
    const out = [];
    pushLabeledEntities(out, 'PASSPORT', text, /passport(?:\s+number)?[:\s]*([A-Z0-9]{6,12})/ig, 'HIGH');
    return out;
  }

  function detectRoutingAndAccount(text) {
    const out = [];
    // detect routing number when labeled
    const routingRx = /(?:routing number|bank routing number|aba)[:\s]*([0-9]{9})/ig;
    for (const m of findAll(routingRx, text)) {
      const v = m.value.match(/[0-9]{9}/);
      if (v) out.push({ type: 'BANK_ROUTING', value: v[0], start: m.start + m.value.indexOf(v[0]), end: m.start + m.value.indexOf(v[0]) + v[0].length, severity: 'HIGH' });
    }
    const accountRx = /(?:account number|bank account number|bank account)[:\s]*([0-9]{6,20})/ig;
    for (const m of findAll(accountRx, text)) {
      const v = m.value.match(/[0-9]{6,20}/);
      if (v) out.push({ type: 'BANK_ACCOUNT', value: v[0], start: m.start + m.value.indexOf(v[0]), end: m.start + m.value.indexOf(v[0]) + v[0].length, severity: 'HIGH' });
    }
    return out;
  }

  function detectMedicalIdentifiers(text) {
    const out = [];
    pushLabeledEntities(out, 'MEDICAL_AID', text, /medical\s+aid(?:\s+is|:)?\s*([A-Z][A-Za-z .'-]*?)(?=\s+member\s+number|\n|\r|$)/ig, 'HIGH');
    pushLabeledEntities(out, 'MEMBER_NUMBER', text, /member\s+number[:\s]*([A-Z0-9][A-Z0-9-]{4,})/ig, 'HIGH');
    pushLabeledEntities(out, 'HOSPITAL_NUMBER', text, /hospital\s+number[:\s]*([A-Z0-9][A-Z0-9-]{4,})/ig, 'HIGH');
    pushLabeledEntities(out, 'HOSPITAL_NUMBER', text, /hospital\s+record\s+number(?:\s+is|:)?\s*([A-Z0-9][A-Z0-9-]{4,})/ig, 'HIGH');
    pushLabeledEntities(out, 'MEDICAL_RECORD_NUMBER', text, /medical\s+record\s+number[:\s]*([A-Z0-9][A-Z0-9-]{4,})/ig, 'HIGH');
    return out;
  }

  function detectPersonalProfileFields(text) {
    const out = [];
    pushLabeledEntities(out, 'RELATIONSHIP', text, /relationship[:\s]*([^\n\r]+)/ig, 'MEDIUM');
    return out;
  }

  function detectEducationIdentifiers(text) {
    const out = [];
    pushLabeledEntities(out, 'STUDENT_ID', text, /(?:student|learner|pupil)\s+(?:id|number|no\.?)[\s:#-]*#?([A-Z0-9][A-Z0-9-]{4,})/ig, 'HIGH');
    return out;
  }

  function detectTaxAndEmployment(text) {
    const out = [];
    pushLabeledEntities(out, 'TAX_NUMBER', text, /tax\s+number[:\s]*([0-9]{6,15})/ig, 'HIGH');
    pushLabeledEntities(out, 'TAX_NUMBER', text, /tax\s+number\s+is\s+([0-9]{6,15})/ig, 'HIGH');
    pushLabeledEntities(out, 'BRANCH_CODE', text, /branch\s+code[:\s]*([0-9]{4,10})/ig, 'MEDIUM');
    pushLabeledEntities(out, 'EMPLOYER', text, /employer:\s*([^\n\r]+)/ig, 'MEDIUM');
    pushLabeledEntities(out, 'EMPLOYEE_ID', text, /\b(EMP-[0-9A-Z-]{3,})\b/ig, 'MEDIUM');
    pushLabeledEntities(out, 'EMPLOYEE_ID', text, /employee\s+number[:\s]*([A-Z0-9][A-Z0-9-]{3,})/ig, 'MEDIUM');
    pushLabeledEntities(out, 'SALARY', text, /monthly\s+salary[:\s]*(R?\s?[0-9][0-9,]*(?:\.[0-9]{2})?)/ig, 'MEDIUM');
    return out;
  }

  function detectReferenceIdentifiers(text) {
    const out = [];
    pushLabeledEntities(out, 'REFERENCE_ID', text, /(?:[A-Z][A-Za-z]+\s+){0,4}reference[:\s]*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+){2,})/ig, 'MEDIUM');
    pushLabeledEntities(out, 'REFERENCE_ID', text, /(?:case|matter|file|docket)\s+number[:\s]*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,})/ig, 'MEDIUM');
    pushLabeledEntities(out, 'REFERENCE_ID', text, /(?:(?:primary|client|customer|bank)\s+)?(?:customer|client|order|invoice|receipt|ticket|booking|reservation|request|transaction|application|claim|account)\s+(?:id|number|no\.?|ref(?:erence)?)[\s:,-]*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)/ig, 'MEDIUM');
    pushLabeledEntities(out, 'REFERENCE_ID', text, /(?:retirement\s+annuity|pension|provident\s+fund|investment\s+account|portfolio|fund)\s*(?:id|number|no\.?|ref(?:erence)?)?[:\s]*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)/ig, 'MEDIUM');
    return out;
  }

  function detectCredentials(text) {
    const out = [];
    pushLabeledEntities(out, 'USERNAME', text, /username[:\s]*([A-Za-z0-9._-]{3,})/ig, 'HIGH');
    pushLabeledEntities(out, 'PASSWORD', text, /password[:\s]*([^\s\n\r]+)/ig, 'HIGH');
    pushLabeledEntities(out, 'API_KEY', text, /(?:api\s+key|secret\s+key|client\s+secret)[\s:=,-]*([A-Za-z0-9._\/-]{10,})/ig, 'HIGH');
    pushLabeledEntities(out, 'ACCESS_TOKEN', text, /(?:(?:openai|hugging\s*face|github|gitlab|temporary)\s+)?(?:access\s+token|auth(?:entication)?\s+token|bearer\s+token|personal\s+access\s+token)[\s:=,-]*([A-Za-z0-9._\/-]{10,})/ig, 'HIGH');
    pushLabeledEntities(out, 'API_KEY', text, /\b[A-Za-z][A-Za-z0-9_-]*(?:[_-](?:key|token|secret))\s*[:=]\s*["']?([A-Za-z0-9._+\/-]{16,})["']?/g, 'HIGH');
    const prefixedSecretRx = /\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}|hf_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|glpat-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16})\b/g;
    for (const match of findAll(prefixedSecretRx, text)) {
      out.push({ type: 'API_KEY', value: match.value, start: match.start, end: match.end, severity: 'HIGH' });
    }
    pushLabeledEntities(out, 'OTP', text, /(?:one-time\s+pin|otp|pin)[:\s]*([0-9]{4,8})/ig, 'HIGH');
    return out;
  }

  function detectSocial(text) {
    const out = [];
    pushLabeledEntities(out, 'SOCIAL_PROFILE', text, /linkedin[:\s]*([^\s\n\r]+)/ig, 'MEDIUM');
    pushLabeledEntities(out, 'SOCIAL_HANDLE', text, /(?:twitter\/x\s+handle|twitter\s+handle|x\s+handle)[:\s]*(@[A-Za-z0-9_]{2,})/ig, 'MEDIUM');
    return out;
  }

  function detectDeviceIdentifiers(text) {
    const out = [];
    const macRx = /\b(?:[0-9A-F]{2}:){5}[0-9A-F]{2}\b/ig;
    for (const m of findAll(macRx, text)) out.push({ type: 'MAC_ADDRESS', value: m.value, start: m.start, end: m.end, severity: 'HIGH' });
    pushLabeledEntities(out, 'IMEI', text, /imei[:\s]*([0-9]{14,17})/ig, 'HIGH');
    return out;
  }

  function detectIP(text) {
    const rx = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
    return findAll(rx, text).map(m => ({ type: 'IP_ADDRESS', value: m.value, start: m.start, end: m.end, severity: 'MEDIUM' }));
  }

  function detectDriversLicense(text) {
    const out = [];
    // match patterns like TX-84920411-F or DL: TX84920411
    const rx = /\b[A-Z]{2}-?\d{5,9}-?[A-Z]?\b/g;
    for (const m of findAll(rx, text)) {
      // only flag when near words like 'driver' or 'license' or state code present
      const context = text.slice(Math.max(0, m.start - 30), Math.min(text.length, m.end + 30)).toLowerCase();
      if (context.includes('license') || context.includes('dl') || context.match(/\bdriver/)) {
        out.push({ type: 'DRIVERS_LICENSE', value: m.value, start: m.start, end: m.end, severity: 'HIGH' });
      }
    }
    return out;
  }

  function detectLicensePlate(text) {
    const out = [];
    const rx = /license plate[:\s]*([A-Z0-9-]{3,12})/ig;
    for (const m of findAll(rx, text)) {
      const label = m.value.match(/license plate[:\s]*/i);
      const candidate = label ? m.value.slice(label[0].length) : m.value;
      const v = candidate.match(/[A-Z0-9-]{3,12}/i);
      if (v) out.push({ type: 'LICENSE_PLATE', value: v[0], start: m.start + m.value.indexOf(v[0]), end: m.start + m.value.indexOf(v[0]) + v[0].length, severity: 'MEDIUM' });
    }
    return out;
  }

  function detectCreditCard(text) {
    const rx = /\b(?:\d[ -]*?){13,19}\b/g;
    const out = [];
    for (const m of findAll(rx, text)) {
      const digits = m.value.replace(/[^0-9]/g, '');
      if (digits.length >= 13 && digits.length <= 19 && luhnCheck(digits)) {
        out.push({ type: 'CREDIT_CARD', value: m.value, start: m.start, end: m.end, severity: 'HIGH' });
      }
    }
    const labeledRx = /(?:card number|credit card|visa|mastercard|amex|american express)[:\s\w'-]*?((?:\d[ -]*?){13,19})\b/ig;
    for (const m of findAll(labeledRx, text)) {
      const v = m.value.match(/(?:\d[ -]*?){13,19}\b/);
      if (v) {
        const start = m.start + m.value.indexOf(v[0]);
        out.push({ type: 'CREDIT_CARD', value: v[0], start, end: start + v[0].length, severity: 'HIGH' });
      }
    }
    return out;
  }

  function detectDOB(text) {
    const out = [];
    const rx = /(?:dob|date of birth|birth date)[:\s]*([0-1]?\d[\/.-][0-3]?\d[\/.-](?:\d{4}|\d{2})|\d{4}[\/.-][0-1]?\d[\/.-][0-3]?\d|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s.-]+\d{1,2},?[\s.-]+\d{4}|[0-3]?\d[\s.-]+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s.-]+\d{4})/ig;
    for (const m of findAll(rx, text)) {
      const v = m.value.replace(/^(?:dob|date of birth|birth date)[:\s]*/i, '');
      const start = m.start + m.value.indexOf(v);
      out.push({ type: 'DOB', value: v, start, end: start + v.length, severity: 'HIGH' });
    }
    return out;
  }

  function detectFinancialFields(text) {
    const out = [];
    const cvvRx = /(?:cvv|cvc|security code)[:\s]*([0-9]{3,4})\b/ig;
    for (const m of findAll(cvvRx, text)) {
      const v = m.value.match(/[0-9]{3,4}\b/);
      if (v) out.push({ type: 'CVV', value: v[0], start: m.start + m.value.indexOf(v[0]), end: m.start + m.value.indexOf(v[0]) + v[0].length, severity: 'HIGH' });
    }

    const expiryRx = /(?:exp(?:iry|iration)?(?:\s+date)?|valid thru)[:\s]*([0-1]?\d[\/.-]\d{2,4})\b/ig;
    for (const m of findAll(expiryRx, text)) {
      const v = m.value.match(/[0-1]?\d[\/.-]\d{2,4}\b/);
      if (v) out.push({ type: 'CARD_EXPIRY', value: v[0], start: m.start + m.value.indexOf(v[0]), end: m.start + m.value.indexOf(v[0]) + v[0].length, severity: 'HIGH' });
    }

    const last4Rx = /(?:card ending in|ending in|last(?:\s|-)?4)[:\s]*(\d{4})\b/ig;
    for (const m of findAll(last4Rx, text)) {
      const v = m.value.match(/\d{4}\b/);
      if (v) out.push({ type: 'CARD_LAST4', value: v[0], start: m.start + m.value.indexOf(v[0]), end: m.start + m.value.indexOf(v[0]) + v[0].length, severity: 'MEDIUM' });
    }

    return out;
  }

  function detectPolicyId(text) {
    const out = [];
    const rx = /(?:policy id|policy number|member id|insurance id)[:\s]*([A-Z0-9][A-Z0-9-]{4,})/ig;
    for (const m of findAll(rx, text)) {
      const v = m.value.replace(/^(?:policy id|policy number|member id|insurance id)[:\s]*/i, '');
      const start = m.start + m.value.indexOf(v);
      out.push({ type: 'POLICY_ID', value: v, start, end: start + v.length, severity: 'HIGH' });
    }
    return out;
  }

  function detectMedical(text) {
    const out = [];
    const lower = text.toLowerCase();
    for (const term of CONFIG.medical) {
      let idx = lower.indexOf(term.toLowerCase());
      while (idx !== -1) {
        out.push({ type: 'HEALTH', value: text.substr(idx, term.length), start: idx, end: idx + term.length, severity: 'HIGH' });
        idx = lower.indexOf(term.toLowerCase(), idx + 1);
      }
    }
    return out;
  }

  function detectLocation(text) {
    const out = [];
    const placeName = "[A-Z][A-Za-z'-]*(?:\\.[A-Z][A-Za-z'-]*)?(?:[\\t ][A-Z][A-Za-z'-]*(?:\\.[A-Z][A-Za-z'-]*)?){0,3}";
    const contextLocationRx = new RegExp(`\\b(?:lives in|living in|resides in|based in|located in|located at|from)\\s+(${placeName})(?=[,.;\\n\\r]|$)`, 'g');
    let match;
    while ((match = contextLocationRx.exec(text)) !== null) {
      pushCapturedEntity(out, 'LOCATION', match, match[1], 'MEDIUM');
      if (contextLocationRx.lastIndex === match.index) contextLocationRx.lastIndex++;
    }
    const addressRx = /(?:mailing address(?: for statements)?|address)[:\s]*([0-9]{1,6}\s+[A-Za-z0-9 .,'#-]+,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s*,?\s*\d{5}(?:-\d{4})?)/ig;
    for (const m of findAll(addressRx, text)) {
      const v = m.value.replace(/^(?:mailing address(?: for statements)?|address)[:\s]*/i, '');
      const start = m.start + m.value.indexOf(v);
      out.push({ type: 'LOCATION', value: v, start, end: start + v.length, severity: 'HIGH' });
    }
    pushLabeledEntities(out, 'LOCATION', text, /(?:home\s+address|mailing\s+address(?:\s+for\s+statements)?|address)[:\s]*(?:\r?\n)?([0-9]{1,6}[^\n\r]+)/ig, 'HIGH');
    pushLabeledEntities(out, 'LOCATION', text, /address\s+is\s+([0-9]{1,6}[^.\n\r]+(?:\d{4,5})?)/ig, 'HIGH');
    pushLabeledEntities(out, 'GPS_LOCATION', text, /gps\s+location[:\s]*(?:\r?\n)?(-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+)/ig, 'HIGH');
    return out;
  }

  function detectName(text) {
    const out = [];
    function pushCapturedName(match, capturedValue) {
      const valueStart = match[0].indexOf(capturedValue);
      if (valueStart === -1) return;
      const start = match.index + valueStart;
      out.push({ type: 'NAME', value: capturedValue, start, end: start + capturedValue.length, severity: 'MEDIUM' });
    }

    const namePart = "[A-Z][A-Za-z'\\u2019-]+";
    const joiner = "(?:de|del|der|du|la|le|van|von)";
    const fullName = `${namePart}(?:[\\t ]+(?:${namePart}|${joiner})){1,4}|${namePart},[\\t ]*${namePart}`;
    const labels = (CONFIG.name_labels || [])
      .map(label => label
        .split(/\s+/)
        .map(part => part.split('').map(char => /[a-z]/i.test(char) ? `[${char.toUpperCase()}${char.toLowerCase()}]` : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(''))
        .join('\\s+'))
      .join('|');

    if (labels) {
      const labeledName = "[A-Za-z][A-Za-z'\\\\u2019-]*(?:[\\\\t ]+(?:[A-Za-z][A-Za-z'\\\\u2019-]*|de|del|der|du|la|le|van|von)){0,4}";
      const labeledNameRx = new RegExp(`(?:^|[\\r\\n])\\s*(?:${labels})\\s*[:\\-]?\\s*(${labeledName})(?=\\s*(?:[\\r\\n(,]|$))`, 'g');
      let match;
      while ((match = labeledNameRx.exec(text)) !== null) {
        pushCapturedName(match, match[1]);
        if (labeledNameRx.lastIndex === match.index) labeledNameRx.lastIndex++;
      }
    }

    const contactLabelRx = new RegExp(`(?:^|[\\r\\n])\\s*(?:[A-Z][A-Za-z]+[\\t ]+){0,3}Contact\\s*[:\\-]?\\s*(${fullName})`, 'g');
    let match;
    while ((match = contactLabelRx.exec(text)) !== null) {
      pushCapturedName(match, match[1]);
      if (contactLabelRx.lastIndex === match.index) contactLabelRx.lastIndex++;
    }

    const nameBeforeContactFieldRx = new RegExp(`(?:^|[\\r\\n])\\s*(${fullName})\\s+(?=(?:Phone|Email|Mobile|Cell|Tel|Telephone)\\s*:)`, 'g');
    while ((match = nameBeforeContactFieldRx.exec(text)) !== null) {
      pushCapturedName(match, match[1]);
      if (nameBeforeContactFieldRx.lastIndex === match.index) nameBeforeContactFieldRx.lastIndex++;
    }

    const selfIntroRx = new RegExp(`\\b(?:[Mm]y name is|[Ii] am)\\s+(${fullName})(?=\\b|[,.])`, 'g');
    while ((match = selfIntroRx.exec(text)) !== null) {
      pushCapturedName(match, match[1]);
      if (selfIntroRx.lastIndex === match.index) selfIntroRx.lastIndex++;
    }

    const familyContextRx = new RegExp(`\\b(?:my|the)\\s+(?:mother|father|parent|guardian|son|daughter)\\s*,?\\s+(${fullName})(?=\\s*(?:\\(|,|\\.|$))`, 'g');
    while ((match = familyContextRx.exec(text)) !== null) {
      pushCapturedName(match, match[1]);
      if (familyContextRx.lastIndex === match.index) familyContextRx.lastIndex++;
    }

    // Fallback for compact clinical notation with a labeled patient name.
    const patientRx = new RegExp(`\\b(?:Patient|Full Card Holder)(?![\\t ]+(?:Name|Full Name))[:\\s]+(${fullName})`, 'g');
    while ((match = patientRx.exec(text)) !== null) {
      pushCapturedName(match, match[1]);
      if (patientRx.lastIndex === match.index) patientRx.lastIndex++;
    }
    return out;
  }

  function detectConsent(text) {
    if (!text || !text.trim()) return 'UNKNOWN';
    const lower = text.toLowerCase();
    for (const state of Object.keys(CONFIG.consent_phrases)) {
      for (const phrase of CONFIG.consent_phrases[state]) {
        if (lower.includes(phrase.toLowerCase())) return state;
      }
    }
    return 'UNKNOWN';
  }

  function computeScore(entities, consent) {
    let score = 0;
    for (const e of entities) {
      if (e.severity === 'HIGH') score += 30;
      else if (e.severity === 'MEDIUM') score += 15;
      else score += 5;
    }
    if (consent === 'REVOKED') score += 40;
    if (consent === 'DENIED') score += 30;
    if (consent === 'GRANTED') score = Math.max(0, score - 10);
    if (score > 100) score = 100;
    return score;
  }

  function riskLevel(score) {
    if (score <= 20) return 'LOW';
    if (score <= 60) return 'MEDIUM';
    return 'HIGH';
  }

  function decision(score, consent) {
    const level = riskLevel(score);
    if (level === 'HIGH') {
      if (consent === 'GRANTED') return 'WARN';
      return 'BLOCKED';
    }
    if (level === 'MEDIUM') return 'WARN';
    return 'ALLOW';
  }

  const ENTITY_PRIORITY = {
    SA_ID: 100,
    SSN: 100,
    PASSPORT: 98,
    IMEI: 98,
    API_KEY: 98,
    PASSWORD: 98,
    CREDIT_CARD: 95,
    CVV: 95,
    CARD_EXPIRY: 95,
    BANK_ACCOUNT: 90,
    BANK_ROUTING: 90,
    POLICY_ID: 90,
    MEMBER_NUMBER: 90,
    HOSPITAL_NUMBER: 90,
    MEDICAL_RECORD_NUMBER: 90,
    REFERENCE_ID: 90,
    TAX_NUMBER: 88,
    OTP: 88,
    MAC_ADDRESS: 88,
    DOB: 85,
    DRIVERS_LICENSE: 85,
    GPS_LOCATION: 85,
    USERNAME: 82,
    EMPLOYEE_ID: 82,
    LICENSE_PLATE: 80,
    IP_ADDRESS: 75,
    EMAIL: 70,
    SOCIAL_PROFILE: 70,
    SOCIAL_HANDLE: 70,
    MEDICAL_AID: 68,
    EMPLOYER: 65,
    SALARY: 65,
    BRANCH_CODE: 62,
    RELATIONSHIP: 62,
    PHONE: 60,
    LOCATION: 55,
    NAME: 50,
    HEALTH: 45,
    CARD_LAST4: 40
  };

  const SEVERITY_WEIGHT = { HIGH: 3, MEDIUM: 2, LOW: 1 };

  function spanLength(entity) {
    return entity.end - entity.start;
  }

  function entitiesOverlap(a, b) {
    return a.start < b.end && a.end > b.start;
  }

  function isValidSpan(entity, textLength) {
    return entity &&
      Number.isInteger(entity.start) &&
      Number.isInteger(entity.end) &&
      entity.start >= 0 &&
      entity.end <= textLength &&
      entity.start < entity.end;
  }

  function compareEntityPriority(a, b) {
    const aPriority = ENTITY_PRIORITY[a.type] || 0;
    const bPriority = ENTITY_PRIORITY[b.type] || 0;
    if (bPriority !== aPriority) return bPriority - aPriority;

    const aSeverity = SEVERITY_WEIGHT[a.severity] || 0;
    const bSeverity = SEVERITY_WEIGHT[b.severity] || 0;
    if (bSeverity !== aSeverity) return bSeverity - aSeverity;

    const lengthDiff = spanLength(b) - spanLength(a);
    if (lengthDiff !== 0) return lengthDiff;

    const startDiff = a.start - b.start;
    if (startDiff !== 0) return startDiff;

    return String(a.type).localeCompare(String(b.type));
  }

  function dedupeExactEntities(entities) {
    const byKey = new Map();
    for (const entity of entities) {
      const key = `${entity.type}|${entity.start}|${entity.end}`;
      const existing = byKey.get(key);
      if (!existing || compareEntityPriority(entity, existing) < 0) {
        byKey.set(key, entity);
      }
    }
    return Array.from(byKey.values());
  }

  function resolveOverlaps(entities) {
    const ranked = dedupeExactEntities(entities).sort(compareEntityPriority);

    const selected = [];
    for (const entity of ranked) {
      const overlaps = selected.some(existing => entitiesOverlap(entity, existing));
      if (!overlaps) selected.push(entity);
    }
    return selected.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function scan(text) {
    const entities = [];
    entities.push(...detectSAID(text));
    entities.push(...detectEmail(text));
    entities.push(...detectPhone(text));
    entities.push(...detectCreditCard(text));
    entities.push(...detectDOB(text));
    entities.push(...detectFinancialFields(text));
    entities.push(...detectPolicyId(text));
    entities.push(...detectPassport(text));
    entities.push(...detectSSN(text));
    entities.push(...detectRoutingAndAccount(text));
    entities.push(...detectMedicalIdentifiers(text));
    entities.push(...detectPersonalProfileFields(text));
    entities.push(...detectEducationIdentifiers(text));
    entities.push(...detectTaxAndEmployment(text));
    entities.push(...detectReferenceIdentifiers(text));
    entities.push(...detectCredentials(text));
    entities.push(...detectSocial(text));
    entities.push(...detectDeviceIdentifiers(text));
    entities.push(...detectIP(text));
    entities.push(...detectDriversLicense(text));
    entities.push(...detectLicensePlate(text));
    entities.push(...detectMedical(text));
    entities.push(...detectLocation(text));
    entities.push(...detectName(text));

    const resolved = resolveOverlaps(entities.filter(entity => isValidSpan(entity, text.length)));
    const consent = detectConsent(text);
    const score = computeScore(resolved, consent);
    const level = riskLevel(score);
    const decisionVal = decision(score, consent);

    return { hasRisk: resolved.length > 0, entities: resolved, consentStatus: consent, riskScore: score, riskLevel: level, decision: decisionVal };
  }

  // allow runtime updates to config
  function updateConfig(newCfg) { CONFIG = Object.assign({}, CONFIG, newCfg); }

  window.ConsentDetector = { scan, updateConfig };
})();
