export { Playground } from './playground'
export type { PlaygroundProps } from './playground'

// 收银台会话创建 demo 组件：填写表单 → 创建 Checkout Session → 跳转 pay.stableops.dev。
export { Checkout } from './checkout'
export type { CheckoutProps } from './checkout'

// 浏览器侧确定性派生并导入 sandbox burner 收款地址（供文档 demo 复用，避免重复实现派生逻辑）。
export { importSandboxAddress, demoSandboxAddressForChain } from './sandbox-address'
export type { ImportSandboxAddressInput } from './sandbox-address'
