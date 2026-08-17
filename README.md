# Factu — Estimados de Construcción

Sistema web para crear, editar y compartir estimados de materiales y mano de obra. Permite porcentaje de ganancia por etapa (visible solo en la app), genera PDF para el cliente sin revelar la ganancia, y se comparte fácil por WhatsApp/email.

---

## Características principales

- **Etapas dinámicas** con ítems editables (descripción, cantidad, unidad, costo unitario).
- **Ganancia por etapa** editable; solo visible en la app (no en el PDF).
- **Cálculos en vivo**: costo, precio, ganancia $ y % por etapa y total.
- **PDF profesional** para el cliente: etapas, ítems, subtotales, total — sin rastro de la ganancia.
- **Compartir**: descarga, Web Share API (celular → WhatsApp/email adjunta PDF), texto para WhatsApp.
- **Importar CSV** con limpieza automática (tu archivo de ejemplo se carga en un clic).
- **Respaldo JSON** completo (base de datos + usuarios) — crítico en Render gratis (datos efímeros).
- **Multi-usuario**: admin crea cuentas; editores ven solo sus estimados.
- **Datos de empresa** (logo, teléfono, email, dirección, nota pie) en el PDF.

---

## Stack

- **Backend**: Node 22+ / Express / SQLite (`node:sqlite` built-in) / `bcryptjs` / `cookie-session`
- **Frontend**: SPA vanilla JS / CSS / `jsPDF` + `jspdf-autotable` / `PapaParse`
- **Escritorio**: Electron 33 / electron-builder (NSIS .exe) — ventana propia, respaldo automático
- **Despliegue**: Render (gratis con datos efímeros) o cualquier VPS/Node host

---

## Estructura del proyecto

```
Factu/
├── package.json
├── main.js                   # Electron main process (ventana, backup, menú)
├── render.yaml               # Blueprint Render
├── .gitignore
├── .env.example
├── server/
│   ├── app.js                # createServer() — compartido web + electron
│   ├── index.js              # Entrada CLI (web mode)
│   ├── db.js                 # SQLite (node:sqlite) + seed admin + transactions
│   ├── auth.js               # bcrypt + middleware
│   └── routes/
│       ├── auth.js           # login / logout / me
│       ├── users.js          # admin: CRUD usuarios
│       ├── projects.js       # CRUD estimados + import + settings
│       ├── settings.js       # datos de empresa (PDF)
│       └── backup.js         # respaldo/restauración completo
├── scripts/
│   └── make-icon.js          # Genera build/icon.ico (money $) + favicon
├── build/                    # Iconos del instalador (generados)
│   ├── icon.ico
│   ├── icon.png
│   └── icon.svg
├── public/
│   ├── index.html
│   ├── css/styles.css
│   ├── js/
│   │   ├── app.js            # router + header + auth + toast + dark mode
│   │   ├── api.js            # fetch wrapper
│   │   ├── money.js          # fmt $, pct
│   │   ├── csvImport.js      # parse CSV + auto-clean
│   │   ├── pdfExport.js      # jsPDF (sin ganancia)
│   │   ├── share.js          # descargar / Web Share / WhatsApp
│   │   └── views/
│   │       ├── authView.js
│   │       ├── dashboardView.js
│   │       ├── adminView.js
│   │       └── editorView.js
│   ├── lib/                  # jsPDF, autotable, PapaParse (vendored)
│   └── sample/Construccion Estimado2.csv
├── data/                     # SQLite local (ignorado en git)
├── dist/                     # Instalador NSIS (.exe) generado
└── test/                     # e2e con puppeteer-core
```

---

## Desarrollo local

```bash
# 1) Clona / descomprime
cd Factu

# 2) Instala dependencias
npm install

# 3) Copia .env y ajusta
cp .env.example .env
# Edita .env: SESSION_SECRET (clave larga), ADMIN_EMAIL, ADMIN_PASSWORD

# 4) Ejecuta
npm run dev
# → http://localhost:3100
```

Primer acceso: `admin@factu.app` / `admin123` (si NODE_ENV=development sin .env).

---

## App de escritorio (Windows .exe)

```bash
# Ejecuta en ventana Electron (desarrollo)
npm run electron
# O haz doble clic en dist/Factu-Setup-x.y.z.exe (instalado)
```

**Datos**: se almacenan en `%APPDATA%\Factu` (persiste entre instalaciones/actualizaciones).

**Respaldo automático**: al cerrar la app se copia la BD a `%APPDATA%\Factu\backups/` (conserva últimas 10 copias). También desde el menú **Archivo → Respaldo ahora...**

### Generar instalador .exe

```bash
npm run icon          # Genera icon.ico (dinero) en build/
npm run dist          # Genera dist/Factu-Setup-x.y.z.exe (NSIS, ~100MB)
```

**Instalación**: ejecuta el .exe → instala por usuario en `%LOCALAPPDATA%\Programs\Factu` → acceso directo en Inicio.

**Nota**: sin firma digital, Windows mostrará aviso SmartScreen (aceptable para uso personal).

---

## Despliegue en Render (recomendado)

1. Crea cuenta en https://render.com
2. **New → Web Service** → conecta tu repo (GitHub/GitLab) o usa "Deploy from existing code"
3. Build Command: `npm install`
4. Start Command: `npm start`
5. **Environment Variables** (Settings → Environment):
   - `SESSION_SECRET` → genera una clave segura (ej. `openssl rand -hex 32`)
   - `ADMIN_EMAIL` → tu email
   - `ADMIN_PASSWORD` → contraseña fuerte
   - `NODE_ENV` → `production`
6. **Plan Free** (Web Service): 
   - ✅ HTTPS automático (requerido para Web Share API en celular)
   - ⚠️ **Sistema de archivos efímero**: la base SQLite se borra en cada deploy/restart. **Ver sección Respaldo**.

> **Nota**: Si necesitas persistencia garantizada, usa el plan **Starter** ($7/mes) y adjunta un **Persistent Disk** en `/data`, o usa base PostgreSQL externa (Neon/Supabase gratis).

---

## Respaldo / Restauración (¡LEER!)

### En Render Free los datos **se pierden** al reiniciar el servicio.
La app incluye respaldo completo:

1. **Dashboard → "Descargar respaldo"** → JSON con usuarios, settings, proyectos, etapas, ítems.
2. Guarda ese archivo en tu PC / Drive.
3. **Dashboard → "Restaurar respaldo"** → sube el JSON → reemplaza todo.

> Recomendación: descarga respaldo **cada vez que termines de trabajar** y antes de cualquier deploy.

### Respaldo por proyecto
En cada estimado → botón **JSON** → descarga solo ese proyecto (útil para mover entre cuentas).

---

## Uso rápido

1. **Login** con tu usuario.
2. **Nuevo estimado** → rellena cliente/proyecto → **Guardar**.
3. **Abrir estimado** → agrega etapas (+), ítems (+), ajusta **% ganancia** por etapa.
4. **Totales** en vivo (costo, precio, ganancia $ y %).
4. **PDF** → descarga / comparte (celular: "Compartir" → WhatsApp / Email).
5. **WhatsApp** → botón genera texto resumen y abre `wa.me`.
6. **Importar CSV** → arrastra tu archivo (usa "Cargar ejemplo" para probar con tu archivo).
7. **Admin** (solo admin): crea usuarios, resetea contraseñas, configura datos de la empresa (aparecen en el PDF).

---

## Importar tu CSV (auto-limpieza)

El parser detecta y corrige automáticamente:
- Código de etapa duplicado (`8010` → nombres únicos).
- "Ebanistería NOT IN CONTRACT" → etapa excluida (no suma al total).
- Filas "Materiales" / "Herramientas" → etapa **Costos Generales**.
- Ítems sin precio → costo $0 (los completas tú).
- Cálculo de **% ganancia real por etapa** a partir de costo/precio del archivo.

---

## Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `SESSION_SECRET` | Sí | Clave larga para firmar cookies (32+ chars) |
| `ADMIN_EMAIL` | Sí | Email del primer admin |
| `ADMIN_PASSWORD` | Sí | Contraseña del primer admin |
| `NODE_ENV` | No | `production` en prod (usa `secure: true` en cookies) |
| `PORT` | No | Puerto (default 3100) |
| `DATA_DIR` | No | Directorio SQLite (default `./data`) |
| `COOKIE_SECURE` | No | `false` para forzar `secure:false` en prod si usas proxy HTTP |

---

## Scripts

```bash
npm start        # production
npm run dev      # desarrollo (igual)
```

---

## Pruebas end-to-end (opcional)

```bash
npm install --no-save puppeteer-core
node test/e2e.js
# Requiere Chrome instalado (C:\Program Files\Google\Chrome\Application\chrome.exe)
```

Prueba: login, CRUD, editor, recálculo, % ganancia, PDF (sin ganancia), CSV ejemplo, importación, respaldo.

---

## Licencia

MIT — uso libre, modificación y distribución.