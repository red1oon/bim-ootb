"""Generates psdWriter16.js from the stock ag-psd psdWriter.js (MIT, https://github.com/Agamnentzar/ag-psd) with a minimal 16-bit-writing patch.
Every replacement is asserted, so a different ag-psd version fails loudly instead of producing a silently different writer. Usage: python3 make_patch.py"""
import re, os, subprocess, sys
src = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'node_modules', 'ag-psd', 'dist', 'psdWriter.js')
s = open(src).read(); orig = s
def sub(old, new, count=1):
    global s
    assert s.count(old) >= 1, 'patch anchor not found: ' + old[:70]
    s = s.replace(old, new, count)
sub('const helpers_1 = require("./helpers");', 'const _AG = require("path").dirname(require.resolve("ag-psd"));\nconst helpers_1 = require(_AG + "/helpers");\n// ---- 16-bit patch helpers (raw, uncompressed, big-endian 16-bit samples)\nfunction writeDataRaw16(imageData, offset) { const n = imageData.width * imageData.height, out = new Uint8Array(n * 2), d = imageData.data; for (let i = 0; i < n; i++) { const v = d[i * 4 + offset]; out[2 * i] = v >> 8; out[2 * i + 1] = v & 255; } return out; }\nfunction hasAlphaAny(imageData) { if (!(imageData.data instanceof Uint16Array)) return helpers_1.hasAlpha(imageData); const size = imageData.width * imageData.height * 4; for (let i = 3; i < size; i += 4) if (imageData.data[i] !== 65535) return true; return false; }')
sub('require("./additionalInfo")', 'require(_AG + "/additionalInfo")'); sub('require("./imageResources")', 'require(_AG + "/imageResources")')
# depth check and verifyBitCount
sub("function verifyBitCount(target) {\n    var _a;\n    (_a = target.children) === null || _a === void 0 ? void 0 : _a.forEach(verifyBitCount);", "function verifyBitCount(target, bits16) {\n    var _a;\n    (_a = target.children) === null || _a === void 0 ? void 0 : _a.forEach((c) => verifyBitCount(c, bits16));")
sub("if (data && (data.data instanceof Uint32Array || data.data instanceof Uint16Array)) {\n        throw new Error('imageData has incorrect bitDepth');", "if (data && (data.data instanceof Uint32Array || (data.data instanceof Uint16Array) !== !!bits16)) {\n        throw new Error('imageData has incorrect bitDepth');")
sub("if (data && (data.data instanceof Uint32Array || data.data instanceof Uint16Array)) {\n            throw new Error('mask imageData has incorrect bitDepth');", "if (data && (data.data instanceof Uint32Array || (data.data instanceof Uint16Array) !== !!bits16)) {\n            throw new Error('mask imageData has incorrect bitDepth');")
sub("if (bitsPerChannel !== 8)\n        throw new Error('bitsPerChannel other than 8 are not supported for writing');\n    verifyBitCount(psd);", "if (bitsPerChannel !== 8 && bitsPerChannel !== 16)\n        throw new Error('bitsPerChannel other than 8 and 16 are not supported for writing');\n    verifyBitCount(psd, bitsPerChannel === 16);")
sub("const globalAlpha = !!imageData && (0, helpers_1.hasAlpha)(imageData);", "const globalAlpha = bitsPerChannel === 8 && !!imageData && (0, helpers_1.hasAlpha)(imageData);   // 16-bit: merged image is written as RGB (no global alpha channel)")
# merged image
sub("writeUint16(writer, 1 /* Compression.RleCompressed */); // Photoshop doesn't support zip compression of composite image data", "writeUint16(writer, bitsPerChannel === 16 ? 0 : 1 /* Compression.RleCompressed */); // Photoshop doesn't support zip compression of composite image data (16-bit patch: raw)")
sub("    else {\n        if (imageData)\n            data.data.set(new Uint8Array(imageData.data.buffer", "    else if (bitsPerChannel === 16) {\n        const zero = { width, height, data: new Uint16Array(width * height * 4) }, src = imageData || zero;\n        for (const c of channels) writeBytes(writer, writeDataRaw16(src, c));\n    }\n    else {\n        if (imageData)\n            data.data.set(new Uint8Array(imageData.data.buffer")
# layer channels
sub("(0, helpers_1.hasAlpha)(imageData) || (helpers_1.RAW_IMAGE_DATA && ((_a = layer.imageDataRaw)", "hasAlphaAny(imageData) || (helpers_1.RAW_IMAGE_DATA && ((_a = layer.imageDataRaw)")
sub("        else if (options.compress) {\n            data = (0, helpers_1.writeDataZipWithoutPrediction)(imageData, [offset]);", "        else if (imageData.data instanceof Uint16Array) {\n            data = writeDataRaw16(imageData, offset);\n            compression = 0 /* Compression.RawData */;\n        }\n        else if (options.compress) {\n            data = (0, helpers_1.writeDataZipWithoutPrediction)(imageData, [offset]);")
# mask channels
sub("    else if (options.compress) {\n        buffer = (0, helpers_1.writeDataZipWithoutPrediction)(imageData, [0]);", "    else if (imageData.data instanceof Uint16Array) {\n        buffer = writeDataRaw16(imageData, 0);\n        compression = 0 /* Compression.RawData */;\n    }\n    else if (options.compress) {\n        buffer = (0, helpers_1.writeDataZipWithoutPrediction)(imageData, [0]);")
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'psdWriter16.js'); open(out, 'w').write('// GENERATED by make_patch.py from ag-psd dist/psdWriter.js (MIT). Do not edit by hand; see PATCH.diff.\n' + s)
open(os.path.join(os.path.dirname(out), 'psdWriter.orig.js'), 'w').write(orig)
d = subprocess.run(['diff', '-u', os.path.join(os.path.dirname(out), 'psdWriter.orig.js'), out], capture_output=True, text=True).stdout; open(os.path.join(os.path.dirname(out), 'PATCH.diff'), 'w').write(d); print('wrote psdWriter16.js and PATCH.diff', len(d.splitlines()), 'diff lines')
