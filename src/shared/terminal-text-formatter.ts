/**
 * Shared utility for formatting terminal text with style markup
 * Used by both client and server for consistent text representation
 */

export interface BufferCell {
  char: string;
  width: number;
  fg?: number;
  bg?: number;
  attributes?: number;
}

/**
 * Format style attributes for a cell into a string
 */
export function formatCellStyle(cell: BufferCell): string {
  const attrs: string[] = [];

  // Foreground color
  if (cell.fg !== undefined) {
    if (cell.fg >= 0 && cell.fg <= 255) {
      attrs.push(`fg="${cell.fg}"`);
    } else {
      const r = (cell.fg >> 16) & 0xff;
      const g = (cell.fg >> 8) & 0xff;
      const b = cell.fg & 0xff;
      attrs.push(`fg="${r},${g},${b}"`);
    }
  }

  // Background color
  if (cell.bg !== undefined) {
    if (cell.bg >= 0 && cell.bg <= 255) {
      attrs.push(`bg="${cell.bg}"`);
    } else {
      const r = (cell.bg >> 16) & 0xff;
      const g = (cell.bg >> 8) & 0xff;
      const b = cell.bg & 0xff;
      attrs.push(`bg="${r},${g},${b}"`);
    }
  }

  // Text attributes
  if (cell.attributes) {
    if (cell.attributes & 0x01) attrs.push('bold');
    if (cell.attributes & 0x02) attrs.push('dim');
    if (cell.attributes & 0x04) attrs.push('italic');
    if (cell.attributes & 0x08) attrs.push('underline');
    if (cell.attributes & 0x10) attrs.push('inverse');
    if (cell.attributes & 0x20) attrs.push('invisible');
    if (cell.attributes & 0x40) attrs.push('strikethrough');
  }

  return attrs.join(' ');
}

/**
 * Convert buffer cells to text with optional style markup
 */
export function cellsToText(cells: BufferCell[][], includeStyles = true): string {
  const lines: string[] = [];

  for (const row of cells) {
    let line = '';

    if (includeStyles) {
      let currentStyle = '';
      let currentText = '';

      const flushStyleGroup = () => {
        if (currentText) {
          if (currentStyle) {
            line += `[style ${currentStyle}]${currentText}[/style]`;
          } else {
            line += currentText;
          }
          currentText = '';
        }
      };

      for (const cell of row) {
        const style = formatCellStyle(cell);

        if (style !== currentStyle) {
          flushStyleGroup();
          currentStyle = style;
        }

        currentText += cell.char;
      }

      flushStyleGroup();
    } else {
      // Plain text without styles
      for (const cell of row) {
        line += cell.char;
      }
    }

    // Trim trailing spaces but preserve empty lines
    lines.push(line.trimEnd());
  }

  return lines.join('\n');
}
