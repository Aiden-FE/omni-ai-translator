// Vue SFC type shim
// WXT 0.19 / vue-tsc 在不引入 shims 时,import App.vue 这种带 <script setup> 的 SFC 会报
// "Cannot find module './App.vue' or its corresponding type declarations"。
// wxt 生成的 .wxt/tsconfig.json 用 vite-builder-env 隐式提供,但本仓库手写 tsconfig 走的是
// extends 链,需要显式 shim 兜底。

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
