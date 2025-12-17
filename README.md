# Reproductor Mínimo de Veterano

Este es un reproductor de audio para el podcast "NBA Mínimo de Veterano" de AS.com. El proyecto está construido con [Astro](https://astro.build/).

##  Entorno de desarrollo

1.  **Instalar dependencias**

    ```bash
    npm install
    ```

2.  **Ejecutar la aplicación**

    ```bash
    npm run dev
    ```

    La aplicación estará disponible en [http://localhost:4321](http://localhost:4321).

##  scraping de episodios

El proyecto incluye un script para obtener los episodios más recientes del podcast.

Para ejecutar el scrapper:

```bash
node scrapper.js
```

El script utiliza Puppeteer para navegar por la web de AS y extrae la información de los episodios, guardándola en `src/data/episodes.json`.

## 🧞 Comandos

Todos los comandos se ejecutan desde la raíz del proyecto:

| Comando | Acción |
| :--- | :--- |
| `npm install` | Instala las dependencias |
| `npm run dev` | Inicia el servidor de desarrollo en `localhost:4321` |
| `npm run build` | Compila el sitio para producción en `./dist/` |
| `node scrapper.js`| Ejecuta el script de scraping para obtener los episodios |
