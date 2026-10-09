// 16-bit capable PSD writer: stock ag-psd everywhere, except the patched psdWriter (see make_patch.py / PATCH.diff). 8-bit output is expected to be byte-identical to stock ag-psd.
const stock = require('ag-psd/dist/psdWriter'), patched = require('./psdWriter16.js');
function writePsd(psd, options) { const writer = stock.createWriter(); patched.writePsd(writer, psd, options); return stock.getWriterBuffer(writer); }
module.exports = { writePsd };
