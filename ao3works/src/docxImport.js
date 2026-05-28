/**
 * Lazy-loaded IIFE bundle: Word .docx → HTML via Mammoth.
 * Loaded on demand from script.js so the main editor bundle stays smaller.
 */
import mammoth from 'mammoth';

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<{ value: string, messages: string[] }>}
 */
window.ao3worksConvertDocxArrayBufferToHtml = function (arrayBuffer) {
  return mammoth.convertToHtml({ arrayBuffer });
};
