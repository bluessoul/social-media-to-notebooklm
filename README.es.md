# Social Media to NotebookLM

**Captura local de contenidos y entrega controlada a NotebookLM**

Convierte contenidos de WeChat, LinkedIn, Xiaohongshu, Bilibili, YouTube, Telegram, Doc88 y archivos EML en materiales locales revisables y reutilizables para NotebookLM.

**Idioma:** [中文](README.md) · [English](README.en.md) · [Español](README.es.md)

Este proyecto no es un producto ni un cliente oficial de NotebookLM. Se centra en la captura multiplataforma, el formateo, el archivado local y la entrega controlada.

## Por qué usarlo

- **Local-first:** genera Markdown, PDF, SRT y JSON localmente antes de subirlos.
- **Multiplataforma:** procesa artículos, subtítulos, exportaciones de Telegram, páginas Doc88 y archivos EML.
- **Entrega controlada:** la subida a NotebookLM es opcional y requiere confirmación del usuario.
- **Fuentes trazables:** conserva URL de origen, IDs de vídeo, marcas de tiempo y metadatos de entrega.

```text
URL / exportación de Telegram o EML
                ↓
        extracción local
                ↓
       Markdown / PDF / SRT / JSON
                ↓
          revisión del usuario
                ↓
      entrega opcional a NotebookLM
```

## Entradas compatibles

| Entrada | Principales resultados |
| --- | --- |
| Cuenta oficial de WeChat | Markdown, Markdown online, PDF y directorio de imágenes |
| LinkedIn | Markdown, Markdown online, PDF y directorio de imágenes |
| Xiaohongshu | Markdown, Markdown online, PDF y directorio de imágenes |
| Bilibili | SRT de subtítulos oficiales/IA, JSON y Markdown para NotebookLM |
| Exportación JSON de Telegram | Markdown organizado por fecha y manifiesto de entrega |
| Vista previa de Doc88 | PDF y manifiesto de entrega |
| Archivo o directorio EML | Markdown de correo, lista de adjuntos y manifiesto |

## Instalación

Requiere Node.js 18 o posterior:

```powershell
cd <directorio-de-la-skill>
npm install
npx playwright install chromium
```

Instalación en Codex:

```powershell
python <skill-installer>/scripts/install-skill-from-github.py `
  --repo bluessoul/social-media-to-notebooklm --path .
```

La conversión EML también requiere Python 3. El programa prueba `EML_PYTHON_EXE`, el Python incluido en Codex, `py -3`, `python` y `python3`.

## Uso básico

```powershell
.\run.bat --url "https://mp.weixin.qq.com/s/..."
.\run.bat --url "https://www.linkedin.com/posts/..."
.\run.bat --url "https://www.xiaohongshu.com/explore/..."
.\run.bat --url "https://www.bilibili.com/video/BV..."
```

Para Telegram JSON o EML:

```powershell
.\run.bat --file "D:\Telegram\ChatExport.json" --no-upload --handoff-notebooklm
.\run.bat --file "D:\Mail\message.eml" --no-upload --handoff-notebooklm
```

Opciones principales:

```text
--url <URL>                  URL web o de vídeo
--file <archivo-o-directorio> JSON de Telegram, archivo EML o directorio EML
--output <directorio>        Directorio de subtítulos de Bilibili
--set-output <directorio>    Establecer el directorio de archivo predeterminado
--no-upload                  Omitir la pregunta de subida a NotebookLM
--upload                     Mantener el comportamiento anterior de subida directa
--handoff-notebooklm         Crear el manifiesto sin subir archivos
--help                       Mostrar ayuda
```

## Subtítulos de Bilibili

La prioridad es: subtítulos oficiales (API WBI y después API estándar) → subtítulos chinos de IA en un navegador Chrome/Edge ya autenticado → informe explícito de indisponibilidad.

La captura de subtítulos de IA requiere un navegador autenticado con CDP activado:

```text
chrome.exe --remote-debugging-port=9223
```

El ASR local solo se activa explícitamente con `--fallback-to-asr`. Requiere `faster-whisper`, `yt-dlp` y un entorno Python operativo.

## Doc88

Las páginas de vista previa de Doc88 pueden exportarse a PDF mediante Canvas del navegador, con una alternativa opcional basada en FFDec/Presse. Consulta [references/doc88.md](references/doc88.md).

## Entrega a NotebookLM

El modo de entrega solo crea archivos locales y un manifiesto JSON. Node.js no realiza la subida directamente.

1. Revisa los archivos y el manifiesto.
2. Elige el archivo recomendado para subir.
3. Confirma antes de utilizar un flujo separado de subida a NotebookLM.
4. Conserva los archivos locales si la subida falla.

## Límites de privacidad y seguridad

- Los resultados se generan localmente por defecto; la subida a NotebookLM no es automática.
- Proporciona cookies, sesiones y credenciales mediante variables de entorno locales o un navegador ya autenticado. Nunca las subas al repositorio.
- Las exportaciones de Telegram, archivos EML, subtítulos, PDF, registros y capturas pueden contener información personal o material protegido por derechos de autor. No los subas al repositorio.
- Procesa únicamente contenidos a los que tengas autorización para acceder y archivar.
- Respeta los términos, derechos de autor y requisitos de privacidad de cada plataforma.

## Comprobaciones de desarrollo

```powershell
npm test
node --check lib/eml-converter.js
```

## Aviso legal

Este proyecto no es oficial y no está afiliado a Google ni a NotebookLM.
