import { describe, expect, it } from 'vitest';
import {
  calculatePruningPositionInFile,
  calculateSequenceBytePosition,
  checkAsciinemaEventForPruning,
  containsPruningSequence,
  detectLastPruningSequence,
  findLastPrunePoint,
  getSequenceDescription,
  PRUNE_SEQUENCES,
} from '../../server/utils/pruning-detector';

describe('Pruning Detector', () => {
  describe('detectLastPruningSequence', () => {
    it('should detect the last pruning sequence in data', () => {
      const data = 'some text\x1b[2Jmore text\x1b[3Jfinal text';
      const result = detectLastPruningSequence(data);

      expect(result).not.toBeNull();
      expect(result?.sequence).toBe('\x1b[3J');
      expect(result?.index).toBe(data.lastIndexOf('\x1b[3J'));
    });

    it('should return null if no pruning sequence found', () => {
      const data = 'just normal text without escape sequences';
      const result = detectLastPruningSequence(data);
      expect(result).toBeNull();
    });

    it('should find the last sequence when multiple exist', () => {
      const data = '\x1b[2J\x1b[3J\x1bc\x1b[?1049h';
      const result = detectLastPruningSequence(data);
      expect(result?.sequence).toBe('\x1b[?1049h');
    });
  });

  describe('containsPruningSequence', () => {
    it('should return true if data contains any pruning sequence', () => {
      expect(containsPruningSequence('text\x1b[3Jmore')).toBe(true);
      expect(containsPruningSequence('text\x1bcmore')).toBe(true);
      expect(containsPruningSequence('text\x1b[?1049hmore')).toBe(true);
    });

    it('should return false if no pruning sequences', () => {
      expect(containsPruningSequence('normal text')).toBe(false);
      expect(containsPruningSequence('text with \x1b[31m color')).toBe(false);
    });
  });

  describe('findLastPrunePoint', () => {
    it('should return position after the sequence', () => {
      const data = 'before\x1b[3Jafter';
      const result = findLastPrunePoint(data);

      expect(result).not.toBeNull();
      expect(result?.sequence).toBe('\x1b[3J');
      expect(result?.position).toBe(data.indexOf('after'));
    });
  });

  describe('checkAsciinemaEventForPruning', () => {
    it('should detect pruning in valid output event', () => {
      const line = JSON.stringify([1.234, 'o', 'text\x1b[3Jmore']);
      const result = checkAsciinemaEventForPruning(line);

      expect(result).not.toBeNull();
      expect(result?.sequence).toBe('\x1b[3J');
      expect(result?.dataIndex).toBe(4); // position in the data string
      expect(result?.timestamp).toBe(1.234);
      expect(result?.eventType).toBe('o');
    });

    it('should return null for non-output events', () => {
      const inputEvent = JSON.stringify([1.234, 'i', 'user input']);
      expect(checkAsciinemaEventForPruning(inputEvent)).toBeNull();

      const resizeEvent = JSON.stringify([1.234, 'r', '80x24']);
      expect(checkAsciinemaEventForPruning(resizeEvent)).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      expect(checkAsciinemaEventForPruning('not json')).toBeNull();
    });
  });

  describe('calculateSequenceBytePosition', () => {
    it('should calculate correct byte position for ASCII data', () => {
      const eventStartPos = 100;
      const timestamp = 1.5;
      const fullData = 'hello\x1b[3Jworld';
      const sequenceIndex = fullData.indexOf('\x1b[3J');
      const sequenceLength = 4; // \x1b[3J

      const position = calculateSequenceBytePosition(
        eventStartPos,
        timestamp,
        fullData,
        sequenceIndex,
        sequenceLength
      );

      // The prefix [1.5,"o"," is 11 bytes (need to count the opening quote)
      // Data up to sequence end is "hello\x1b[3J" which is 9 bytes
      expect(position).toBe(eventStartPos + 11 + 9);
    });

    it('should handle UTF-8 multi-byte characters correctly', () => {
      const eventStartPos = 200;
      const timestamp = 2.0;
      const fullData = '世界\x1b[3J'; // 世界 is 6 bytes in UTF-8
      const sequenceIndex = 2; // character index after 世界
      const sequenceLength = 4;

      const position = calculateSequenceBytePosition(
        eventStartPos,
        timestamp,
        fullData,
        sequenceIndex,
        sequenceLength
      );

      // Prefix [2,"o"," is 9 bytes (with opening quote)
      // Data "世界\x1b[3J" is 10 bytes total
      expect(position).toBe(eventStartPos + 9 + 10);
    });
  });

  describe('calculatePruningPositionInFile', () => {
    it('should calculate position within a file line', () => {
      const eventLine = JSON.stringify([1.5, 'o', 'text\x1b[3Jmore']);
      const fileOffset = 500; // end of this line in file
      const sequenceEndIndex = 9; // after \x1b[3J in "text\x1b[3Jmore"

      const position = calculatePruningPositionInFile(fileOffset, eventLine, sequenceEndIndex);

      // Should calculate position within the line
      expect(position).toBeLessThan(fileOffset);
      expect(position).toBeGreaterThan(fileOffset - eventLine.length);
    });
  });

  describe('getSequenceDescription', () => {
    it('should return correct descriptions for known sequences', () => {
      expect(getSequenceDescription('\x1b[3J')).toBe('Clear scrollback buffer');
      expect(getSequenceDescription('\x1bc')).toBe('Terminal reset (RIS)');
      expect(getSequenceDescription('\x1b[2J')).toBe('Clear screen');
      expect(getSequenceDescription('\x1b[?1049h')).toBe('Enter alternate screen');
      expect(getSequenceDescription('\x1b[?1049l')).toBe('Exit alternate screen');
    });

    it('should return unknown for unrecognized sequences', () => {
      expect(getSequenceDescription('\x1b[99X')).toBe('Unknown sequence');
    });
  });

  describe('PRUNE_SEQUENCES constant', () => {
    it('should contain all expected sequences', () => {
      expect(PRUNE_SEQUENCES).toContain('\x1b[3J');
      expect(PRUNE_SEQUENCES).toContain('\x1bc');
      expect(PRUNE_SEQUENCES).toContain('\x1b[2J');
      expect(PRUNE_SEQUENCES).toContain('\x1b[?1049h');
      expect(PRUNE_SEQUENCES).toContain('\x1b[?1049l');
      expect(PRUNE_SEQUENCES.length).toBeGreaterThanOrEqual(9);
    });
  });
});
