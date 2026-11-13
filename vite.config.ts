import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : GitHub Pages 등 하위 경로 배포에서도 동작하도록 상대 경로 사용
export default defineConfig({
  base: './',
  plugins: [react()],
});
