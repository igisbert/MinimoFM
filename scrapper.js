import puppeteer from "puppeteer"
import fs from "fs"
import { fileURLToPath } from "url"

class NBAScraper {
  constructor() {
    this.baseUrl = "https://as.com/audio/podcast/nba-minimo-de-veterano/"
    this.episodes = []
    this.delay = 2000 // 2 segundos entre páginas
    this.browser = null
  }

  async init() {
    console.log("🚀 Iniciando navegador...")
    this.browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      slowMo: 500, // Para ver los clicks más despacio
    })
  }

  async close() {
    if (this.browser) {
      await this.browser.close()
    }
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async scrapeAllPages() {
    console.log("🏀 Iniciando scraping de NBA Mínimo de Veterano...")

    try {
      await this.init()

      // Primera página
      const firstPage = await this.scrapePage(1)
      if (!firstPage || firstPage.length === 0) {
        throw new Error("No se pudieron obtener episodios de la primera página")
      }

      console.log(`✅ Página 1: ${firstPage.length} episodios encontrados`)
      this.episodes = [...firstPage]

      // Páginas siguientes
      let currentPage = 2
      let hasMorePages = true

      while (hasMorePages && currentPage <= 50) {
        console.log(`🔄 Scrapeando página ${currentPage}...`)

        const pageEpisodes = await this.scrapePage(currentPage)

        if (pageEpisodes && pageEpisodes.length > 0) {
          this.episodes = [...this.episodes, ...pageEpisodes]
          console.log(
            `✅ Página ${currentPage}: ${pageEpisodes.length} episodios encontrados`
          )

          await this.sleep(this.delay)
          currentPage++
        } else {
          hasMorePages = false
          console.log(
            `🛑 No hay más páginas. Terminando en página ${currentPage - 1}`
          )
        }
      }

      await this.saveResults()
    } catch (error) {
      console.error("❌ Error durante el scraping:", error.message)
      if (this.episodes.length > 0) {
        await this.saveResults()
      }
    } finally {
      await this.close()
    }
  }

  async scrapePage(pageNumber) {
    try {
      const url =
        pageNumber === 1 ? this.baseUrl : `${this.baseUrl}${pageNumber}/`

      console.log(`📡 Fetching: ${url}`)

      const page = await this.browser.newPage()

      // Configurar headers realistas
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      )

      // Navegar a la página
      await page.goto(url, {
        waitUntil: "networkidle0", // Esperar a que se cargue todo
        timeout: 30000,
      })

      // Manejar popup de cookies si aparece
      try {
        console.log("🍪 Buscando popup de cookies...")

        // Primero intentar con el selector exacto que me diste
        let cookieButton = await page.$("button._button_10koz_3")

        if (!cookieButton) {
          // Si no lo encuentra, buscar por texto
          console.log('🔍 Buscando por texto "Aceptar"...')
          await page.waitForFunction(
            () => {
              const buttons = Array.from(document.querySelectorAll("button"))
              return buttons.find(
                (btn) =>
                  btn.textContent.includes("Aceptar") ||
                  btn.textContent.includes("aceptar") ||
                  btn.textContent.includes("continuar")
              )
            },
            { timeout: 5000 }
          )

          cookieButton = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll("button"))
            return buttons.find(
              (btn) =>
                btn.textContent.includes("Aceptar") ||
                btn.textContent.includes("aceptar") ||
                btn.textContent.includes("continuar")
            )
          })
        }

        if (cookieButton) {
          console.log("✅ Popup de cookies encontrado, aceptando...")
          await cookieButton.click()
          await this.sleep(2000) // Más tiempo para que se cierre
          console.log("🍪 Popup cerrado, continuando...")
        }
      } catch (e) {
        console.log("ℹ️ No se encontró popup de cookies:", e.message)

        // Debug: ver qué botones hay en la página
        try {
          const buttons = await page.$eval("button", (buttons) =>
            buttons.map((btn) => btn.textContent.trim()).slice(0, 5)
          )
          console.log("🔍 Botones encontrados:", buttons)
        } catch (err) {
          console.log("❌ Error obteniendo botones:", err.message)
        }
      }

      // Esperar específicamente a que aparezcan los episodios
      console.log("⏳ Esperando a que aparezcan los episodios...")
      try {
        await page.waitForSelector("article.pd.pd--h", { timeout: 15000 })
        console.log("✅ Episodios encontrados!")
      } catch (e) {
        console.log("❌ No se encontraron episodios, debuggeando...")

        // Debug: ver qué artículos hay
        const articles = await page.$eval("article", (articles) =>
          articles.map((art) => art.className).slice(0, 10)
        )
        console.log("🔍 Clases de artículos encontrados:", articles)

        // Debug: ver si hay elementos pd
        const pdElements = await page.$eval('[class*="pd"]', (els) =>
          els.map((el) => el.className).slice(0, 10)
        )
        console.log('🔍 Elementos con "pd" encontrados:', pdElements)

        throw new Error("No se pudieron encontrar los episodios")
      }

      // Esperar un poco más para que se carguen los botones de descarga
      console.log("⏳ Esperando a que se carguen los audios...")
      await this.sleep(3000)

      // Intentar esperar a que aparezcan los botones de descarga
      try {
        await page.waitForSelector(".mm_boton_descarga", { timeout: 5000 })
      } catch (e) {
        console.log(
          "⚠️ Los botones de descarga tardaron en cargar, continuando..."
        )
      }

      // Capturar los console.log del navegador
      page.on("console", (msg) => {
        if (msg.type() === "log") {
          console.log("🌐", msg.text())
        }
      })

      // Extraer datos
      const episodes = await page.evaluate(() => {
        const episodeElements = document.querySelectorAll("article.pd.pd--h")
        console.log(`🎯 Encontrados ${episodeElements.length} artículos`)
        const results = []

        episodeElements.forEach((article, index) => {
          console.log(`\n--- Procesando episodio ${index + 1} ---`)

          // DEBUG: Ver la estructura del artículo
          console.log(
            "HTML del artículo:",
            article.outerHTML.substring(0, 500) + "..."
          )

          // Extraer título
          const titleElement = article.querySelector("p.pd__tl a")
          console.log("¿Elemento título encontrado?", !!titleElement)

          let title = null
          if (titleElement) {
            // Probar diferentes formas de extraer el título
            const clone = titleElement.cloneNode(true)
            const link = clone.querySelector("a")
            if (link) {
              console.log("Enlace encontrado en título, eliminando...")
              link.remove()
            }
            title = clone.textContent.trim()
            console.log("Título extraído:", title)
          } else {
            // Buscar títulos alternativos
            const altTitles = article.querySelectorAll("p, h1, h2, h3, .title")
            console.log("Elementos alternativos para título:", altTitles.length)
            altTitles.forEach((el, i) => {
              console.log(
                `  Alt ${i}: \"${el.textContent.trim().substring(0, 50)}...\"`
              )
            })
          }

          // Extraer fecha
          const dateElement = article.querySelector(".pd__date time")
          console.log("¿Elemento fecha encontrado?", !!dateElement)

          let fecha = null
          if (dateElement) {
            fecha = dateElement.textContent.trim()
            console.log("Fecha extraída:", fecha)
          }

          // Extraer URL del audio
          const downloadButton = article.querySelector(
            "a.mm_boton.mm_boton_descarga"
          )
          console.log("¿Botón descarga encontrado?", !!downloadButton)

          let audioUrl = null
          if (downloadButton) {
            audioUrl = downloadButton.href
            console.log("URL audio:", audioUrl)
          } else {
            // Buscar botones alternativos
            const altButtons = article.querySelectorAll(
              'a[href*=".mp3"], a[class*="descarga"], a[class*="download"]'
            )
            console.log("Botones alternativos:", altButtons.length)
            altButtons.forEach((btn, i) => {
              console.log(
                `  Alt button ${i}: class="${btn.className}" href="${btn.href}"`
              )
            })
          }

          // Solo añadir si tenemos título y URL de audio
          if (title && audioUrl && fecha) {
            console.log("✅ Episodio válido agregado")
            results.push({
              id: `episode-${Date.now()}-${index}`,
              title: title,
              audioUrl: audioUrl,
              date: fecha,
              page: 1,
              scrapedAt: new Date().toISOString(),
            })
          } else {
            console.log(
              "❌ Episodio inválido - título:",
              !!title,
              "audio:",
              !!audioUrl
            )
          }
        })

        console.log(`🎯 Total episodios válidos: ${results.length}`)
        return results
      })

      await page.close()

      console.log(`🎯 Extraídos ${episodes.length} episodios válidos`)
      return episodes
    } catch (error) {
      console.error(`❌ Error scrapeando página ${pageNumber}:`, error.message)

      // Si es error de navegación, probablemente no hay más páginas
      if (
        error.message.includes("net::ERR_") ||
        error.message.includes("404")
      ) {
        return null
      }

      return []
    }
  }

  async saveResults() {
    // Crear directorios si no existen
    if (!fs.existsSync("src")) {
      fs.mkdirSync("src")
    }
    if (!fs.existsSync("src/data")) {
      fs.mkdirSync("src/data")
    }

    // Eliminar duplicados por título
    const uniqueEpisodes = this.episodes.reduce((acc, current) => {
      const exists = acc.find((ep) => ep.title === current.title)
      if (!exists) {
        acc.push(current)
      }
      return acc
    }, [])

    // Ordenar por fecha (más recientes primero)
    uniqueEpisodes.sort((a, b) => new Date(b.date) - new Date(a.date))

    // Guardar episodios
    fs.writeFileSync(
      "src/data/episodes.json",
      JSON.stringify(uniqueEpisodes, null, 2)
    )

    // Guardar estadísticas
    const stats = {
      totalEpisodes: uniqueEpisodes.length,
      scrapedAt: new Date().toISOString(),
      pagesScraped: [...new Set(this.episodes.map((ep) => ep.page))].length,
      duplicatesRemoved: this.episodes.length - uniqueEpisodes.length,
    }

    fs.writeFileSync("src/data/stats.json", JSON.stringify(stats, null, 2))

    console.log(`\n🎉 SCRAPING COMPLETADO!`)
    console.log(`📊 Total episodios únicos: ${uniqueEpisodes.length}`)
    console.log(`📄 Páginas scrapeadas: ${stats.pagesScraped}`)
    console.log(`🗑️ Duplicados eliminados: ${stats.duplicatesRemoved}`)
    console.log(`💾 Archivos guardados en src/data/`)

    // Mostrar algunos ejemplos
    if (uniqueEpisodes.length > 0) {
      console.log(`\n📝 Primeros episodios encontrados:`)
      uniqueEpisodes.slice(0, 3).forEach((ep, i) => {
        console.log(`  ${i + 1}. ${ep.title}`)
        console.log(`     🎵 ${ep.audioUrl}`)
      })
    }
  }
}

// Ejecutar el scraper
async function main() {
  const scraper = new NBAScraper()
  await scraper.scrapeAllPages()
}

// Esta comprobación asegura que main() solo se llama cuando el script se ejecuta directamente
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error)
}

export default NBAScraper
