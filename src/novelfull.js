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
                    url = `${this.baseURL}/most-popular`;
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
            // Use correct selector for the structure we see in the HTML
            const selector = '.list.list-truyen .row';
            
            console.log(`Using selector: ${selector}`);
            const novelElements = parseHTML(html, selector);
            console.log(`Found ${novelElements.length} novel elements`);
            
            const novels = [];
            
            for (let i = 0; i < novelElements.length; i++) {
                try {
                    const element = novelElements[i];
                    
                    // Get title - check if we have the element and text
                    const titleElements = parseHTML(element.html, 'h3.truyen-title a');
                    if (!titleElements || titleElements.length === 0) {
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
                    
                    // Get cover image
                    let coverURL = null;
const coverElements = parseHTML(element.html, 'img.cover, .book img, img');
if (coverElements && coverElements.length > 0 && coverElements) {
    const coverElement = coverElements;
    coverURL = coverElement['data-src'] || coverElement.src;
    if (coverURL) {
        coverURL = this.resolveURL(coverURL);
        console.log(`Debug: Cover URL: ${coverURL}`);
    }
}
                    
                    // Get author - improved parsing for NovelFull's structure
                    let author = null;
                    const authorElements = parseHTML(element.html, '.author');
                    if (authorElements && authorElements.length > 0 && authorElements[0] && authorElements.text) {
                        let authorText = authorElements.text.trim();
                        // Remove the pencil icon and extra whitespace
                        authorText = authorText.replace(/^\s*\s*/, '').trim();
                        // Extract just the author name (everything after any icons/symbols)
                        const cleanAuthor = authorText.split(/\s{2,}/).pop(); // Get last part after multiple spaces
                        if (cleanAuthor && cleanAuthor.length > 1) {
                        author = cleanAuthor.trim();
                        }
                    }

                    console.log(`Debug: Raw author text: "${authorElements?.text}" -> Clean: "${author}"`);
                    
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
                    console.log(`Added novel: "${title}" by ${author || 'Unknown'}`);
                    
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
            
            // Basic parsing for novel details
            const titleElements = parseHTML(html, 'h3.title, .title, h1');
            const title = (titleElements && titleElements.length > 0 && titleElements[0].text) ? 
                titleElements[0].text.trim() : 'Unknown Title';
            
            const novel = {
                id: `novelfull_${Date.now()}`,
                title: title,
                author: null,
                synopsis: 'Synopsis will be loaded when viewing novel details',
                coverImageURL: null,
                sourcePlugin: this.id,
                novelURL: novelURL
            };
            
            return {
                novel: novel,
                chapters: [],
                totalChapters: 0,
                lastUpdated: new Date()
            };
            
        } catch (error) {
            console.log(`Error fetching novel details: ${error}`);
            throw error;
        }
    }

    async fetchChapterContent(chapterURL) {
        try {
            console.log(`Fetching chapter content from: ${chapterURL}`);
            const html = await fetch(chapterURL);
            
            const contentElements = parseHTML(html, '#chapter-content, .chapter-content');
            if (contentElements && contentElements.length > 0 && contentElements[0].text) {
                const content = contentElements.text.trim();
                if (content.length > 100) {
                    return content;
                }
            }
            
            return 'Chapter content could not be loaded';
            
        } catch (error) {
            console.log(`Error fetching chapter content: ${error}`);
            return 'Failed to load chapter content';
        }
    }
}
