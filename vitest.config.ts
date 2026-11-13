import { defineConfig } from 'vitest/config';

// 도메인 로직 테스트는 DOM 없이 node 환경에서 실행
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
