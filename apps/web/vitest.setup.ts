import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Allow client component tests to transitively import server modules that guard with server-only.
vi.mock('server-only', () => ({}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
