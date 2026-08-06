/* ============================================================
   Tiancode — Website script (JS vanilla, sin dependencias)
   - Idioma ES/EN con localStorage y atributos data-i18n
   - Tema claro/oscuro con CSS custom properties
   - Loader con spinner SVG
   - Animaciones de entrada con IntersectionObserver
   - Gráficas animadas en canvas (barras + donut)
   - Contadores animados y partículas en el hero
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 1. Traducciones (ES / EN) ---------- */
  const I18N = {
    es: {
      'page.title': 'Tiancode — Asistente de IA para programar en Windows',
      'page.description': 'Tiancode es la app de escritorio con IA para programar: agentes, skills de ingeniería y modelos locales GGUF, todo en tu terminal.',
      'loader.text': 'Cargando Tiancode…',
      'nav.features': 'Características',
      'nav.how': 'Cómo funciona',
      'nav.stats': 'Estadísticas',
      'nav.skills': 'Skills',
      'nav.download': 'Descargar',
      'theme.aria': 'Cambiar tema claro/oscuro',
      'lang.aria': 'Cambiar idioma',
      'nav.aria': 'Abrir menú de navegación',
      'hero.badge': 'Nuevo · v1.0.0 disponible',
      'hero.tagline': 'Tu asistente de IA para programar, directo en tu terminal.',
      'hero.sub': 'Agentes de IA, 24+ skills de ingeniería de software y modelos locales GGUF — una app de escritorio rápida y enfocada para Windows.',
      'hero.ctaDownload': 'Descargar para Windows',
      'hero.ctaFeatures': 'Ver características',
      'hero.note': 'Instalador y versión portable · Windows 10 y 11',
      'features.title': 'Todo lo que necesitas para programar con IA',
      'features.sub': 'Una app de escritorio compacta y potente, diseñada para el flujo de trabajo real de desarrolladores.',
      'f.agents.title': 'Agentes de IA',
      'f.agents.desc': 'Chat de programación con múltiples agentes y sub-agentes que colaboran, codean y depuran contigo.',
      'f.models.title': 'Modelos locales GGUF',
      'f.models.desc': 'Descarga y ejecuta modelos de IA locales desde HuggingFace, al estilo LM Studio. Sin nube, sin límites.',
      'f.skills.title': '24+ skills de ingeniería',
      'f.skills.desc': 'Interviews de requisitos, TDD, code review, seguridad, performance y CI/CD listos para usar.',
      'f.providers.title': 'Multi-proveedor',
      'f.providers.desc': 'Conecta OpenAI, Anthropic y otros proveedores — o combínalos con modelos locales.',
      'f.terminal.title': 'Terminal integrada',
      'f.terminal.desc': 'Ejecuta comandos, aplica cambios y ve resultados sin salir de la conversación.',
      'f.portable.title': 'Modo portable',
      'f.portable.desc': 'Lleva Tiancode en un USB: sin instalación, configurado y listo en cualquier PC Windows.',
      'f.more.title': 'Y mucho más',
      'f.more.desc': 'Atajos de teclado personalizables, tema claro y oscuro, autocompletado y ajustes finos para cada skill.',
      'mock.line1': '$ tiancode --agent senior-dev',
      'mock.line2': '▸ Analizando repositorio… 12.400 archivos en 3.2s',
      'mock.line3': '▸ Detectadas 2 vulnerabilidades en auth.js',
      'mock.line4': '▸ Fix aplicado · tests TDD en verde ✓',
      'how.title': 'Cómo funciona',
      'how.sub': 'De cero a tu primer agente en menos de cinco minutos.',
      's1.title': 'Descarga e instala',
      's1.desc': 'Consigue el instalador o la versión portable para Windows 10 y 11.',
      's2.title': 'Elige tu modelo',
      's2.desc': 'Conecta tu proveedor de IA favorito o descarga un modelo local GGUF.',
      's3.title': 'Programa con agentes',
      's3.desc': 'Conversa con tus agentes: analizan, escriben y revisan código por ti.',
      's4.title': 'Ajusta y escala',
      's4.desc': 'Activa skills, crea sub-agentes personalizados y define tus atajos.',
      'stats.title': 'Cifras que importan',
      'stats.sub': 'La comunidad de Tiancode crece rápido. Datos ilustrativos.',
      'stats.c1': 'Descargas',
      'stats.c2': 'Modelos GGUF compatibles',
      'stats.c3': 'Skills de ingeniería',
      'stats.c4': 'Países',
      'stats.chartBars': 'Descargas mensuales (miles)',
      'stats.chartDonut': 'Uso por proveedor de IA',
      'stats.donutCenter': '12.4k',
      'stats.donutCenterLabel': 'usuarios activos',
      'skills.title': 'Skills destacadas',
      'skills.sub': 'Un catálogo creciente de skills de ingeniería, activables una a una.',
      'sk.1': 'Entrevistas de requisitos',
      'sk.2': 'Test-Driven Development (TDD)',
      'sk.3': 'Code Review',
      'sk.4': 'Auditoría de seguridad',
      'sk.5': 'Optimización de rendimiento',
      'sk.6': 'Pipelines CI/CD',
      'sk.7': 'Refactorización',
      'sk.8': 'Depuración asistida',
      'sk.9': 'Documentación técnica',
      'sk.10': 'Diseño de arquitectura',
      'sk.11': 'Análisis de código estático',
      'sk.12': 'Migración de proyectos',
      'cta.title': 'Empieza a programar con IA hoy',
      'cta.sub': 'Gratis para uso personal. Rápido de instalar, fácil de configurar.',
      'cta.button': 'Descargar Tiancode',
      'cta.note': 'Windows 10 y 11 · 64 bits · ~120 MB',
      'footer.tagline': 'El asistente de IA para programar, hecho para Windows.',
      'footer.product': 'Producto',
      'footer.resources': 'Recursos',
      'footer.legal': 'Legal',
      'footer.l1': 'Descargar',
      'footer.l2': 'Novedades',
      'footer.l3': 'Modo portable',
      'footer.l4': 'Documentación',
      'footer.l5': 'Guía de inicio',
      'footer.l6': 'Preguntas frecuentes',
      'footer.l7': 'Privacidad',
      'footer.l8': 'Términos',
      'footer.l9': 'Licencia',
      'footer.rights': '© 2026 Tiancode. Todos los derechos reservados.',

      /* --- Navegación: menú desplegable --- */
      'nav.more': 'Recursos',
      'nav.dropdownAria': 'Abrir menú de recursos',
      'nav.m1': 'Guía de inicio',
      'nav.m2': 'Documentación',
      'nav.m3': 'Preguntas frecuentes',
      'nav.m4': 'Novedades',
      'nav.m5': 'Modo portable',
      'nav.m6': 'Descarga',
      'nav.m7': 'Licencia',
      'nav.m8': 'Términos',
      'nav.m9': 'Privacidad',

      /* --- Páginas internas: comunes --- */
      'page.back': 'Volver al inicio',
      'legal.eyebrow': 'Legal',

      /* --- Licencia --- */
      'lic.title': 'Licencia MIT',
      'lic.sub': 'Tiancode es software libre: puedes usarlo, modificarlo y distribuirlo libremente bajo los términos de la Licencia MIT.',
      'lic.sumTitle': 'Resumen en palabras simples',
      'lic.sum1': 'Uso libre, personal y comercial, sin costes ni licencias adicionales.',
      'lic.sum2': 'Puedes modificar el código fuente y crear tus propias versiones.',
      'lic.sum3': 'Puedes redistribuir copias, con la condición de incluir el aviso de copyright.',
      'lic.sum4': 'El software se entrega «tal cual», sin garantía de ningún tipo.',
      'lic.copyTitle': 'Aviso de copyright',
      'lic.codeTitle': 'Texto completo de la licencia',
      'lic.note': 'La licencia MIT se aplica al código de la aplicación Tiancode. Los modelos de IA descargados a través de la app conservan sus propias licencias (normalmente abiertas, como Apache 2.0, MIT o Llama 3).',

      /* --- Términos de uso --- */
      'terms.title': 'Términos de uso',
      'terms.sub': 'Los términos que rigen el uso de Tiancode. Al descargar o utilizar la aplicación aceptas estas condiciones.',
      'terms.updated': 'Última actualización: 6 de agosto de 2026',
      'terms.s1t': '1. Aceptación de los términos',
      'terms.s1p': 'Al descargar, instalar o utilizar Tiancode (la «aplicación») aceptas estos Términos de uso. Si no estás de acuerdo con ellos, no utilices la aplicación.',
      'terms.s2t': '2. Uso del software',
      'terms.s2p': 'Tiancode está pensado para desarrolladores y personas que escriben código. Puedes usarlo con fines personales y profesionales. Te comprometes a no utilizarlo para actividades ilegales, dañinas o que infrinjan derechos de terceros.',
      'terms.s3t': '3. Uso responsable de la IA',
      'terms.s3p1': 'Los agentes de Tiancode generan código y texto mediante modelos de inteligencia artificial. Los resultados pueden contener errores, vulnerabilidades de seguridad o código incorrecto. Eres responsable de revisar, probar y validar cualquier código generado antes de usarlo en producción.',
      'terms.s3p2': 'No utilices la aplicación para generar contenido ilegal, malicioso o que pueda causar daño, y no confíes ciegamente en las respuestas de la IA: verifica siempre lo que produce.',
      'terms.s4t': '4. Propiedad del código generado',
      'terms.s4p': 'El código, el texto y las demás salidas que generes con Tiancode te pertenecen. Puedes usarlos, licenciarlos o publicarlos libremente, incluso en proyectos comerciales. Tiancode no reivindica ninguna propiedad sobre tus resultados.',
      'terms.s5t': '5. Proveedores de terceros',
      'terms.s5p': 'Cuando conectas proveedores de IA en la nube (OpenAI, Anthropic, etc.), tu uso se rige también por los términos y políticas de esos proveedores. Tiancode actúa como cliente de sus APIs y tus claves se guardan únicamente en tu equipo.',
      'terms.s6t': '6. Sin garantías',
      'terms.s6p': 'La aplicación se proporciona «tal cual», sin garantías de ningún tipo, expresas o implícitas, incluyendo disponibilidad, idoneidad para un fin o ausencia de errores.',
      'terms.s7t': '7. Limitación de responsabilidad',
      'terms.s7p': 'En la máxima medida permitida por la ley, Tiancode no será responsable de daños directos, indirectos, incidentales o consecuentes derivados del uso de la aplicación, incluyendo pérdida de datos, pérdida de beneficios o fallos producidos por código generado con ella.',
      'terms.s8t': '8. Cambios en estos términos',
      'terms.s8p': 'Podemos actualizar estos términos ocasionalmente. La versión vigente se publica siempre en esta página con su fecha de actualización.',
      'terms.s9t': '9. Contacto',
      'terms.s9p': 'Si tienes preguntas sobre estos términos, escríbenos a legal@tiancode.dev.',

      /* --- Política de privacidad --- */
      'priv.title': 'Política de privacidad',
      'priv.sub': 'Tiancode está diseñado con la privacidad por delante: por defecto, tus datos y tu código se procesan en tu propia máquina.',
      'priv.updated': 'Última actualización: 6 de agosto de 2026',
      'priv.s1t': '1. Procesamiento local',
      'priv.s1p': 'Tiancode es una aplicación de escritorio. Tus conversaciones, tu código y tu configuración se almacenan y procesan localmente en tu equipo. No mantenemos servidores que reciban tu actividad.',
      'priv.s2t': '2. Modelos locales',
      'priv.s2p': 'Si usas modelos locales GGUF, la inferencia se ejecuta íntegramente en tu máquina. Ni tus mensajes ni los resultados salen de tu equipo: cero envíos de datos.',
      'priv.s3t': '3. Proveedores en la nube',
      'priv.s3p': 'Si decides conectar un proveedor en la nube (OpenAI, Anthropic u otros), tus mensajes se envían a ese proveedor para obtener respuestas, conforme a sus propias políticas de privacidad. La elección es siempre tuya y puedes volver a modelos locales en cualquier momento. Tu clave API se guarda solo en tu equipo.',
      'priv.s4t': '4. Telemetría opcional',
      'priv.s4p': 'La aplicación puede enviar estadísticas de uso anónimas (versión, sistema operativo, funciones utilizadas) para ayudarnos a mejorar el producto. La telemetría está desactivada por defecto y solo se activa si tú la habilitas en la configuración. Nunca incluye el contenido de tus conversaciones ni de tu código.',
      'priv.s5t': '5. No vendemos datos',
      'priv.s5p': 'No vendemos, alquilamos ni compartimos tus datos personales con terceros. Tiancode no tiene un modelo de negocio basado en tus datos: es un producto de software.',
      'priv.s6t': '6. Dónde se guarda la información',
      'priv.s6p': 'Toda la información vive en tu equipo:',
      'priv.s6l1': 'Configuración y claves API:',
      'priv.s6l1b': '(instalador) o la carpeta de la app (portable)',
      'priv.s6l2': 'Modelos locales:',
      'priv.s6l2b': 'dentro del directorio de datos',
      'priv.s6l3': 'Registros y diagnóstico:',
      'priv.s6l3b': 'en la carpeta de datos, solo para resolver incidencias',
      'priv.s7t': '7. Tus derechos',
      'priv.s7p': 'Como todo se guarda en tu equipo, controlar tus datos es directo: desinstala la aplicación o elimina su carpeta de datos para borrarlo todo. También puedes eliminar conversaciones individuales desde la interfaz.',

      /* --- Documentación --- */
      'docs.title': 'Documentación',
      'docs.sub': 'La guía oficial de Tiancode: instalación, agentes, skills, modelos locales, configuración, comandos y solución de problemas.',
      'docs.toc': 'Contenido',
      'docs.t1': 'Instalación',
      'docs.t2': 'Agentes',
      'docs.t3': 'Skills',
      'docs.t4': 'Modelos locales',
      'docs.t5': 'Configuración',
      'docs.t6': 'Comandos',
      'docs.t7': 'Solución de problemas',
      'docs.s1t': '1. Instalación',
      'docs.s1p': 'Tiancode 1.0.0 se distribuye en dos formatos para Windows 10 y 11 (64 bits):',
      'docs.s1l1': 'Instalador NSIS (Tiancode-1.0.0-setup.exe): instalación clásica con asistente, accesos directos y actualizaciones sencillas.',
      'docs.s1l2': 'Versión portable (Tiancode-portable-1.0.0.exe): sin instalación, se ejecuta desde cualquier carpeta o USB.',
      'docs.s1p2': 'Requisitos mínimos: Windows 10 u 11 de 64 bits, 4 GB de RAM y 1 GB de espacio libre. Para modelos locales se recomiendan 8 GB de RAM o más.',
      'docs.s2t': '2. Agentes',
      'docs.s2p': 'Los agentes son asistentes de IA especializados que trabajan en tu proyecto. Puedes tener varios agentes en la misma conversación, delegar tareas a sub-agentes y asignar a cada uno un rol (senior-dev, reviewer, arquitecto…).',
      'docs.s2p2': 'Cada agente mantiene su propio contexto y puede ejecutar comandos en la terminal integrada para verificar su trabajo antes de proponer cambios.',
      'docs.s3t': '3. Skills',
      'docs.s3p': 'Tiancode incluye 24 skills de ingeniería de software listas para usar: entrevistas de requisitos, TDD, code review, auditoría de seguridad, optimización de rendimiento, CI/CD, refactorización, depuración asistida y más.',
      'docs.s3p2': 'Las skills viven en la carpeta de skills integrada. Puedes crear las tuyas propias añadiendo archivos a esa carpeta: cada skill define el flujo de trabajo que sigue el agente.',
      'docs.s4t': '4. Modelos locales',
      'docs.s4p': 'Desde la pestaña Modelos puedes buscar y descargar modelos GGUF directamente desde HuggingFace, al estilo LM Studio:',
      'docs.s4l1': 'Explora el catálogo y elige un modelo, por ejemplo Llama 3.1 8B en cuantización Q4_K_M.',
      'docs.s4l2': 'Descarga el archivo GGUF: la app gestiona el progreso y verifica el espacio en disco.',
      'docs.s4l3': 'Selecciona el modelo local como proveedor activo y empieza a conversar sin conexión.',
      'docs.s4p2': 'La ejecución usa el backend de llama.cpp: funciona en CPU y aprovecha las GPUs NVIDIA o AMD cuando están disponibles.',
      'docs.s5t': '5. Configuración',
      'docs.s5p': 'La configuración está organizada en pestañas: Apariencia (tema claro/oscuro e idioma), Proveedores (claves API y modelos), Agentes (roles por defecto), Skills (activar y ajustar cada skill), Atajos (atajos de teclado personalizables) y Avanzado (telemetría y carpeta de datos).',
      'docs.s6t': '6. Comandos',
      'docs.s6p': 'La CLI de Tiancode expone comandos útiles desde cualquier terminal:',
      'docs.s7t': '7. Solución de problemas',
      'docs.s7l1': 'El modelo local va lento: elige una cuantización menor (Q4 en lugar de Q8) o un modelo más pequeño.',
      'docs.s7l2': 'La descarga de modelos falla: comprueba la conexión y el espacio libre en la carpeta de modelos.',
      'docs.s7l3': 'No conecta con el proveedor: revisa la clave API en Configuración → Proveedores.',
      'docs.s7l4': 'La app no arranca en modo portable: asegúrate de tener permisos de escritura en la carpeta.',
      'docs.s7l5': '¿Sigue el problema? Abre una incidencia adjuntando los logs de la carpeta de datos.',

      /* --- Guía de inicio --- */
      'guide.title': 'Guía de inicio',
      'guide.sub': 'Pon Tiancode en marcha en menos de cinco minutos, paso a paso.',
      'guide.s1t': 'Descarga Tiancode',
      'guide.s1d': 'Elige el instalador NSIS o la versión portable desde la página de descarga. La versión 1.0.0 soporta Windows 10 y 11.',
      'guide.s2t': 'Instala o ejecuta',
      'guide.s2d': 'Con el instalador: sigue el asistente. Con la portable: coloca el ejecutable en una carpeta y ejecútalo — no requiere instalación.',
      'guide.s3t': 'Elige tu proveedor',
      'guide.s3d': 'Añade tu clave de API (OpenAI, Anthropic…) en Configuración → Proveedores, o descarga un modelo local GGUF desde la pestaña Modelos.',
      'guide.s4t': 'Crea tu primer chat',
      'guide.s4d': 'Abre un chat nuevo, selecciona un agente (por ejemplo senior-dev) y haz tu primera petición: analiza tu proyecto, explica un fragmento o escribe una función.',
      'guide.s5t': 'Prueba una skill',
      'guide.s5d': 'Activa una skill como TDD o Code Review en la pestaña Skills y pídela en la conversación: el agente seguirá su flujo de trabajo paso a paso.',
      'guide.s6t': 'Ajusta a tu gusto',
      'guide.s6d': 'Personaliza el tema (claro u oscuro), el idioma, los atajos de teclado y crea tus propios agentes y skills. Todo se guarda localmente.',
      'guide.note': '¿Prefieres los detalles? Consulta la documentación completa o las preguntas frecuentes.',

      /* --- Preguntas frecuentes --- */
      'faq.title': 'Preguntas frecuentes',
      'faq.sub': 'Las dudas más comunes sobre Tiancode, respondidas.',
      'faq.q1': '¿Qué es Tiancode?',
      'faq.a1': 'Tiancode es una aplicación de escritorio para Windows que integra asistentes de IA en tu flujo de programación: chat con agentes, terminal integrada, skills de ingeniería de software y modelos de IA locales.',
      'faq.q2': '¿Es gratis?',
      'faq.a2': 'Sí. Tiancode es gratuito para uso personal y profesional, y su código se distribuye bajo licencia MIT.',
      'faq.q3': '¿Qué hace Tiancode con mi código y mis conversaciones?',
      'faq.a3': 'Nada sin tu permiso. Por defecto, todo se procesa en tu equipo. Solo se envía información al proveedor de IA que elijas explícitamente, y únicamente los mensajes de esa conversación.',
      'faq.q4': '¿Qué son los modelos locales GGUF?',
      'faq.a4': 'Son modelos de IA listos para ejecutarse en tu propia máquina. Tiancode te permite descargarlos desde HuggingFace e instalarlos con un clic, al estilo LM Studio. Con ellos trabajas sin conexión y sin enviar datos a nadie.',
      'faq.q5': '¿Funciona sin internet?',
      'faq.a5': 'Sí, si usas un modelo local GGUF: el chat, los agentes y la terminal funcionan completamente offline. Los proveedores en la nube, lógicamente, requieren conexión.',
      'faq.q6': '¿Dónde se guarda todo?',
      'faq.a6': 'La configuración, las claves y las conversaciones se guardan en tu equipo, en %APPDATA%\\Tiancode con el instalador o en la carpeta de la aplicación en modo portable. Los modelos locales se guardan en la carpeta de modelos.',
      'faq.q7': '¿Puedo crear mis propios agentes y skills?',
      'faq.a7': 'Sí. Puedes definir agentes personalizados con su propio rol y contexto, y añadir skills propias en la carpeta de skills. También puedes compartir y reutilizar plantillas.',
      'faq.q8': '¿Necesito una GPU potente?',
      'faq.a8': 'No. Los modelos locales se ejecutan en CPU gracias al backend de llama.cpp. Si tienes una GPU NVIDIA o AMD, Tiancode la aprovecha automáticamente para ir más rápido.',
      'faq.q9': '¿Puedo usar varios proveedores a la vez?',
      'faq.a9': 'Sí. Tiancode es multi-proveedor: combina modelos en la nube (OpenAI, Anthropic y otros) con modelos locales y cambia de uno a otro en cada conversación.',
      'faq.q10': '¿Cómo actualizo Tiancode?',
      'faq.a10': 'Con el instalador, ejecuta el nuevo instalador y tus datos se conservan. En modo portable, sustituye el ejecutable por la nueva versión: la configuración permanece en su carpeta.',

      /* --- Novedades --- */
      'news.title': 'Novedades',
      'news.sub': 'Todo lo que trae Tiancode 1.0.0, la primera versión estable.',
      'news.v1': 'Versión 1.0.0',
      'news.date': '6 de agosto de 2026',
      'news.chip': 'Estable',
      'news.newTitle': 'Novedades',
      'news.new1': 'Modelos locales GGUF: descarga y ejecuta modelos desde HuggingFace sin salir de la app.',
      'news.new2': '24 skills de ingeniería de software integradas, activables una a una.',
      'news.new3': 'Sub-agentes: delega tareas a agentes especializados dentro de una conversación.',
      'news.new4': 'Pestañas de configuración: apariencia, proveedores, agentes, skills, atajos y avanzado.',
      'news.new5': 'Modo portable con Tiancode-portable.exe: sin instalación, listo desde un USB.',
      'news.new6': 'Instalador NSIS: instalación limpia y rápida para Windows 10 y 11.',
      'news.impTitle': 'Mejoras',
      'news.imp1': 'Tema oscuro y claro con cambio instantáneo, también sincronizado con el sistema.',
      'news.imp2': 'Terminal integrada más rápida, con resaltado de sintaxis.',
      'news.imp3': 'Multi-proveedor: usa OpenAI, Anthropic y modelos locales en paralelo.',
      'news.imp4': 'Atajos de teclado personalizables para las acciones más frecuentes.',
      'news.fixTitle': 'Correcciones',
      'news.fix1': 'Corregido un cierre inesperado al cambiar de proveedor con una conversación abierta.',
      'news.fix2': 'Reducido el uso de memoria al trabajar con proyectos grandes.',
      'news.fix3': 'Descargas de modelos reanudables si la conexión se interrumpe.',

      /* --- Modo portable --- */
      'port.title': 'Modo portable',
      'port.sub': 'Tiancode donde lo necesites: sin instalación, con tu configuración a cuestas.',
      'port.intro': 'La versión portable (Tiancode-portable.exe) ejecuta la aplicación completa sin instalarla. Es la misma Tiancode, pero todo — el ejecutable, la configuración y los modelos — vive en la carpeta que tú elijas.',
      'port.prosTitle': 'Por qué elegir la versión portable',
      'port.p1': 'Sin instalación y sin permisos de administrador.',
      'port.p2': 'Llévala en un USB y úsala en cualquier PC con Windows 10 u 11.',
      'port.p3': 'Tu configuración, agentes, skills y conversaciones viajan contigo.',
      'port.p4': 'No deja rastro en el equipo anfitrión: todo vive en su carpeta.',
      'port.p5': 'Actualizar es tan simple como sustituir un archivo.',
      'port.stepsTitle': 'Primeros pasos',
      'port.st1t': 'Descarga',
      'port.st1d': 'Obtén Tiancode-portable-1.0.0.exe desde la página de descarga.',
      'port.st2t': 'Coloca',
      'port.st2d': 'Crea una carpeta (por ejemplo D:\\Tiancode o tu USB) y pon el ejecutable dentro.',
      'port.st3t': 'Ejecuta',
      'port.st3d': 'Lanza el exe: Tiancode detecta el modo portable y guarda sus datos en esa misma carpeta.',
      'port.st4t': 'Programa',
      'port.st4d': 'Descarga modelos, configura tus proveedores y sigue programando donde quieras.',
      'port.tip': 'Consejo: los modelos GGUF pueden ocupar varios gigabytes. Si viajas con poco espacio, guarda los modelos en tu equipo y usa la versión portable solo para la configuración y las conversaciones.',

      /* --- Descarga --- */
      'dl.title': 'Descarga',
      'dl.sub': 'Tiancode 1.0.0 para Windows 10 y 11 (64 bits). Gratis, sin registro. El instalador y la versión portable son el mismo software: elige el que mejor se adapte a tu flujo.',
      'dl.instTitle': 'Instalador de Windows',
      'dl.instDesc': 'Instalación clásica con asistente NSIS. Ideal para uso diario: incluye accesos directos y actualizaciones sencillas.',
      'dl.instFile': 'Tiancode-1.0.0-setup.exe',
      'dl.instSize': '~120 MB',
      'dl.instBtn': 'Descargar instalador',
      'dl.portTitle': 'Versión portable',
      'dl.portDesc': 'Sin instalación. Ejecuta Tiancode desde cualquier carpeta o USB; la configuración se guarda junto al ejecutable.',
      'dl.portFile': 'Tiancode-portable-1.0.0.exe',
      'dl.portSize': '~120 MB',
      'dl.portBtn': 'Descargar portable',
      'dl.reqTitle': 'Requisitos del sistema',
      'dl.req1': 'Windows 10 u 11, 64 bits.',
      'dl.req2': '4 GB de RAM (8 GB recomendados con modelos locales).',
      'dl.req3': '1 GB de espacio libre; los modelos locales requieren espacio adicional.',
      'dl.req4': 'Internet solo para descargar modelos o usar proveedores en la nube.',
      'dl.checksum': 'Verifica la integridad de tu descarga con el hash SHA-256 publicado junto a cada versión.',
      'dl.news': '¿Qué hay de nuevo en 1.0.0? Lee las novedades.'
    },

    en: {
      'page.title': 'Tiancode — AI coding assistant for Windows',
      'page.description': 'Tiancode is the desktop AI app for coding: agents, software engineering skills, and local GGUF models — all in your terminal.',
      'loader.text': 'Loading Tiancode…',
      'nav.features': 'Features',
      'nav.how': 'How it works',
      'nav.stats': 'Stats',
      'nav.skills': 'Skills',
      'nav.download': 'Download',
      'theme.aria': 'Toggle light/dark theme',
      'lang.aria': 'Switch language',
      'nav.aria': 'Open navigation menu',
      'hero.badge': 'New · v1.0.0 available',
      'hero.tagline': 'Your AI coding assistant, right in your terminal.',
      'hero.sub': 'AI agents, 24+ software engineering skills and local GGUF models — a fast, focused desktop app for Windows.',
      'hero.ctaDownload': 'Download for Windows',
      'hero.ctaFeatures': 'See features',
      'hero.note': 'Installer and portable build · Windows 10 and 11',
      'features.title': 'Everything you need to code with AI',
      'features.sub': 'A compact, powerful desktop app designed for the real developer workflow.',
      'f.agents.title': 'AI agents',
      'f.agents.desc': 'Coding chat with multiple agents and sub-agents that collaborate, code, and debug with you.',
      'f.models.title': 'Local GGUF models',
      'f.models.desc': 'Download and run local AI models from HuggingFace, LM Studio style. No cloud, no limits.',
      'f.skills.title': '24+ engineering skills',
      'f.skills.desc': 'Requirements interviews, TDD, code review, security, performance, and CI/CD — ready to use.',
      'f.providers.title': 'Multi-provider',
      'f.providers.desc': 'Connect OpenAI, Anthropic, and other providers — or combine them with local models.',
      'f.terminal.title': 'Integrated terminal',
      'f.terminal.desc': 'Run commands, apply changes, and see results without leaving the conversation.',
      'f.portable.title': 'Portable mode',
      'f.portable.desc': 'Carry Tiancode on a USB stick: no install, configured and ready on any Windows PC.',
      'f.more.title': 'And much more',
      'f.more.desc': 'Customizable keyboard shortcuts, light and dark themes, autocomplete, and fine-grained skill settings.',
      'mock.line1': '$ tiancode --agent senior-dev',
      'mock.line2': '▸ Analyzing repository… 12,400 files in 3.2s',
      'mock.line3': '▸ Found 2 vulnerabilities in auth.js',
      'mock.line4': '▸ Fix applied · TDD tests green ✓',
      'how.title': 'How it works',
      'how.sub': 'From zero to your first agent in under five minutes.',
      's1.title': 'Download and install',
      's1.desc': 'Get the installer or the portable build for Windows 10 and 11.',
      's2.title': 'Pick your model',
      's2.desc': 'Connect your favorite AI provider or download a local GGUF model.',
      's3.title': 'Code with agents',
      's3.desc': 'Chat with your agents: they analyze, write, and review code for you.',
      's4.title': 'Tune and scale',
      's4.desc': 'Enable skills, create custom sub-agents, and define your shortcuts.',
      'stats.title': 'Numbers that matter',
      'stats.sub': 'The Tiancode community is growing fast. Illustrative data.',
      'stats.c1': 'Downloads',
      'stats.c2': 'Compatible GGUF models',
      'stats.c3': 'Engineering skills',
      'stats.c4': 'Countries',
      'stats.chartBars': 'Monthly downloads (thousands)',
      'stats.chartDonut': 'Usage by AI provider',
      'stats.donutCenter': '12.4k',
      'stats.donutCenterLabel': 'active users',
      'skills.title': 'Featured skills',
      'skills.sub': 'A growing catalog of engineering skills, enabled one by one.',
      'sk.1': 'Requirements interviews',
      'sk.2': 'Test-Driven Development (TDD)',
      'sk.3': 'Code Review',
      'sk.4': 'Security auditing',
      'sk.5': 'Performance tuning',
      'sk.6': 'CI/CD pipelines',
      'sk.7': 'Refactoring',
      'sk.8': 'Assisted debugging',
      'sk.9': 'Technical documentation',
      'sk.10': 'Architecture design',
      'sk.11': 'Static code analysis',
      'sk.12': 'Project migration',
      'cta.title': 'Start coding with AI today',
      'cta.sub': 'Free for personal use. Quick to install, easy to configure.',
      'cta.button': 'Download Tiancode',
      'cta.note': 'Windows 10 and 11 · 64-bit · ~120 MB',
      'footer.tagline': 'The AI coding assistant, built for Windows.',
      'footer.product': 'Product',
      'footer.resources': 'Resources',
      'footer.legal': 'Legal',
      'footer.l1': 'Download',
      'footer.l2': 'Changelog',
      'footer.l3': 'Portable mode',
      'footer.l4': 'Documentation',
      'footer.l5': 'Getting started',
      'footer.l6': 'FAQ',
      'footer.l7': 'Privacy',
      'footer.l8': 'Terms',
      'footer.l9': 'License',
      'footer.rights': '© 2026 Tiancode. All rights reserved.',

      /* --- Navigation: resources dropdown --- */
      'nav.more': 'Resources',
      'nav.dropdownAria': 'Open resources menu',
      'nav.m1': 'Getting Started',
      'nav.m2': 'Documentation',
      'nav.m3': 'FAQ',
      'nav.m4': 'Changelog',
      'nav.m5': 'Portable mode',
      'nav.m6': 'Download',
      'nav.m7': 'License',
      'nav.m8': 'Terms',
      'nav.m9': 'Privacy',

      /* --- Inner pages: shared --- */
      'page.back': 'Back to home',
      'legal.eyebrow': 'Legal',

      /* --- License --- */
      'lic.title': 'MIT License',
      'lic.sub': 'Tiancode is free software: you can use, modify, and redistribute it freely under the terms of the MIT License.',
      'lic.sumTitle': 'Plain-language summary',
      'lic.sum1': 'Free for personal and commercial use, with no extra costs or licenses.',
      'lic.sum2': 'You can modify the source code and build your own versions.',
      'lic.sum3': 'You can redistribute copies, as long as you keep the copyright notice.',
      'lic.sum4': 'The software is provided "as is", without warranty of any kind.',
      'lic.copyTitle': 'Copyright notice',
      'lic.codeTitle': 'Full license text',
      'lic.note': 'The MIT License applies to the Tiancode application code. AI models downloaded through the app keep their own licenses (usually open ones, such as Apache 2.0, MIT, or Llama 3).',

      /* --- Terms of Use --- */
      'terms.title': 'Terms of Use',
      'terms.sub': 'The terms that govern the use of Tiancode. By downloading or using the application you accept these conditions.',
      'terms.updated': 'Last updated: August 6, 2026',
      'terms.s1t': '1. Acceptance of the terms',
      'terms.s1p': 'By downloading, installing, or using Tiancode (the "application") you accept these Terms of Use. If you do not agree with them, do not use the application.',
      'terms.s2t': '2. Use of the software',
      'terms.s2p': 'Tiancode is built for developers and people who write code. You may use it for personal and professional purposes. You agree not to use it for illegal, harmful, or infringing activities.',
      'terms.s3t': '3. Responsible use of AI',
      'terms.s3p1': 'Tiancode agents generate code and text using AI models. Results may contain errors, security vulnerabilities, or incorrect code. You are responsible for reviewing, testing, and validating any generated code before using it in production.',
      'terms.s3p2': 'Do not use the application to generate illegal, malicious, or harmful content, and do not blindly trust AI output: always verify what it produces.',
      'terms.s4t': '4. Ownership of generated code',
      'terms.s4p': 'The code, text, and other outputs you generate with Tiancode belong to you. You may use, license, or publish them freely, even in commercial projects. Tiancode claims no ownership over your results.',
      'terms.s5t': '5. Third-party providers',
      'terms.s5p': "When you connect cloud AI providers (OpenAI, Anthropic, etc.), your usage is also governed by those providers' terms and policies. Tiancode acts as a client of their APIs, and your keys are stored only on your machine.",
      'terms.s6t': '6. No warranties',
      'terms.s6p': 'The application is provided "as is", without warranties of any kind, express or implied, including availability, fitness for a purpose, or absence of errors.',
      'terms.s7t': '7. Limitation of liability',
      'terms.s7p': 'To the maximum extent permitted by law, Tiancode shall not be liable for direct, indirect, incidental, or consequential damages arising from the use of the application, including data loss, loss of profits, or failures caused by code generated with it.',
      'terms.s8t': '8. Changes to these terms',
      'terms.s8p': 'We may update these terms from time to time. The current version is always published on this page with its update date.',
      'terms.s9t': '9. Contact',
      'terms.s9p': 'If you have questions about these terms, write to us at legal@tiancode.dev.',

      /* --- Privacy Policy --- */
      'priv.title': 'Privacy Policy',
      'priv.sub': 'Tiancode is designed privacy-first: by default, your data and your code are processed on your own machine.',
      'priv.updated': 'Last updated: August 6, 2026',
      'priv.s1t': '1. Local processing',
      'priv.s1p': 'Tiancode is a desktop application. Your conversations, your code, and your settings are stored and processed locally on your machine. We run no servers that receive your activity.',
      'priv.s2t': '2. Local models',
      'priv.s2p': 'If you use local GGUF models, inference runs entirely on your machine. Neither your prompts nor the results ever leave your computer: zero data sent.',
      'priv.s3t': '3. Cloud providers',
      'priv.s3p': 'If you choose to connect a cloud provider (OpenAI, Anthropic, or others), your messages are sent to that provider to get responses, under its own privacy policies. The choice is always yours, and you can switch back to local models at any time. Your API key is stored only on your machine.',
      'priv.s4t': '4. Optional telemetry',
      'priv.s4p': 'The application may send anonymous usage statistics (version, operating system, features used) to help us improve the product. Telemetry is off by default and only activates if you enable it in settings. It never includes the content of your conversations or your code.',
      'priv.s5t': '5. We do not sell data',
      'priv.s5p': 'We do not sell, rent, or share your personal data with third parties. Tiancode has no data-driven business model: it is a software product.',
      'priv.s6t': '6. Where information is stored',
      'priv.s6p': 'Everything lives on your machine:',
      'priv.s6l1': 'Settings and API keys:',
      'priv.s6l1b': '(installer) or the app folder (portable)',
      'priv.s6l2': 'Local models:',
      'priv.s6l2b': 'inside the data directory',
      'priv.s6l3': 'Logs and diagnostics:',
      'priv.s6l3b': 'in the data folder, used only to troubleshoot issues',
      'priv.s7t': '7. Your rights',
      'priv.s7p': 'Since everything is stored on your machine, controlling your data is straightforward: uninstall the app or delete its data folder to erase everything. You can also delete individual conversations from the UI.',

      /* --- Documentation --- */
      'docs.title': 'Documentation',
      'docs.sub': 'The official Tiancode guide: installation, agents, skills, local models, configuration, commands, and troubleshooting.',
      'docs.toc': 'Contents',
      'docs.t1': 'Installation',
      'docs.t2': 'Agents',
      'docs.t3': 'Skills',
      'docs.t4': 'Local models',
      'docs.t5': 'Configuration',
      'docs.t6': 'Commands',
      'docs.t7': 'Troubleshooting',
      'docs.s1t': '1. Installation',
      'docs.s1p': 'Tiancode 1.0.0 ships in two formats for Windows 10 and 11 (64-bit):',
      'docs.s1l1': 'NSIS installer (Tiancode-1.0.0-setup.exe): classic wizard-based install with shortcuts and easy updates.',
      'docs.s1l2': 'Portable build (Tiancode-portable-1.0.0.exe): no install, runs from any folder or USB drive.',
      'docs.s1p2': 'Minimum requirements: Windows 10 or 11 (64-bit), 4 GB RAM, and 1 GB of free space. 8 GB RAM or more is recommended for local models.',
      'docs.s2t': '2. Agents',
      'docs.s2p': 'Agents are specialized AI assistants that work on your project. You can have several agents in the same conversation, delegate tasks to sub-agents, and assign each one a role (senior-dev, reviewer, architect…).',
      'docs.s2p2': 'Each agent keeps its own context and can run commands in the integrated terminal to verify its work before proposing changes.',
      'docs.s3t': '3. Skills',
      'docs.s3p': 'Tiancode ships with 24 ready-to-use software engineering skills: requirements interviews, TDD, code review, security auditing, performance tuning, CI/CD, refactoring, assisted debugging, and more.',
      'docs.s3p2': 'Skills live in the built-in skills folder. You can create your own by adding files to that folder: each skill defines the workflow the agent follows.',
      'docs.s4t': '4. Local models',
      'docs.s4p': 'From the Models tab you can search and download GGUF models straight from HuggingFace, LM Studio style:',
      'docs.s4l1': 'Browse the catalog and pick a model, for example Llama 3.1 8B in Q4_K_M quantization.',
      'docs.s4l2': 'Download the GGUF file: the app manages progress and checks free disk space.',
      'docs.s4l3': 'Select the local model as the active provider and start chatting offline.',
      'docs.s4p2': 'Inference uses the llama.cpp backend: it runs on CPU and takes advantage of NVIDIA or AMD GPUs when available.',
      'docs.s5t': '5. Configuration',
      'docs.s5p': 'Settings are organized in tabs: Appearance (light/dark theme and language), Providers (API keys and models), Agents (default roles), Skills (enable and tune each skill), Shortcuts (customizable keyboard shortcuts), and Advanced (telemetry and data folder).',
      'docs.s6t': '6. Commands',
      'docs.s6p': 'The Tiancode CLI exposes useful commands from any terminal:',
      'docs.s7t': '7. Troubleshooting',
      'docs.s7l1': 'The local model is slow: pick a lower quantization (Q4 instead of Q8) or a smaller model.',
      'docs.s7l2': 'Model download fails: check your connection and the free space in the models folder.',
      'docs.s7l3': 'Cannot reach the provider: review the API key in Settings → Providers.',
      'docs.s7l4': 'The app does not start in portable mode: make sure you have write permissions in the folder.',
      'docs.s7l5': 'Still stuck? Open an issue and attach the logs from the data folder.',

      /* --- Getting Started --- */
      'guide.title': 'Getting Started',
      'guide.sub': 'Get Tiancode up and running in under five minutes, step by step.',
      'guide.s1t': 'Download Tiancode',
      'guide.s1d': 'Pick the NSIS installer or the portable build from the download page. Version 1.0.0 supports Windows 10 and 11.',
      'guide.s2t': 'Install or run',
      'guide.s2d': 'With the installer: follow the wizard. With the portable build: put the executable in a folder and run it — no installation required.',
      'guide.s3t': 'Pick your provider',
      'guide.s3d': 'Add your API key (OpenAI, Anthropic…) in Settings → Providers, or download a local GGUF model from the Models tab.',
      'guide.s4t': 'Start your first chat',
      'guide.s4d': 'Open a new chat, select an agent (senior-dev, for example) and make your first request: analyze your project, explain a snippet, or write a function.',
      'guide.s5t': 'Try a skill',
      'guide.s5d': 'Enable a skill such as TDD or Code Review in the Skills tab and ask for it in the conversation: the agent follows its workflow step by step.',
      'guide.s6t': 'Make it yours',
      'guide.s6d': 'Customize the theme (light or dark), the language, your keyboard shortcuts, and create your own agents and skills. Everything is stored locally.',
      'guide.note': 'Want more detail? Check the full documentation or the FAQ.',

      /* --- FAQ --- */
      'faq.title': 'Frequently Asked Questions',
      'faq.sub': 'The most common questions about Tiancode, answered.',
      'faq.q1': 'What is Tiancode?',
      'faq.a1': 'Tiancode is a desktop application for Windows that brings AI assistants into your coding workflow: agent chat, an integrated terminal, software engineering skills, and local AI models.',
      'faq.q2': 'Is it free?',
      'faq.a2': 'Yes. Tiancode is free for personal and professional use, and its code is distributed under the MIT License.',
      'faq.q3': 'What does Tiancode do with my code and conversations?',
      'faq.a3': 'Nothing without your permission. By default, everything is processed on your machine. Information is only sent to the AI provider you explicitly choose, and only the messages from that conversation.',
      'faq.q4': 'What are local GGUF models?',
      'faq.a4': 'They are AI models ready to run on your own machine. Tiancode lets you download them from HuggingFace and install them with one click, LM Studio style. With them you work offline and send data to no one.',
      'faq.q5': 'Does it work without internet?',
      'faq.a5': 'Yes, if you use a local GGUF model: chat, agents, and the terminal work fully offline. Cloud providers, of course, require a connection.',
      'faq.q6': 'Where is everything stored?',
      'faq.a6': 'Settings, keys, and conversations are stored on your machine, in %APPDATA%\\Tiancode with the installer or in the app folder in portable mode. Local models live in the models folder.',
      'faq.q7': 'Can I create my own agents and skills?',
      'faq.a7': 'Yes. You can define custom agents with their own role and context, and add your own skills to the skills folder. You can also share and reuse templates.',
      'faq.q8': 'Do I need a powerful GPU?',
      'faq.a8': 'No. Local models run on the CPU thanks to the llama.cpp backend. If you have an NVIDIA or AMD GPU, Tiancode uses it automatically to go faster.',
      'faq.q9': 'Can I use several providers at once?',
      'faq.a9': 'Yes. Tiancode is multi-provider: combine cloud models (OpenAI, Anthropic, and others) with local models and switch between them in any conversation.',
      'faq.q10': 'How do I update Tiancode?',
      'faq.a10': 'With the installer, run the new installer and your data is kept. In portable mode, replace the executable with the new version: your configuration stays in its folder.',

      /* --- What's New --- */
      'news.title': "What's New",
      'news.sub': 'Everything Tiancode 1.0.0 brings — the first stable release.',
      'news.v1': 'Version 1.0.0',
      'news.date': 'August 6, 2026',
      'news.chip': 'Stable',
      'news.newTitle': 'New',
      'news.new1': 'Local GGUF models: download and run models from HuggingFace without leaving the app.',
      'news.new2': '24 built-in software engineering skills, enabled one by one.',
      'news.new3': 'Sub-agents: delegate tasks to specialized agents inside a conversation.',
      'news.new4': 'Configuration tabs: appearance, providers, agents, skills, shortcuts, and advanced.',
      'news.new5': 'Portable mode with Tiancode-portable.exe: no install, ready from a USB stick.',
      'news.new6': 'NSIS installer: clean, fast installation for Windows 10 and 11.',
      'news.impTitle': 'Improvements',
      'news.imp1': 'Light and dark themes with instant switching, also synced with the system.',
      'news.imp2': 'Faster integrated terminal with syntax highlighting.',
      'news.imp3': 'Multi-provider: use OpenAI, Anthropic, and local models in parallel.',
      'news.imp4': 'Customizable keyboard shortcuts for the most frequent actions.',
      'news.fixTitle': 'Fixes',
      'news.fix1': 'Fixed an unexpected close when switching providers with an open conversation.',
      'news.fix2': 'Reduced memory usage when working with large projects.',
      'news.fix3': 'Model downloads can resume if the connection drops.',

      /* --- Portable mode --- */
      'port.title': 'Portable Mode',
      'port.sub': 'Tiancode wherever you need it: no installation, your configuration travels with you.',
      'port.intro': 'The portable build (Tiancode-portable.exe) runs the full application without installing it. It is the same Tiancode, but everything — the executable, the configuration, and the models — lives in a folder of your choice.',
      'port.prosTitle': 'Why choose the portable build',
      'port.p1': 'No installation and no administrator rights.',
      'port.p2': 'Carry it on a USB stick and use it on any Windows 10 or 11 PC.',
      'port.p3': 'Your settings, agents, skills, and conversations travel with you.',
      'port.p4': 'Leaves no trace on the host machine: everything lives in its folder.',
      'port.p5': 'Updating is as simple as replacing one file.',
      'port.stepsTitle': 'First steps',
      'port.st1t': 'Download',
      'port.st1d': 'Get Tiancode-portable-1.0.0.exe from the download page.',
      'port.st2t': 'Place',
      'port.st2d': 'Create a folder (for example D:\\Tiancode or your USB drive) and put the executable inside.',
      'port.st3t': 'Run',
      'port.st3d': 'Launch the exe: Tiancode detects portable mode and stores its data in that same folder.',
      'port.st4t': 'Code',
      'port.st4d': 'Download models, configure your providers, and keep coding anywhere.',
      'port.tip': 'Tip: GGUF models can take several gigabytes. If you are short on space, keep the models on your machine and use the portable build only for settings and conversations.',

      /* --- Download --- */
      'dl.title': 'Download',
      'dl.sub': 'Tiancode 1.0.0 for Windows 10 and 11 (64-bit). Free, no sign-up required. The installer and the portable build are the same software: pick the one that fits your workflow.',
      'dl.instTitle': 'Windows installer',
      'dl.instDesc': 'Classic wizard-based NSIS install. Ideal for daily use: includes shortcuts and easy updates.',
      'dl.instFile': 'Tiancode-1.0.0-setup.exe',
      'dl.instSize': '~120 MB',
      'dl.instBtn': 'Download installer',
      'dl.portTitle': 'Portable build',
      'dl.portDesc': 'No installation. Run Tiancode from any folder or USB drive; settings are stored next to the executable.',
      'dl.portFile': 'Tiancode-portable-1.0.0.exe',
      'dl.portSize': '~120 MB',
      'dl.portBtn': 'Download portable',
      'dl.reqTitle': 'System requirements',
      'dl.req1': 'Windows 10 or 11, 64-bit.',
      'dl.req2': '4 GB RAM (8 GB recommended with local models).',
      'dl.req3': '1 GB of free space; local models need additional space.',
      'dl.req4': 'Internet only to download models or use cloud providers.',
      'dl.checksum': 'Verify the integrity of your download with the SHA-256 hash published with each release.',
      'dl.news': 'What is new in 1.0.0? Read the changelog.'
    }
  };

  /* Datos de las gráficas (etiquetas por idioma) */
  const CHART_DATA = {
    es: {
      months: ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago'],
      bars: [18, 24, 21, 32, 41, 48],
      donut: [
        { label: 'OpenAI', value: 38, color: '#6366f1' },
        { label: 'Anthropic', value: 27, color: '#06b6d4' },
        { label: 'Local (GGUF)', value: 22, color: '#10b981' },
        { label: 'Otros', value: 13, color: '#64748b' }
      ]
    },
    en: {
      months: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
      bars: [18, 24, 21, 32, 41, 48],
      donut: [
        { label: 'OpenAI', value: 38, color: '#6366f1' },
        { label: 'Anthropic', value: 27, color: '#06b6d4' },
        { label: 'Local (GGUF)', value: 22, color: '#10b981' },
        { label: 'Others', value: 13, color: '#64748b' }
      ]
    }
  };

  const LS_KEYS = { lang: 'tiancode-lang', theme: 'tiancode-theme' };

  /* ---------- 2. Utilidades ---------- */
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t = function () { return I18N[lang]; };
  const easeOut = function (p) { return 1 - Math.pow(1 - p, 3); };

  function readLS(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }
  function writeLS(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* almacenamiento no disponible */ }
  }
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function fontFamily() {
    return cssVar('--font-sans') || 'sans-serif';
  }

  /* ---------- 3. Estado inicial ---------- */
  const rootEl = document.documentElement;
  let lang = readLS(LS_KEYS.lang, 'es');
  if (lang !== 'es' && lang !== 'en') lang = 'es';

  const storedTheme = readLS(LS_KEYS.theme, '');
  let theme = storedTheme ||
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  rootEl.dataset.theme = theme;

  const themeToggle = document.getElementById('theme-toggle');
  const langToggle = document.getElementById('lang-toggle');
  const navToggle = document.getElementById('nav-toggle');
  const header = document.querySelector('.site-header');
  const loader = document.getElementById('loader');

  /* ---------- 4. Tema claro/oscuro ---------- */
  themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');

  themeToggle.addEventListener('click', function () {
    theme = theme === 'dark' ? 'light' : 'dark';
    rootEl.dataset.theme = theme;
    writeLS(LS_KEYS.theme, theme);
    themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    if (chartsDone) drawCharts(); // repinta con los colores del nuevo tema
  });

  /* ---------- 5. Idioma ES/EN ---------- */
  function applyLang(newLang) {
    lang = newLang;
    writeLS(LS_KEYS.lang, lang);
    rootEl.lang = lang;
    document.title = t()['page.title'];

    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t()['page.description']);

    // Traduce textos planos
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      const key = el.getAttribute('data-i18n');
      if (t()[key] !== undefined) el.textContent = t()[key];
    });
    // Traduce atributos aria-label
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      const key = el.getAttribute('data-i18n-aria');
      if (t()[key] !== undefined) el.setAttribute('aria-label', t()[key]);
    });

    syncTitle(); // título según la página activa

    // El botón muestra el idioma al que se puede cambiar
    langToggle.textContent = lang === 'es' ? 'EN' : 'ES';

    buildDonutLegend();
    if (chartsDone) drawCharts(); // repinta etiquetas de las gráficas
  }

  langToggle.addEventListener('click', function () {
    applyLang(lang === 'es' ? 'en' : 'es');
  });

  /* ---------- 6. Menú móvil ---------- */
  navToggle.addEventListener('click', function () {
    const open = header.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.querySelectorAll('.main-nav a').forEach(function (link) {
    link.addEventListener('click', function () {
      header.classList.remove('nav-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------- 7. Loader (aparece ~1.2s) ---------- */
  function hideLoader() {
    if (loader.classList.contains('is-hidden')) return;
    loader.classList.add('is-hidden');
    setTimeout(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }, 600);
  }
  setTimeout(hideLoader, reducedMotion ? 300 : 1200);

  /* ---------- 8. Animaciones de entrada (scroll) ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reducedMotion) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- 9. Gráficas en canvas ---------- */
  const barCanvas = document.getElementById('bar-chart');
  const donutCanvas = document.getElementById('donut-chart');
  const donutLegend = document.getElementById('donut-legend');
  let chartsDone = false;

  // Ajusta el canvas a su tamaño real (soporte HiDPI)
  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: rect.width, h: rect.height };
  }

  // Gráfico de barras animado (progreso 0 → 1)
  function drawBarChart(progress) {
    const data = CHART_DATA[lang];
    const { ctx, w, h } = setupCanvas(barCanvas);
    const maxV = 50;
    const padL = 38, padR = 10, padT = 14, padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const font = fontFamily();

    // Líneas de la cuadrícula + etiquetas del eje Y
    ctx.font = '11px ' + font;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 5; i++) {
      const v = i * 10;
      const y = padT + plotH - (v / maxV) * plotH;
      ctx.strokeStyle = cssVar('--grid');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillStyle = cssVar('--text-3');
      ctx.fillText(String(v) + 'k', padL - 8, y);
    }

    // Barras con crecimiento escalonado
    const slot = plotW / data.bars.length;
    const barW = Math.min(44, slot * 0.52);
    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, cssVar('--accent'));
    grad.addColorStop(1, cssVar('--accent-2'));

    data.bars.forEach(function (value, i) {
      const p = Math.min(1, Math.max(0, progress * 1.25 - i * 0.06));
      const barH = (value / maxV) * plotH * easeOut(p);
      const x = padL + i * slot + (slot - barW) / 2;
      const y = padT + plotH - barH;

      ctx.fillStyle = grad;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, barW, barH, [6, 6, 0, 0]);
      } else {
        ctx.rect(x, y, barW, barH);
      }
      ctx.fill();

      // Valor encima de la barra (cuando está casi completa)
      ctx.textAlign = 'center';
      if (p > 0.98) {
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = cssVar('--text');
        ctx.font = '600 12px ' + font;
        ctx.fillText(String(value) + 'k', x + barW / 2, y - 6);
      }
      // Mes bajo la barra
      ctx.textBaseline = 'top';
      ctx.fillStyle = cssVar('--text-3');
      ctx.font = '11px ' + font;
      ctx.fillText(data.months[i], x + barW / 2, h - padB + 9);
    });
  }

  // Donut animado (progreso 0 → 1)
  function drawDonut(progress) {
    const data = CHART_DATA[lang].donut;
    const { ctx, w, h } = setupCanvas(donutCanvas);
    const total = data.reduce(function (s, d) { return s + d.value; }, 0);
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 16;
    const lineW = Math.max(16, r * 0.34);
    const font = fontFamily();

    // Anillo de fondo
    ctx.lineWidth = lineW;
    ctx.strokeStyle = cssVar('--grid');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Segmentos que se "despliegan" según el progreso
    const sweep = easeOut(progress) * Math.PI * 2;
    let acc = 0;
    data.forEach(function (seg) {
      const gap = 0.035;
      const a0 = -Math.PI / 2 + (acc / total) * Math.PI * 2 + gap;
      acc += seg.value;
      const a1 = -Math.PI / 2 + (acc / total) * Math.PI * 2 - gap;
      const end = Math.min(a1, -Math.PI / 2 + sweep);
      if (end > a0) {
        ctx.strokeStyle = seg.color;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.arc(cx, cy, r, a0, end);
        ctx.stroke();
      }
    });

    // Texto central
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cssVar('--text');
    ctx.font = '700 24px ' + font;
    ctx.fillText(t()['stats.donutCenter'], cx, cy - 11);
    ctx.fillStyle = cssVar('--text-3');
    ctx.font = '11px ' + font;
    ctx.fillText(t()['stats.donutCenterLabel'], cx, cy + 15);
  }

  function drawCharts() {
    drawBarChart(1);
    drawDonut(1);
  }

  function buildDonutLegend() {
    if (!donutLegend) return;
    donutLegend.innerHTML = '';
    CHART_DATA[lang].donut.forEach(function (seg) {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = seg.color;
      const text = document.createElement('span');
      text.textContent = seg.label + ' · ' + seg.value + '%';
      li.appendChild(dot);
      li.appendChild(text);
      donutLegend.appendChild(li);
    });
  }

  function animateCharts() {
    const start = performance.now();
    const dur = reducedMotion ? 1 : 1100;
    function step(now) {
      const p = Math.min(1, (now - start) / dur);
      drawBarChart(p);
      drawDonut(p);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- 10. Contadores animados ---------- */
  function animateCounters() {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      const target = parseFloat(el.getAttribute('data-count'));
      const suffix = el.getAttribute('data-suffix') || '';
      const dur = reducedMotion ? 1 : 1200;
      const start = performance.now();
      function step(now) {
        const p = Math.min(1, (now - start) / dur);
        el.textContent = Math.round(target * easeOut(p)) + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  /* ---------- 11. Activar gráficas al hacer scroll ---------- */
  const chartsSection = document.getElementById('stats-charts');
  if ('IntersectionObserver' in window && chartsSection) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !chartsDone) {
          chartsDone = true;
          animateCounters();
          animateCharts();
          io.disconnect();
        }
      });
    }, { threshold: 0.25 });
    io.observe(chartsSection);
  } else {
    chartsDone = true;
    animateCounters();
    drawCharts();
  }

  /* ---------- 12. Partículas del hero (canvas) ---------- */
  const particlesCanvas = document.getElementById('particles');
  const particlesCtx = particlesCanvas ? particlesCanvas.getContext('2d') : null;
  let parts = [];
  let rafId = null;
  let cssW = 0;
  let cssH = 0;

  function initParticles() {
    const count = Math.max(24, Math.min(60, Math.floor(cssW / 22)));
    parts = [];
    for (let i = 0; i < count; i++) {
      parts.push({
        x: Math.random() * cssW,
        y: Math.random() * cssH,
        r: 0.6 + Math.random() * 1.8,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -0.12 - Math.random() * 0.3,
        alpha: 0.12 + Math.random() * 0.38
      });
    }
  }

  function resizeParticles() {
    if (!particlesCanvas) return;
    const hero = document.getElementById('hero');
    const rect = hero.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cssW = rect.width;
    cssH = rect.height;
    particlesCanvas.width = Math.round(cssW * dpr);
    particlesCanvas.height = Math.round(cssH * dpr);
    initParticles();
  }

  function tickParticles() {
    if (!particlesCtx) return;
    const dpr = window.devicePixelRatio || 1;
    particlesCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    particlesCtx.clearRect(0, 0, cssW, cssH);
    parts.forEach(function (p) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -8) { p.y = cssH + 8; p.x = Math.random() * cssW; }
      if (p.x < -8) p.x = cssW + 8;
      if (p.x > cssW + 8) p.x = -8;
      particlesCtx.beginPath();
      particlesCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      particlesCtx.fillStyle = 'rgba(129, 140, 248, ' + p.alpha.toFixed(2) + ')';
      particlesCtx.fill();
    });
    rafId = requestAnimationFrame(tickParticles);
  }

  function startParticles() {
    if (!particlesCtx || reducedMotion) return;
    resizeParticles();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tickParticles);
  }
  startParticles();

  /* ---------- 13. Resize (con debounce) ---------- */
  let resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      startParticles();
      if (chartsDone) drawCharts();
    }, 200);
  });

  /* ---------- 14. Menú desplegable de recursos ---------- */
  const navDropdown = document.querySelector('.nav-dropdown');
  const navDropdownToggle = navDropdown ? navDropdown.querySelector('.nav-dropdown-toggle') : null;

  function closeDropdown() {
    if (!navDropdown) return;
    navDropdown.classList.remove('is-open');
    if (navDropdownToggle) navDropdownToggle.setAttribute('aria-expanded', 'false');
  }

  if (navDropdownToggle) {
    navDropdownToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      const open = navDropdown.classList.toggle('is-open');
      navDropdownToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  document.addEventListener('click', function (e) {
    if (navDropdown && !navDropdown.contains(e.target)) closeDropdown();
  });

  /* ---------- 15. Páginas internas (SPA con hash #/…) ---------- */
  const PAGE_IDS = ['licencia', 'terminos', 'privacidad', 'docs', 'guia', 'faq', 'novedades', 'portable', 'descarga'];
  const PAGE_TITLES = {
    licencia: 'lic.title',
    terminos: 'terms.title',
    privacidad: 'priv.title',
    docs: 'docs.title',
    guia: 'guide.title',
    faq: 'faq.title',
    novedades: 'news.title',
    portable: 'port.title',
    descarga: 'dl.title'
  };

  // Devuelve el nombre de la página activa según location.hash (o null)
  function pageName() {
    const hash = window.location.hash;
    if (hash.slice(0, 2) !== '#/') return null;
    const name = hash.slice(2).split(/[?#]/)[0];
    return PAGE_IDS.indexOf(name) !== -1 ? name : null;
  }

  // Título de la pestaña según la página activa
  function syncTitle() {
    const name = pageName();
    const key = name ? PAGE_TITLES[name] : null;
    document.title = key ? t()[key] + ' — Tiancode' : t()['page.title'];
  }

  // Sube al tope sin animación (ignora scroll-behavior: smooth)
  function scrollTopInstant() {
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    html.style.scrollBehavior = prev;
  }

  function route() {
    const name = pageName();
    document.querySelectorAll('.page').forEach(function (el) {
      el.classList.toggle('page--active', el.id === 'page-' + name);
    });
    document.body.classList.toggle('page-open', name !== null);
    closeDropdown();
    if (name !== null) {
      scrollTopInstant();
    } else {
      // Vuelve a la home; si el hash apunta a una sección, desplaza hasta ella
      const hash = window.location.hash;
      const target = hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
      if (target) target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      requestAnimationFrame(startParticles);
    }
    syncTitle();
  }

  window.addEventListener('hashchange', route);

  /* ---------- 16. Anclas internas dentro de las páginas (TOC, etc.) ---------- */
  // Los enlaces #/… van al router; los enlaces a elementos dentro de una página
  // se resuelven con scroll suave sin salir de la ruta de la página.
  document.addEventListener('click', function (e) {
    const link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (!el || !el.closest('.page')) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (window.history.replaceState) {
      window.history.replaceState(null, '', '#/' + el.closest('.page').id.replace('page-', ''));
    }
  });

  /* ---------- 17. Acordeón FAQ ---------- */
  document.querySelectorAll('.faq-item').forEach(function (item) {
    const btn = item.querySelector('.faq-q');
    if (!btn) return;
    btn.addEventListener('click', function () {
      const wasOpen = item.classList.contains('is-open');
      // Acordeón de apertura única: cierra el resto
      document.querySelectorAll('.faq-item.is-open').forEach(function (other) {
        other.classList.remove('is-open');
        const otherBtn = other.querySelector('.faq-q');
        if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) {
        item.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ---------- 18. Inicialización ---------- */
  buildDonutLegend();
  applyLang(lang);
  route(); // aplica la ruta inicial (#/…) y su título
})();
