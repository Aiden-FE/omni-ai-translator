// Vite CSS 字符串导入：content.css 以 ?inline 形式取为字符串注入 Shadow DOM，
// 不走全局 side-effect 注入，实现浮层样式与宿主页面隔离。
declare module '*.css?inline' {
  const css: string;
  export default css;
}
