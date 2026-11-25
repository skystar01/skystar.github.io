// 全局兼容层类型声明（供 checkJs 类型检查使用）
interface Window {
  SkyStorage?: unknown;
  aiTrace?: unknown;
  aiLab?: {
    get(game: string, key: string, fallback: number): number;
  };
  reversiGame?: unknown;
  registerGame?: (name: string, api: unknown) => void;
}
