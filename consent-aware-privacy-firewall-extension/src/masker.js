// masker.js
(function () {
  const DEFAULT_PRESERVED_TYPES = new Set(['HEALTH']);

  function shouldMaskEntity(entity, options) {
    const preserveTypes = options && options.preserveTypes
      ? new Set(options.preserveTypes)
      : DEFAULT_PRESERVED_TYPES;
    return !preserveTypes.has(entity.type);
  }

  function maskText(original, entities, options) {
    if (!entities || entities.length === 0) return original;
    let out = original;
    // sort desc by start
    const sorted = entities.slice().sort((a, b) => b.start - a.start);
    for (const e of sorted) {
      if (!shouldMaskEntity(e, options)) continue;
      let mask = '[REDACTED]';
      if (e.type === 'SA_ID') mask = '[ID_NUMBER]';
      if (e.type === 'EMAIL') mask = '[EMAIL_MASKED]';
      if (e.type === 'PHONE') mask = '[PHONE_MASKED]';
      if (e.type === 'PASSPORT') mask = '[PASSPORT_MASKED]';
      if (e.type === 'DRIVERS_LICENSE') mask = '[DRIVERS_LICENSE_MASKED]';
      if (e.type === 'CREDIT_CARD') mask = '[CARD_MASKED]';
      if (e.type === 'CARD_LAST4') mask = '[CARD_LAST4_MASKED]';
      if (e.type === 'CARD_EXPIRY') mask = '[EXPIRY_MASKED]';
      if (e.type === 'CVV') mask = '[CVV_MASKED]';
      if (e.type === 'DOB') mask = '[DOB_MASKED]';
      if (e.type === 'POLICY_ID') mask = '[POLICY_ID_MASKED]';
      if (e.type === 'MEMBER_NUMBER') mask = '[MEMBER_NUMBER_MASKED]';
      if (e.type === 'MEDICAL_AID') mask = '[MEDICAL_AID_MASKED]';
      if (e.type === 'REFERENCE_ID') mask = '[REFERENCE_MASKED]';
      if (e.type === 'RELATIONSHIP') mask = '[RELATIONSHIP_MASKED]';
      if (e.type === 'HOSPITAL_NUMBER') mask = '[HOSPITAL_NUMBER_MASKED]';
      if (e.type === 'MEDICAL_RECORD_NUMBER') mask = '[MRN_MASKED]';
      if (e.type === 'BANK_ACCOUNT') mask = '[BANK_ACCOUNT_MASKED]';
      if (e.type === 'BANK_ROUTING') mask = '[BANK_ROUTING_MASKED]';
      if (e.type === 'BRANCH_CODE') mask = '[BRANCH_CODE_MASKED]';
      if (e.type === 'TAX_NUMBER') mask = '[TAX_NUMBER_MASKED]';
      if (e.type === 'EMPLOYER') mask = '[EMPLOYER_MASKED]';
      if (e.type === 'EMPLOYEE_ID') mask = '[EMPLOYEE_ID_MASKED]';
      if (e.type === 'SALARY') mask = '[SALARY_MASKED]';
      if (e.type === 'USERNAME') mask = '[USERNAME_MASKED]';
      if (e.type === 'PASSWORD') mask = '[PASSWORD_MASKED]';
      if (e.type === 'API_KEY') mask = '[API_KEY_MASKED]';
      if (e.type === 'ACCESS_TOKEN') mask = '[ACCESS_TOKEN_MASKED]';
      if (e.type === 'STUDENT_ID') mask = '[STUDENT_ID_MASKED]';
      if (e.type === 'OTP') mask = '[OTP_MASKED]';
      if (e.type === 'SOCIAL_PROFILE') mask = '[SOCIAL_PROFILE_MASKED]';
      if (e.type === 'SOCIAL_HANDLE') mask = '[SOCIAL_HANDLE_MASKED]';
      if (e.type === 'IP_ADDRESS') mask = '[IP_MASKED]';
      if (e.type === 'MAC_ADDRESS') mask = '[MAC_MASKED]';
      if (e.type === 'IMEI') mask = '[IMEI_MASKED]';
      if (e.type === 'GPS_LOCATION') mask = '[GPS_MASKED]';
      if (e.type === 'LOCATION') mask = '[LOCATION]';
      if (e.type === 'NAME') mask = '[NAME]';
      out = out.slice(0, e.start) + mask + out.slice(e.end);
    }
    return out;
  }

  window.ConsentMasker = { maskText };
})();
