import {
    PagedResults,
    Source,
    Manga,
    Chapter,
    ChapterDetails,
    HomeSection,
    SearchRequest,
    SourceInfo,
    LanguageCode,
    TagType,
    MangaUpdates,
    MangaStatus,
    MangaTile,
} from 'paperback-extensions-common'

const MANGAFREAK_DOMAIN = "https://w12.mangafreak.net"
const IMAGES_DOMAIN = "https://images.mangafreak.net"

const MILLISECONDS_IN_DAY = 86400000

export const MangaFreakInfo: SourceInfo = {
    author: 'sequal32',
    description: 'Extension that pulls manga from MangaFreak',
    icon: 'icon.png',
    name: 'MangaFreak',
    version: '1.0.11',
    authorWebsite: 'https://github.com/sequal32',
    websiteBaseURL: MANGAFREAK_DOMAIN,
    hentaiSource: false,
    language: LanguageCode.ENGLISH,
    sourceTags: [
        {
            text: "Notifications",
            type: TagType.GREEN
        }
    ],
}

export class MangaFreak extends Source {
    async getMangaDetails(mangaId: string): Promise<Manga> {
        const request = createRequestObject({
            url: `${MANGAFREAK_DOMAIN}/Manga/${mangaId}`,
            method: 'GET'
        })
        const response = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(response.data)

        const mangaSeriesData = $('.manga_series_data')
        const mangaSeriesImage = $('.manga_series_image > img')
        const mangaDescription = $('.manga_series_description > p')

        const mangaDataTextArray = mangaSeriesData.find('div').toArray()
        const mangaSeriesDataRows = mangaSeriesData.children()

        const titles = mangaSeriesDataRows[0].firstChild.data!.split(', ')
        const author = mangaSeriesDataRows[3].firstChild?.data
        const artist = mangaSeriesDataRows[4].firstChild?.data
        const description = mangaDescription.text()
        const image = mangaSeriesImage.attr('src')!
        const status = StatusTexts[mangaDataTextArray[1].firstChild.data!]

        // Tags
        const tags = mangaSeriesData.find('.series_sub_genre_list > a').toArray().map(element => {
            const id = element.attribs['href']
            const label = element.firstChild.data!

            return createTag({
                id,
                label
            })
        })

        const tagSection = createTagSection({ id: '0', label: "genres", tags })

        return createManga({
            id: mangaId,
            titles: titles,
            image: image,
            rating: 0,
            status: status,
            author: author,
            artist: artist,
            desc: description,
            tags: [tagSection]
        })
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = createRequestObject({
            url: `${MANGAFREAK_DOMAIN}/Manga/${mangaId}`,
            method: 'GET'
        })
        const response = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(response.data)

        let chapters: Chapter[] = []

        $('.manga_series_list').find('tbody').first().find('tr').each((_, element) => {
            const tableDatas = $('td', element).contents()

            const chapterString = tableDatas[0].firstChild.data!
            const dateString = tableDatas[1].data!

            const date = new Date(dateString)

            // Use reader url to get chapter number
            const chapRegex = tableDatas[0].attribs["href"].match(/Read1_.+_(\d+)/)

            if (chapRegex === null || chapRegex.length < 1) { return }

            const chapId = chapRegex[1]
            const chapNum = Number(chapId)

            const chapter = createChapter({
                id: chapId,
                name: chapterString,
                mangaId: mangaId,
                chapNum: chapNum,
                langCode: LanguageCode.ENGLISH,
                time: date
            })

            chapters.push(chapter)
        })


        return chapters
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = createRequestObject({
            url: `${MANGAFREAK_DOMAIN}/Read1_${mangaId}_${chapterId}`,
            method: 'GET'
        })
        const response = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(response.data)

        const pageDivs = $('.mySlides > img').toArray()
        const pages = pageDivs.map(element => element.attribs['src'])

        return createChapterDetails({
            mangaId: mangaId,
            id: chapterId,
            pages: pages,
            longStrip: false
        })
    }

    async searchRequest(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const request = createRequestObject({
            url: `${MANGAFREAK_DOMAIN}/Search/${encodeURI(query.title!)}`,
            method: 'GET'
        })
        const response = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(response.data)

        let results: MangaTile[] = []

        $(".manga_search_item").each((_, element) => {
            const imageSpan = $('span', element)
            const infoSpan = imageSpan.next()

            const imageLink = imageSpan.find('a')
            const id = getIdFromImageLink(imageLink)
            const titleText = infoSpan.find('h3 > a').text()

            const tile = createMangaTile({
                id,
                title: createIconText({
                    text: titleText
                }),
                image: getImageForId(id)
            })


            results.push(tile)
        });


        return createPagedResults({
            results
        })
    }

    getMangaShareUrl(mangaId: string): string {
        return `${MANGAFREAK_DOMAIN}/${mangaId}`
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            createHomeSection({ id: "featured", title: "FEATURED" }),
            createHomeSection({ id: "top", title: "TOP" }),
            createHomeSection({ id: "today", title: "UPDATED TODAY" }),
            createHomeSection({ id: "yesterday", title: "UPDATED YESTERDAY" }),
            createHomeSection({ id: "older", title: "UPDATED RECENTLY" }),
        ]

        const sendSections = () => {
            for (const section of sections) sectionCallback(section);
        }

        // Begin
        sendSections()

        const request = createRequestObject({
            url: MANGAFREAK_DOMAIN,
            method: 'GET'
        })
        const response = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(response.data)

        // Parse top
        let top: MangaTile[] = []

        $('.featured_item').each((_, element) => {
            const itemInfo = $('.featured_item_info', element)
            const itemImageLink = $('.featured_item_image > a', element)

            const titleLink = itemInfo.find('a')
            const id = getIdFromImageLink(itemImageLink)

            const title = titleLink.contents()[0].data!

            top.push(createMangaTile({
                id: id,
                image: getImageForId(id),
                title: createIconText({
                    text: title
                }),
            }))
        })

        // Parse featured
        let featured: MangaTile[] = []

        $('ul.rslides > li').each((_, element) => {
            const slideImageLink = $('a', element)

            const id = getIdFromImageLink(slideImageLink)
            const title = $('div', element).text()
            const image = getImageForId(id)

            featured.push(createMangaTile({
                id: id,
                image,
                title: createIconText({
                    text: title
                }),
            }))
        })

        // Parse main sections
        const getList = (element: CheerioElement): MangaTile[] => {
            let resultList: MangaTile[] = []

            $('.latest_item', element).each((_, element) => {
                const itemImageLink = $('a.image', element)

                const id = getIdFromImageLink(itemImageLink)
                const title = $('a.name', element).contents()[0].data!

                resultList.push(createMangaTile({
                    id: id,
                    image: getImageForId(id),
                    title: createIconText({
                        text: title
                    }),
                }))
            })

            return resultList
        }

        const lists = $('.latest_list')
        const today = getList(lists[0])
        const yesterday = getList(lists[1])
        const older = getList(lists[2])

        sections[0].items = featured
        sections[1].items = top
        sections[2].items = today
        sections[3].items = yesterday
        sections[4].items = older

        sendSections()
    }

    async filterUpdatedManga(mangaUpdatesFoundCallback: (updates: MangaUpdates) => void, time: Date, ids: string[]): Promise<void> {
        // The precision of MangaFreak is days, so let's avoid updating unreasonably
        let today = new Date()
        today.setHours(0)
        today.setMinutes(0)

        let isPastDate = false

        for (let page = 1; page <= 10; page++) {
            const request = createRequestObject({
                url: `${MANGAFREAK_DOMAIN}/Latest_Releases/${page}`,
                method: 'GET'
            })
            const response = await this.requestManager.schedule(request, 1)
            const $ = this.cheerio.load(response.data)

            let update_ids: string[] = []

            $('.latest_releases_item').each((_, element) => {
                const id = getIdFromRelativeLink($('.latest_releases_info > a', element).attr("href") ?? "")

                if (!id) { return }

                const dateString = $('.latest_releases_time', element)[0].firstChild.data!.trim()

                let updatedDate: Date

                switch (dateString) {
                    case 'Today':
                        updatedDate = today
                        break;
                    case 'Yesterday':
                        updatedDate = new Date(today.getTime() - MILLISECONDS_IN_DAY)
                        break;
                    default:
                        updatedDate = new Date(dateString)
                        break;
                }

                if (updatedDate <= time) {
                    isPastDate = true;
                    return
                }

                if (ids.includes(id)) {
                    update_ids.push(id)
                }
            })

            mangaUpdatesFoundCallback(createMangaUpdates({ ids }))

            // Scanned enough pages
            if (isPastDate) {
                break
            }
        }
    }
}

function getImageForId(id: string) {
    return `${IMAGES_DOMAIN}/manga_images/${id.toLowerCase()}.jpg`
}

function getIdFromImageLink(imageLink: Cheerio): string {
    const id = getIdFromRelativeLink(imageLink.attr("href") ?? "")
    return id ?? ""
}

function getIdFromRelativeLink(relLink: string): null | string {
    const idRegex = relLink.match(/Manga\/(.+)/)

    if (!idRegex || idRegex.length < 2) { return null }

    return idRegex[1]
}

const StatusTexts: { [key: string]: MangaStatus } = {
    'ON-GOING': MangaStatus.ONGOING,
    'COMPLETED': MangaStatus.COMPLETED
}