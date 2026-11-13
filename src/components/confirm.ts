/** 되돌리기 어려운 작업 전에 확인을 받는다 */
export const ask = (message: string): boolean => window.confirm(message);
