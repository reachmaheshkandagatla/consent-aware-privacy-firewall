// attachment_scanner.js — local demo scanner for PDF and DOCX attachments
(function () {
  const MAX_FILE_BYTES = 8 * 1024 * 1024;

  function fileKind(file) {
    const name = (file && file.name ? file.name : '').toLowerCase();
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'PDF';
    if (name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'DOCX';
    return null;
  }

  function decodeBytes(bytes) {
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      return Array.from(bytes).map(byte => String.fromCharCode(byte)).join('');
    }
  }

  function bytesToBinaryString(bytes) {
    let output = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      output += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return output;
  }

  function decodePdfLiteral(value) {
    return value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\b/g, '\b')
      .replace(/\\f/g, '\f')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/\\([0-7]{1,3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)));
  }

  function collectPdfText(raw) {
    const chunks = [];
    const literalRx = /\((?:\\.|[^\\)]){2,}\)/g;
    const hexRx = /<([0-9A-Fa-f\s]{6,})>/g;
    let match;

    while ((match = literalRx.exec(raw)) !== null) {
      const value = decodePdfLiteral(match[0].slice(1, -1)).trim();
      if (/[A-Za-z0-9]/.test(value)) chunks.push(value);
    }

    while ((match = hexRx.exec(raw)) !== null) {
      const hex = match[1].replace(/\s+/g, '');
      if (hex.length % 2 !== 0) continue;
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      const value = decodeBytes(bytes).replace(/\u0000/g, '').trim();
      if (/[A-Za-z0-9]/.test(value)) chunks.push(value);
    }

    return chunks;
  }

  async function inflateZlib(bytes) {
    if (typeof DecompressionStream === 'undefined') return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function extractPdfText(buffer) {
    const raw = bytesToBinaryString(new Uint8Array(buffer));
    const chunks = collectPdfText(raw);
    const streamRx = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRx.exec(raw)) !== null) {
      if (!/\/FlateDecode\b/.test(match[1])) continue;
      try {
        const encoded = match[2];
        const bytes = Uint8Array.from(encoded, char => char.charCodeAt(0) & 0xff);
        const inflated = await inflateZlib(bytes);
        if (inflated) chunks.push(...collectPdfText(bytesToBinaryString(inflated)));
      } catch (e) {
        // Continue scanning other streams; PDFs may contain non-text streams.
      }
    }
    return Array.from(new Set(chunks)).join('\n');
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DOCX deflate decompression is not supported in this browser.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function getUint16(view, offset) {
    return view.getUint16(offset, true);
  }

  function getUint32(view, offset) {
    return view.getUint32(offset, true);
  }

  function findEndOfCentralDirectory(view) {
    const minimumOffset = Math.max(0, view.byteLength - 65557);
    for (let offset = view.byteLength - 22; offset >= minimumOffset; offset--) {
      if (getUint32(view, offset) === 0x06054b50) return offset;
    }
    throw new Error('Invalid DOCX ZIP: central directory not found.');
  }

  async function readZipEntry(buffer, wantedName) {
    const view = new DataView(buffer);
    const eocdOffset = findEndOfCentralDirectory(view);
    const entryCount = getUint16(view, eocdOffset + 10);
    let offset = getUint32(view, eocdOffset + 16);

    for (let entry = 0; entry < entryCount; entry++) {
      if (offset + 46 > buffer.byteLength || getUint32(view, offset) !== 0x02014b50) {
        throw new Error('Invalid DOCX ZIP: malformed central directory.');
      }

      const compression = getUint16(view, offset + 10);
      const compressedSize = getUint32(view, offset + 20);
      const fileNameLength = getUint16(view, offset + 28);
      const extraLength = getUint16(view, offset + 30);
      const commentLength = getUint16(view, offset + 32);
      const localHeaderOffset = getUint32(view, offset + 42);
      const nameStart = offset + 46;
      const nameEnd = nameStart + fileNameLength;
      const fileName = decodeBytes(new Uint8Array(buffer.slice(nameStart, nameEnd)));

      if (fileName === wantedName) {
        if (localHeaderOffset + 30 > buffer.byteLength || getUint32(view, localHeaderOffset) !== 0x04034b50) {
          throw new Error('Invalid DOCX ZIP: local file header not found.');
        }
        const localNameLength = getUint16(view, localHeaderOffset + 26);
        const localExtraLength = getUint16(view, localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > buffer.byteLength) throw new Error('Invalid DOCX ZIP: truncated document data.');
        const bytes = new Uint8Array(buffer.slice(dataStart, dataEnd));
        if (compression === 0) return bytes;
        if (compression === 8) return inflateRaw(bytes);
        throw new Error(`Unsupported DOCX compression method: ${compression}`);
      }

      offset = nameEnd + extraLength + commentLength;
    }
    throw new Error(`${wantedName} not found in DOCX.`);
  }

  function xmlToText(xml) {
    return xml
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:br\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim();
  }

  async function extractDocxText(buffer) {
    const bytes = await readZipEntry(buffer, 'word/document.xml');
    return xmlToText(decodeBytes(bytes));
  }

  async function extractText(file) {
    if (!file || file.size > MAX_FILE_BYTES) {
      throw new Error('File is too large for local demo scanning.');
    }
    const kind = fileKind(file);
    if (!kind) throw new Error('Unsupported attachment type.');
    const buffer = await file.arrayBuffer();
    if (kind === 'PDF') return extractPdfText(buffer);
    return extractDocxText(buffer);
  }

  async function scanFile(file) {
    const kind = fileKind(file);
    if (!kind) return null;
    const text = await extractText(file);
    const scan = window.ConsentDetector.scan(text);
    return {
      fileName: file.name || 'attachment',
      fileType: kind,
      textLength: text.length,
      scan
    };
  }

  async function scanFiles(files) {
    const supported = Array.from(files || []).filter(fileKind);
    const results = [];
    for (const file of supported) {
      try {
        results.push(await scanFile(file));
      } catch (err) {
        results.push({
          fileName: file.name || 'attachment',
          fileType: fileKind(file) || 'UNKNOWN',
          error: err && (err.message || String(err)),
          scan: { entities: [], riskScore: 0, riskLevel: 'LOW', consentStatus: 'UNKNOWN' }
        });
      }
    }
    return results.filter(Boolean);
  }

  window.CAFAttachmentScanner = { scanFiles, extractPdfText, extractDocxText };
})();
