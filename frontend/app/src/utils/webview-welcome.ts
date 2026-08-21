// Página local de bienvenida para los webviews (navegador y vista en vivo):
// un about:blank se ve blanco y un webview sin URL puede quedar en negro.
// El mensaje se escapa como texto plano (nunca HTML) dentro del body.
export const welcomePageUrl = (message: string) =>
  `data:text/html;charset=utf-8,${encodeURIComponent(
    `<html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0c0c10;color:#8b8b93;font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;text-align:center;padding:24px;box-sizing:border-box;overflow:hidden;">${message}</body></html>`,
  )}`
