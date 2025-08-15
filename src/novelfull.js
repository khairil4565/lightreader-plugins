// @id novelfull
// @name NovelFull
// @version 1.0.0
// @description Read novels from NovelFull.net
// @author khairil4565
// @website https://novelfull.net

class NovelFullPlugin extends BasePlugin {
    constructor(config) {
        super(config);
        this.baseURL = 'https://novelfull.net';
    }

    async searchNovels(query) {
        console.log(`Searching for: ${query}`);
        
        try {
            let url;
            
            switch(query.toLowerCase()) {
                case 'popular':
                    url = `${this.baseURL}/hot-novel`;
                    break;
                case 'latest':
                    url = `${this.baseURL}/latest-release-novel`;
                    break;
                case 'hot':
                    url = `${this.baseURL}/hot-novel`;
                    break;
                case 'completed':
                    url = `${this.baseURL}/completed-novel`;
                    break;
                default:
                    url = `${this.baseURL}/search?keyword=${encodeURIComponent(query)}`;
            }
            
            console.log(`Fetching from URL: ${url}`);
            const html = await fetch(url);
            
            return this.parseNovelList(html, query);
            
        } catch (error) {
            console.log(`Error searching novels: ${error}`);
            return [];
        }
    }

    parseNovelList(html, queryType) {
        try {
            let selector = '.list.list-truyen .row';
            if (queryType === 'search') {
                selector = '.list-truyen .row';
            }
            
            console.log(`Using selector: ${selector}`);
            const novelElements = parseHTML(html, selector);
            console.log(`Found ${novelElements.length} novel elements`);
            
            const novels = [];
            
            for (let i = 0; i < novelElements.length; i++) {
                const element = novelElements[i];
                
                try {
                    // Get title and URL - with defensive checks
                    const titleElements = parseHTML(element.html, '.truyen-title a, h3 a, a');
                    if (titleElements.length === 0) {
                        console.log(`No title found in element ${i}`);
                        continue;
                    }
                    
                    const titleElement = titleElements[0];
                    const title = titleElement.text ? titleElement.text.trim() : '';
                    const novelURL = this.resolveURL(titleElement.href);
                    
                    if (!title || !novelURL) {
                        console.log(`Skipping element ${i}: title="${title}", url="${novelURL}"`);
                        continue;
                    }
                    
                    // Get cover image - with defensive checks
                    const coverElements = parseHTML(element.html, '.book img, img');
                    let coverURL = null;
                    if (coverElements.length > 0 && coverElements) {
                        const coverElement = coverElements;
                        coverURL = coverElement['data-src'] || coverElement.src;
                        if (coverURL) {
                            coverURL = this.resolveURL(coverURL);
                        }
                    }
                    
                    // Get author - with defensive checks
                    const authorElements = parseHTML(element.html, '.author');
                    let author = null;
                    if (authorElements.length > 0 && authorElements && authorElements.text) {
                        author = authorElements.text.trim();
                    }
                    
                    const novel = {
                        id: `novelfull_${Date.now()}_${i}`,
                        title: title,
                        author: author,
                        synopsis: null,
                        coverImageURL: coverURL,
                        sourcePlugin: this.id,
                        novelURL: novelURL
                    };
                    
                    novels.push(novel);
                    console.log(`Added novel: ${title} by ${author || 'Unknown'}`);
                    
                } catch (error) {
                    console.log(`Error parsing novel element ${i}: ${error}`);
                }
            }
            
            console.log(`Successfully parsed ${novels.length} novels`);
            return novels;
            
        } catch (error) {
            console.log(`Error parsing novel list: ${error}`);
            return [];
        }
    }

    resolveURL(url) {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return this.baseURL + url;
        return url;
    }

    async fetchNovelDetails(novelURL) {
        try {
            console.log(`Fetching novel details from: ${novelURL}`);
            const html = await fetch(novelURL);
            
            // Parse using parseHTML bridge with defensive checks
            const titleElements = parseHTML(html, 'h3.title, .title, h1');
            const title = (titleElements.length > 0 && titleElements[0].text) ? titleElements.text.trim() : 'Unknown Title';
            
            const authorElements = parseHTML(html, '.info a[href*="author"], .author');
            const author = (authorElements.length > 0 && authorElements.text) ? authorElements.text.trim() : null;
            
            const synopsisElements = parseHTML(html, '.desc-text, .desc, .description');
            const synopsis = (synopsisElements.length > 0 && synopsisElements.text) ? synopsisElements.text.trim() : null;
            
            const coverElements = parseHTML(html, '.book img, .cover img, img');
            let coverURL = null;
            if (coverElements.length > 0 && coverElements) {
                const coverElement = coverElements;
                coverURL = coverElement['data-src'] || coverElement.src;
                if (coverURL) {
                    coverURL = this.resolveURL(coverURL);
                }
            }
            
            // Parse chapters
            const chapters = this.parseChapterList(html, novelURL);
            
            const novel = {
                id: `novelfull_${Date.now()}`,
                title: title,
                author: author,
                synopsis: synopsis || 'No synopsis available',
                coverImageURL: coverURL,
                sourcePlugin: this.id,
                novelURL: novelURL
            };
            
            return {
                novel: novel,
                chapters: chapters,
                totalChapters: chapters.length,
                lastUpdated: new Date()
            };
            
        } catch (error) {
            console.log(`Error fetching novel details: ${error}`);
            throw error;
        }
    }

    parseChapterList(html, novelURL) {
        const chapters = [];
        const chapterElements = parseHTML(html, '#list-chapter .row a, .chapter-list a, .list-chapter a');
        
        for (let i = 0; i < chapterElements.length; i++) {
            const element = chapterElements[i];
            
            try {
                const chapterTitle = (element.text) ? element.text.trim() : `Chapter ${i + 1}`;
                const chapterURL = this.resolveURL(element.href);
                
                if (!chapterURL) continue;
                
                let chapterNumber = i + 1;
                const numberMatch = chapterTitle.match(/\d+/);
                if (numberMatch) {
                    chapterNumber = parseInt(numberMatch[0]);
                }
                
                const chapter = {
                    id: `chapter_${Date.now()}_${i}`,
                    title: chapterTitle,
                    novelId: novelURL,
                    chapterNumber: chapterNumber,
                    url: chapterURL,
                    content: null,
                    isDownloaded: false
                };
                
                chapters.push(chapter);
                
            } catch (error) {
                console.log(`Error parsing chapter ${i}: ${error}`);
            }
        }
        
        console.log(`Parsed ${chapters.length} chapters`);
        return chapters;
    }

    async fetchChapterContent(chapterURL) {
        try {
            console.log(`Fetching chapter content from: ${chapterURL}`);
            const html = await fetch(chapterURL);
            
            // Try different selectors for chapter content
            const contentSelectors = ['#chapter-content', '.chapter-content', '#content', '.content'];
            
            for (const selector of contentSelectors) {
                const contentElements = parseHTML(html, selector);
                if (contentElements.length > 0 && contentElements[0].text) {
                    const content = contentElements.text.trim();
                    
                    if (content.length > 100) {
                        console.log(`Successfully fetched chapter content (${content.length} characters)`);
                        return content;
                    }
                }
            }
            
            // Fallback to paragraphs
            const paragraphs = parseHTML(html, 'p');
            let content = '';
            for (const p of paragraphs) {
                if (p.text) {
                    const text = p.text.trim();
                    if (text.length > 50) {
                        content += text + '\n\n';
                    }
                }
            }
            
            return content || 'Chapter content could not be loaded';
            
        } catch (error) {
            console.log(`Error fetching chapter content: ${error}`);
            return 'Failed to load chapter content';
        }
    }
}
