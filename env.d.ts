// Vite CSS 字符串导入:content.css 以 ?inline 取字符串注入浮层 iframe 文档,
// 实现浮层样式与宿主页面完全隔离(iframe 独立文档,宿主 CSS 无法穿透)。
declare module '*.css?inline' {
  const css: string;
  export default css;
}
