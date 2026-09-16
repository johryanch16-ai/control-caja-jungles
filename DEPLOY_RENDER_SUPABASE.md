# Guía de Instalación, Configuración de Supabase y Despliegue en Render

Esta guía te explica paso a paso cómo:
1. **Instalar la aplicación en tu celular (PWA)** con el logo oficial de Jungles Bar.
2. **Conectar la base de datos en la nube (Supabase)** para sincronizar todas las sedes y celulares en tiempo real.
3. **Publicar el sistema en internet gratis (Render.com)** con conexión segura HTTPS.

---

## 📱 1. Cómo Instalar la App en Celular (PWA)

La aplicación cuenta con soporte **PWA (Progressive Web App)** completo:
- Funciona a **pantalla completa** como si fuera una aplicación nativa descargada de la tienda.
- Utiliza el **logo oficial de Jungles Bar** como icono en tu pantalla de inicio.
- Permite acceso rápido a las cajas de Jungles, La Chichera y Consolidado.

### En Teléfonos Android (Google Chrome):
1. Abre el enlace de la aplicación (en local o una vez desplegada en Render) en Chrome.
2. Toca el botón **📲 Instalar App** en la esquina superior derecha del encabezado, o toca los tres puntos verticales `⋮` de Chrome y pulsa **"Instalar aplicación"** o **"Añadir a pantalla de inicio"**.
3. Pulsa **"Instalar"**. En segundos tendrás el icono de Jungles Bar en tu pantalla.

### En iPhone o iPad (Apple Safari):
1. Abre la aplicación en Safari.
2. Toca el botón **Compartir** en la barra inferior (icono de un cuadro con una flecha hacia arriba: `⎙`).
3. Desliza hacia abajo y selecciona **"Añadir a pantalla de inicio"** (Add to Home Screen).
4. Confirma el nombre ("Jungles Caja") y presiona **"Añadir"**.

---

## ☁️ 2. Cómo Conectar la Base de Datos en la Nube (Supabase)

Supabase es una base de datos PostgreSQL en la nube extremadamente rápida, segura y gratuita.

### Paso 1: Crear tu Proyecto en Supabase
1. Ingresa a [https://supabase.com](https://supabase.com) y regístrate o inicia sesión con tu cuenta de Google o GitHub.
2. Haz clic en el botón verde **"New Project"**.
3. Asigna un nombre a tu proyecto (ej: `control-caja-jungles`), define una contraseña para la base de datos y selecciona la región más cercana (ej: `Central / North America`).
4. Haz clic en **"Create new project"** y espera 1 minuto a que termine de aprovisionarse.

### Paso 2: Crear las Tablas con el Script SQL
1. En el menú lateral izquierdo de Supabase, entra a **SQL Editor** (icono de `>_`).
2. Haz clic en **"New Query"**.
3. Abre el archivo [supabase_schema.sql](supabase_schema.sql) incluido en este proyecto, copia todo su contenido y pégalo en el editor de Supabase.
4. Presiona el botón verde **"Run"** (o `Ctrl + Enter`).
5. Verás el mensaje *"Success. No rows returned"*. ¡Tu base de datos con tablas, políticas de seguridad y replicación en tiempo real está lista!

### Paso 3: Conectar la App con tus Credenciales
1. En el panel de Supabase, ve a **Project Settings** (icono de engranaje ⚙️) > **API**.
2. Copia los siguientes dos valores:
   - **Project URL:** (ej. `https://abcdefghijklmno.supabase.co`)
   - **Project API Keys:** Copia la clave llamada **`anon` / `public`** (es una clave larga que empieza con `eyJ...`).
3. En la aplicación (en tu navegador o celular):
   - Toca el botón **🟡 Local** ubicado en la cabecera superior derecha.
   - Pega tu **Project URL** y tu **Project API Anon Key**.
   - Presiona **"🧪 Probar Conexión"** para verificar que todo esté en verde.
   - Presiona **"💾 Guardar y Conectar"**.
4. El indicador cambiará a **🟢 Nube**.
   - Si ya tenías cierres guardados en tu dispositivo, puedes presionar **"🔄 Sincronizar a Nube"** para subirlos todos de una sola vez.

---

## 🚀 3. Cómo Publicar en Render.com (Gratis y con HTTPS)

Para que puedas abrir la app en cualquier celular fuera de tu red local y la instalación PWA funcione con certificado de seguridad HTTPS, súbela a Render.com en menos de 3 minutos.

### Paso 1: Subir el Código a GitHub
Si aún no tienes el código en GitHub:
1. Crea un repositorio nuevo en [https://github.com/new](https://github.com/new) con el nombre `control-caja-bares` (puedes dejarlo privado o público).
2. En tu terminal o consola, dentro de la carpeta del proyecto, ejecuta:
```bash
git remote add origin https://github.com/TU_USUARIO/control-caja-bares.git
git branch -M main
git push -u origin main
```
*(Nota: El repositorio ya está inicializado y con todos los archivos preparados).*

### Paso 2: Crear el Web Service en Render
1. Entra a [https://render.com](https://render.com) e inicia sesión con tu cuenta de GitHub.
2. En tu Dashboard de Render, haz clic en el botón azul **"New +"** y selecciona **"Web Service"**.
3. Conecta tu repositorio de GitHub `control-caja-bares`.
4. Render detectará automáticamente la configuración del proyecto:
   - **Name:** `control-caja-jungles` (o el que prefieras)
   - **Region:** `US East (Ohio)` u otra de tu preferencia
   - **Branch:** `main`
   - **Root Directory:** (dejar vacío)
   - **Runtime:** `Node`
   - **Build Command:** (dejar vacío o `npm install`)
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Haz clic abajo en **"Deploy Web Service"**.
6. Render tardará aproximadamente 1 a 2 minutos en compilar y encender el servidor.
7. Una vez completado, verás tu URL pública en la parte superior (ej: `https://control-caja-jungles.onrender.com`).

---

## 🔒 4. Resumen de Seguridad y Respaldos
- **Modo Híbrido:** Si se va el internet en el bar, la caja no se detiene; guarda los datos localmente y los sube a Supabase en cuanto vuelve la conexión.
- **Respaldos Manuales:** Puedes seguir usando el botón de disquete en la esquina superior derecha para descargar copias de seguridad en formato JSON cuando gustes.
