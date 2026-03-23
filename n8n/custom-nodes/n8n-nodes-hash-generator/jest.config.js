/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/nodes/**/*.ts',
    '!src/nodes/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches:   90,
      functions:  95,
      lines:      95,
      statements: 95,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
};
