/**
 * Tests for logger.ts
 *
 * Covers: debug mode toggle, prefix, log levels.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log } from '@/src/utils/logger';

describe('Logger', () => {
    const consoleSpy = {
        log: vi.spyOn(console, 'log').mockImplementation(() => { }),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => { }),
        error: vi.spyOn(console, 'error').mockImplementation(() => { }),
    };

    beforeEach(() => {
        consoleSpy.log.mockClear();
        consoleSpy.warn.mockClear();
        consoleSpy.error.mockClear();
        localStorage.removeItem('talentscout_debug');
    });

    afterEach(() => {
        localStorage.removeItem('talentscout_debug');
    });

    // ── log.info ──

    it('log.info does NOT log when debug mode is off', () => {
        log.info('test message');
        expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('log.info DOES log when talentscout_debug=true', () => {
        localStorage.setItem('talentscout_debug', 'true');
        log.info('test message');
        expect(consoleSpy.log).toHaveBeenCalledWith('[TalentScout]', 'test message');
    });

    it('log.info passes multiple arguments in debug mode', () => {
        localStorage.setItem('talentscout_debug', 'true');
        log.info('a', 'b', 123);
        expect(consoleSpy.log).toHaveBeenCalledWith('[TalentScout]', 'a', 'b', 123);
    });

    // ── log.warn ──

    it('log.warn always logs with prefix', () => {
        log.warn('warning message');
        expect(consoleSpy.warn).toHaveBeenCalledWith('[TalentScout]', 'warning message');
    });

    it('log.warn logs even when debug is off', () => {
        localStorage.removeItem('talentscout_debug');
        log.warn('test');
        expect(consoleSpy.warn).toHaveBeenCalled();
    });

    // ── log.error ──

    it('log.error always logs with prefix', () => {
        log.error('error message');
        expect(consoleSpy.error).toHaveBeenCalledWith('[TalentScout]', 'error message');
    });

    it('log.error logs even when debug is off', () => {
        localStorage.removeItem('talentscout_debug');
        log.error('test');
        expect(consoleSpy.error).toHaveBeenCalled();
    });

    // ── Edge cases ──

    it('log.info does not log when talentscout_debug is "false"', () => {
        localStorage.setItem('talentscout_debug', 'false');
        log.info('should not appear');
        expect(consoleSpy.log).not.toHaveBeenCalled();
    });
});
