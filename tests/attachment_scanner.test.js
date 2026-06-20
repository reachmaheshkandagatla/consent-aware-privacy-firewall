const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const zlib = require('node:zlib');
const { loadExtensionScripts } = require('./helpers/loadExtensionScripts');

// All document identity and account values in this file are synthetic fixtures.

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function makeDataDescriptorDocx(xml) {
  const name = Buffer.from('word/document.xml');
  const content = Buffer.from(xml);
  const compressed = content;
  const localHeader = Buffer.concat([
    uint32(0x04034b50), uint16(20), uint16(0x08), uint16(0),
    uint16(0), uint16(0), uint32(0), uint32(0), uint32(0),
    uint16(name.length), uint16(0), name
  ]);
  const descriptor = Buffer.concat([
    uint32(0x08074b50), uint32(0), uint32(compressed.length), uint32(content.length)
  ]);
  const centralOffset = localHeader.length + compressed.length + descriptor.length;
  const centralDirectory = Buffer.concat([
    uint32(0x02014b50), uint16(20), uint16(20), uint16(0x08), uint16(0),
    uint16(0), uint16(0), uint32(0), uint32(compressed.length), uint32(content.length),
    uint16(name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0),
    uint32(0), name
  ]);
  const end = Buffer.concat([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(1), uint16(1),
    uint32(centralDirectory.length), uint32(centralOffset), uint16(0)
  ]);
  return Buffer.concat([localHeader, compressed, descriptor, centralDirectory, end]);
}

function loadAttachmentScanner() {
  loadExtensionScripts();
  const scannerPath = path.resolve(__dirname, '..', 'consent-aware-privacy-firewall-extension', 'src', 'attachment_scanner.js');
  delete require.cache[require.resolve(scannerPath)];
  require(scannerPath);
  return global.window.CAFAttachmentScanner;
}

test('extracts and scans DOCX files that use ZIP data descriptors', async () => {
  const text = `Case Number: DIV-2026-88231
Applicant: Priya Naidoo
Respondent: Rajesh Naidoo
Children: Aarav Naidoo (DOB 2018-02-11)
Attorney: Michael Peterson
Cell: +27 82 123 9999
Residential Address: 45 Rose Street, Pretoria
Bank Account: 62198734567`;
  const xml = `<w:document xmlns:w="test"><w:body>${text.split('\n').map(line => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`;
  const docx = makeDataDescriptorDocx(xml);
  const arrayBuffer = docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.byteLength);
  const file = {
    name: 'divorce settlement agreement.docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: docx.length,
    arrayBuffer: async () => arrayBuffer
  };
  const scanner = loadAttachmentScanner();

  const [result] = await scanner.scanFiles([file]);

  assert.equal(result.error, undefined);
  const types = result.scan.entities.map(entity => entity.type);
  for (const expected of ['REFERENCE_ID', 'NAME', 'DOB', 'PHONE', 'LOCATION', 'BANK_ACCOUNT']) {
    assert.ok(types.includes(expected), `Expected ${expected}; found ${types.join(', ')}`);
  }
});

test('extracts text from a compressed PDF content stream', async () => {
  const scanner = loadAttachmentScanner();
  const content = Buffer.from('BT /F1 12 Tf (Full Name: Alex Mercer) Tj ET');
  const compressed = zlib.deflateSync(content);
  const prefix = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`);
  const suffix = Buffer.from('\nendstream\nendobj\n%%EOF');
  const pdf = Buffer.concat([prefix, compressed, suffix]);
  const arrayBuffer = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);

  const text = await scanner.extractPdfText(arrayBuffer);

  assert.ok(text.includes('Full Name: Alex Mercer'));
});
