import puppeteer from "puppeteer"
import fs from "fs"
import { fileURLToPath } from "url"

class NBAScraper {
  constructor() {
    this.baseUrl = "https://as.com/audio/podcast/nba-minimo-de-veterano/"
    this.episodes = []
    this.delay = 2000
    this.browser = null
  }

  async init() {
    console.log("🚀 Iniciando navegador...")
    this.browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
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

      const firstPage = await this.scrapePage(1)
      if (!firstPage || firstPage.length === 0) {
        throw new Error("No se pudieron obtener episodios de la primera página")
      }

      console.log(`✅ Página 1: ${firstPage.length} episodios encontrados`)
      this.episodes = [...firstPage]

      let currentPage = 2
      let hasMorePages = true

      while (hasMorePages && currentPage <= 50) {
        console.log(`🔄 Scrapeando página ${currentPage}...`)

        const pageEpisodes = await this.scrapePage(currentPage)

        if (pageEpisodes && pageEpisodes.length > 0) {
          this.episodes = [...this.episodes, ...pageEpisodes]
          console.log(`✅ Página ${currentPage}: ${pageEpisodes.length} episodios encontrados`)
          await this.sleep(this.delay)
          currentPage++
        } else {
          hasMorePages = false
          console.log(`🛑 No hay más páginas. Terminando en página ${currentPage - 1}`)
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
      const url = pageNumber === 1 ? this.baseUrl : `${this.baseUrl}${pageNumber}/`
      console.log(`📡 Fetching: ${url}`)

      const page = await this.browser.newPage()

      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      )

      await page.goto(url, {
        waitUntil: "networkidle0",
        timeout: 30000,
      })

      // Cerrar popup de cookies si aparece
      try {
        const cookieButton = await Promise.race([
          page.waitForSelector("button._button_10koz_3", { timeout: 5000 }),
          page.waitForFunction(
            () => Array.from(document.querySelectorAll("button"))
              .find(btn => btn.textContent.includes("Aceptar") || btn.textContent.includes("aceptar")),
            { timeout: 5000 }
          ).then(() =>
            page.evaluateHandle(() =>
              Array.from(document.querySelectorAll("button"))
                .find(btn => btn.textContent.includes("Aceptar") || btn.textContent.includes("aceptar"))
            )
          ),
        ])

        if (cookieButton) {
          console.log("🍪 Aceptando cookies...")
          await cookieButton.click()
          await this.sleep(2000)
        }
      } catch {
        console.log("ℹ️ Sin popup de cookies")
      }

      // Esperar a que carguen los botones de descarga
      console.log("⏳ Esperando episodios...")
      try {
        await page.waitForSelector("a.mm_boton_descarga", { timeout: 15000 })
        console.log("✅ Episodios encontrados!")
      } catch {
        console.log("❌ No se encontraron botones de descarga, puede que no haya más páginas")
        await page.close()
        return null
      }

      const episodes = await page.evaluate(() => {
        const items = document.querySelectorAll(".s.s--h.s--aup")
        console.log(`🎯 Encontrados ${items.length} artículos`)

        return Array.from(items).map((item, index) => {
          const titleEl = item.querySelector(".s_t a")
          const dateEl  = item.querySelector(".s_k")
          const audioEl = item.querySelector("a.mm_boton_descarga")

          if (!titleEl || !audioEl) {
            console.log(`⚠️ Episodio ${index + 1} incompleto - título: ${!!titleEl}, audio: ${!!audioEl}`)
            return null
          }

          const href  = titleEl.href || ""
          const slug  = href.split("/").filter(Boolean).pop() || `episode-${index}`

          return {
            id:        slug,
            title:     titleEl.textContent.trim(),
            date:      dateEl?.textContent.trim() ?? null,
            audioUrl:  audioEl.href,
            scrapedAt: new Date().toISOString(),
          }
        }).filter(Boolean)
      })

      await page.close()
      console.log(`🎯 Extraídos ${episodes.length} episodios válidos`)
      return episodes
    } catch (error) {
      console.error(`❌ Error scrapeando página ${pageNumber}:`, error.message)

      if (error.message.includes("net::ERR_") || error.message.includes("404")) {
        return null
      }

      return []
    }
  }

  async saveResults() {
    if (!fs.existsSync("src")) fs.mkdirSync("src")
    if (!fs.existsSync("src/data")) fs.mkdirSync("src/data")

    const uniqueEpisodes = this.episodes.reduce((acc, current) => {
      if (!acc.find(ep => ep.title === current.title)) acc.push(current)
      return acc
    }, [])

    uniqueEpisodes.sort((a, b) => new Date(b.date) - new Date(a.date))

    fs.writeFileSync("src/data/episodes.json", JSON.stringify(uniqueEpisodes, null, 2))

    const stats = {
      totalEpisodes:     uniqueEpisodes.length,
      scrapedAt:         new Date().toISOString(),
      pagesScraped:      [...new Set(this.episodes.map(ep => ep.page))].length,
      duplicatesRemoved: this.episodes.length - uniqueEpisodes.length,
    }

    fs.writeFileSync("src/data/stats.json", JSON.stringify(stats, null, 2))

    console.log(`\n🎉 SCRAPING COMPLETADO!`)
    console.log(`📊 Total episodios únicos: ${uniqueEpisodes.length}`)
    console.log(`📄 Páginas scrapeadas: ${stats.pagesScraped}`)
    console.log(`🗑️ Duplicados eliminados: ${stats.duplicatesRemoved}`)
    console.log(`💾 Archivos guardados en src/data/`)

    if (uniqueEpisodes.length > 0) {
      console.log(`\n📝 Primeros episodios encontrados:`)
      uniqueEpisodes.slice(0, 3).forEach((ep, i) => {
        console.log(`  ${i + 1}. ${ep.title}`)
        console.log(`     🎵 ${ep.audioUrl}`)
      })
    }
  }
}

async function main() {
  const scraper = new NBAScraper()
  await scraper.scrapeAllPages()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error)
}

export default NBAScraper