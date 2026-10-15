import { afterEach, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { locale } from '../src/i18n';
enableAutoUnmount(afterEach);
afterEach(() => { locale.value = 'en'; localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });
